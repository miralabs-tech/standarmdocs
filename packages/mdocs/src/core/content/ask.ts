import { createHash } from "node:crypto";
import { type AskEntry, askId, parseAsk } from "./ask-block";
import { plainMarkdown } from "./markdown-it";

export { type AskBlock, type AskEntry, type AskKind, parseAsk } from "./ask-block";

/**
 * Every ask fence of one file, in order, with where it sits and its hash.
 *
 * Takes the file's text and not its path, so it stays pure and the caller owns
 * the read. The lines it reports are the file's own, front matter included: a
 * tool that rewrites an answer addresses the file, never the page body. Found by
 * tokenizing rather than by scanning for backticks, so a fence nested in a list
 * or a quote counts and an ask quoted inside another code block does not.
 *
 * An id appearing twice in one file throws: the id is how an answer finds its
 * question, and two questions with one id make every rewrite a coin toss.
 */
export function askIndex(source: string): readonly AskEntry[] {
  const text = source.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const entries: AskEntry[] = [];
  const seen = new Set<string>();

  for (const token of plainMarkdown.parse(text, {})) {
    if (token.type !== "fence" || token.map === null) continue;
    const id = askId(token.info);
    if (id === null) continue;
    if (seen.has(id)) throw new Error(`ask "${id}": the id appears twice in this file`);
    seen.add(id);
    const [startLine, endLine] = token.map;
    const hash = createHash("sha256")
      .update(lines.slice(startLine, endLine).join("\n"))
      .digest("hex");
    entries.push({ block: parseAsk(id, token.content), startLine, endLine, hash });
  }
  return entries;
}

export type AskWriteCode = "not-found" | "stale" | "invalid";

/**
 * Why `writeAnswer` refused, as a code a server can map to a status.
 *
 * `hash` is set on `stale` only and is the hash the block has now, so a client
 * that lost the race can compare and retry without a second round trip.
 */
export class AskWriteError extends Error {
  readonly code: AskWriteCode;
  readonly hash: string | undefined;

  constructor(code: AskWriteCode, message: string, hash?: string) {
    super(message);
    this.name = "AskWriteError";
    this.code = code;
    this.hash = hash;
  }
}

/** What a reader answered: a list for `multi`, a string for every other kind. */
export interface AskUpdate {
  readonly answer: string | readonly string[];
  /** Absent or blank removes the `comment` key. */
  readonly comment?: string | undefined;
}

const FENCE_CLOSE = /^([\s>]*)(?:`{3,}|~{3,})\s*$/;
const FENCE_OPEN = /^(.*?)(?:`{3,}|~{3,})/;

function indentWidth(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * A value as the parser will read it back.
 *
 * The parser strips one pair of outer quotes and processes no escape, so a
 * quoted value is written verbatim between `"` and `"`: an embedded quote needs
 * no escape and a backslash would come back as a backslash. Quoted when verbatim
 * would not survive — padding, a `#`, a leading quote, a lone `|` (which opens a
 * block scalar) or nothing at all (which opens a list).
 */
function scalar(value: string): string {
  const risky =
    value === "" ||
    value !== value.trim() ||
    value.includes("#") ||
    /^["']/.test(value) ||
    value === "|";
  return risky ? `"${value}"` : value;
}

function render(key: string, value: string | readonly string[]): string[] {
  if (typeof value !== "string") return [`${key}:`, ...value.map((item) => `  - ${scalar(item)}`)];
  if (!value.includes("\n")) return [`${key}: ${scalar(value)}`];
  return [`${key}: |`, ...value.split("\n").map((line) => (line === "" ? "" : `  ${line}`))];
}

/** What a block scalar can hold: LF, no padding-only line, no trailing whitespace. */
function normalize(value: string): string {
  const text = value.replace(/\r\n?/g, "\n");
  if (!text.includes("\n")) return text;
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : line))
    .join("\n")
    .replace(/\s+$/, "");
}

interface Span {
  readonly key: string;
  readonly from: number;
  readonly to: number;
}

function spansOf(texts: readonly string[]): Span[] {
  const spans: Span[] = [];
  let index = 0;
  while (index < texts.length) {
    const text = texts[index] ?? "";
    const colon = text.indexOf(":");
    if (text.trim() === "" || text.trim().startsWith("#") || indentWidth(text) > 0 || colon < 1) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < texts.length) {
      const next = texts[end] ?? "";
      if (next.trim() !== "" && indentWidth(next) === 0) break;
      end += 1;
    }
    let last = end;
    while (last > index + 1 && (texts[last - 1] ?? "").trim() === "") last -= 1;
    spans.push({ key: text.slice(0, colon).trim(), from: index, to: last });
    index = end;
  }
  return spans;
}

function sameAnswer(
  actual: string | readonly string[] | undefined,
  wanted: string | readonly string[],
): boolean {
  if (typeof wanted === "string" || typeof actual === "string" || actual === undefined) {
    return actual === wanted;
  }
  return actual.length === wanted.length && actual.every((item, index) => item === wanted[index]);
}

/**
 * The file's text with one ask block's `answer`, `comment` and `answered` rewritten.
 *
 * Takes and returns text, so the caller owns the read, the write and the lock.
 * Only those three keys of the block's body change: an existing key is replaced
 * together with its continuation lines, a missing one is added before the closing
 * fence, and `comment` is dropped when blank. Every other line keeps its bytes,
 * line ending included; new lines take the ending of the opening fence's line.
 *
 * `expectedHash` is the hash the caller read the block under. A different one
 * means the block moved or changed since, and the write is refused rather than
 * landing on an answer to a question that is no longer the one on the page.
 *
 * The result is reparsed and compared with what was asked for before it is
 * returned, so a value this subset cannot carry — a multi-line item, a text whose
 * lines all share an indent — is an `invalid` and never a file that reads back as
 * something else.
 */
export function writeAnswer(
  source: string,
  id: string,
  expectedHash: string,
  update: AskUpdate,
): { readonly source: string; readonly hash: string } {
  const entries = indexOrInvalid(source);
  const entry = entries.find((candidate) => candidate.block.id === id);
  if (entry === undefined) {
    throw new AskWriteError("not-found", `ask "${id}": no such block in this file`);
  }
  if (entry.hash !== expectedHash) {
    throw new AskWriteError("stale", `ask "${id}": the block changed since it was read`, entry.hash);
  }

  const kind = entry.block.kind;
  let answer: string | readonly string[];
  if (typeof update.answer === "string") {
    if (kind === "multi") throw new AskWriteError("invalid", `ask "${id}": a multi answer is a list`);
    if (kind !== "text" && update.answer.includes("\n")) {
      throw new AskWriteError("invalid", `ask "${id}": the answer spans lines`);
    }
    answer = kind === "text" ? normalize(update.answer) : update.answer;
  } else {
    if (kind !== "multi") {
      throw new AskWriteError("invalid", `ask "${id}": only a multi answer is a list`);
    }
    if (update.answer.some((item) => item.includes("\n"))) {
      throw new AskWriteError("invalid", `ask "${id}": an item spans lines`);
    }
    answer = update.answer;
  }
  const comment =
    update.comment === undefined || update.comment.trim() === ""
      ? undefined
      : normalize(update.comment);

  const lines = source.split("\n");
  const open = lines[entry.startLine] ?? "";
  const cr = open.endsWith("\r") ? "\r" : "";
  const lastIndex = entry.endLine - 1;
  const closing =
    lastIndex > entry.startLine
      ? FENCE_CLOSE.exec((lines[lastIndex] ?? "").replace(/\r$/, ""))
      : null;
  const prefix =
    closing?.[1] ??
    (FENCE_OPEN.exec(open)?.[1] ?? "").replace(/[-*+]\s|\d+[.)]\s/g, (marker) =>
      " ".repeat(marker.length),
    );

  let close = closing === null ? entry.endLine : lastIndex;
  while (closing === null && close > entry.startLine + 1 && (lines[close - 1] ?? "").trim() === "") {
    close -= 1;
  }

  const body = lines.slice(entry.startLine + 1, close);
  const texts = body.map((raw) => {
    const text = raw.replace(/\r$/, "");
    if (text.startsWith(prefix)) return text.slice(prefix.length);
    return prefix.trim() === "" ? text.trimStart() : text;
  });
  const fresh = (text: string): string => `${text === "" ? prefix.trimEnd() : prefix + text}${cr}`;

  const edits = new Map<string, readonly string[] | null>([
    ["answer", render("answer", answer)],
    ["comment", comment === undefined ? null : render("comment", comment)],
    ["answered", ["answered: true"]],
  ]);
  const spans = spansOf(texts);
  const written = new Set<string>();
  const out: string[] = [];
  let index = 0;
  while (index < body.length) {
    const span = spans.find((candidate) => candidate.from === index && edits.has(candidate.key));
    if (span === undefined) {
      out.push(body[index] ?? "");
      index += 1;
      continue;
    }
    const replacement = edits.get(span.key);
    if (replacement !== null && replacement !== undefined && !written.has(span.key)) {
      out.push(...replacement.map(fresh));
      written.add(span.key);
    }
    index = span.to;
  }
  for (const [key, replacement] of edits) {
    if (replacement !== null && !written.has(key)) out.push(...replacement.map(fresh));
  }

  const next = [...lines.slice(0, entry.startLine + 1), ...out, ...lines.slice(close)].join("\n");
  const rewritten = indexOrInvalid(next).find((candidate) => candidate.block.id === id);
  if (
    rewritten === undefined ||
    !sameAnswer(rewritten.block.answer, answer) ||
    rewritten.block.comment !== comment ||
    !rewritten.block.answered
  ) {
    throw new AskWriteError("invalid", `ask "${id}": this answer cannot be written back as it was given`);
  }
  return { source: next, hash: rewritten.hash };
}

function indexOrInvalid(text: string): readonly AskEntry[] {
  try {
    return askIndex(text);
  } catch (error) {
    throw new AskWriteError("invalid", (error as Error).message);
  }
}
