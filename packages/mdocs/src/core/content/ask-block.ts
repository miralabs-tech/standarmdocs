/** The four shapes a question can take, and the whole vocabulary of `kind:`. */
export type AskKind = "yesno" | "choice" | "multi" | "text";

/**
 * One question put to the reader of a page, as its author wrote it in an
 * ```ask fence.
 *
 * `answer` is a string for `yesno`, `choice` and `text`, a list for `multi`, and
 * absent until someone answers. `answered` is stated and not derived from
 * `answer`: a text question answered with an empty string and a question nobody
 * has opened are different facts, and a file that says which one it is can be
 * rewritten in place without guessing.
 */
export interface AskBlock {
  readonly id: string;
  readonly kind: AskKind;
  readonly question: string;
  /** Empty for `yesno` and `text`, which take no options, non-empty otherwise. */
  readonly options: readonly string[];
  readonly answer: string | readonly string[] | undefined;
  readonly comment: string | undefined;
  readonly answered: boolean;
}

/**
 * Where one ask fence sits in its file, and a fingerprint of exactly that text.
 *
 * `startLine` is the opening fence's line and `endLine` the line *after* the
 * closing one, both 0-based, so `lines.slice(startLine, endLine)` is the whole
 * fence. `hash` covers those lines and nothing around them: a tool that rewrites
 * an answer in place compares it before writing and refuses when the block moved
 * under it, while an edit to the prose elsewhere in the file leaves it untouched.
 */
export interface AskEntry {
  readonly block: AskBlock;
  readonly startLine: number;
  readonly endLine: number;
  readonly hash: string;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
const INFO = /^ask\s+id=(\S+)$/;
const KINDS: ReadonlySet<string> = new Set<AskKind>(["yesno", "choice", "multi", "text"]);
const KEYS: ReadonlySet<string> = new Set([
  "kind",
  "question",
  "options",
  "answer",
  "comment",
  "answered",
]);

/**
 * The id of an ```ask fence from its info string, or null when it is not one.
 *
 * Lives here and not in `fences.ts` so that module can import this one without
 * the import running both ways.
 */
export function askId(info: string): string | null {
  const id = INFO.exec(info.trim())?.[1];
  return id !== undefined && ID.test(id) ? id : null;
}

type Raw = string | readonly string[];

function unquote(raw: string): string {
  const quoted = /^(["'])([\s\S]*)\1$/.exec(raw);
  return quoted?.[2] ?? raw;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function readEntries(id: string, body: string): Map<string, Raw> {
  const fail = (reason: string): never => {
    throw new Error(`ask "${id}": ${reason}`);
  };
  const lines = body.split(/\r?\n/);
  const entries = new Map<string, Raw>();
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    index += 1;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (indentOf(line) > 0) fail(`unexpected indented line "${trimmed}"`);
    const colon = line.indexOf(":");
    const key = colon === -1 ? "" : line.slice(0, colon).trim();
    if (key === "") fail(`expected "key: value", got "${trimmed}"`);
    if (!KEYS.has(key)) fail(`unknown key "${key}"`);
    if (entries.has(key)) fail(`key "${key}" appears twice`);
    const rest = line.slice(colon + 1).trim();

    if (rest === "|") {
      const block: string[] = [];
      while (index < lines.length) {
        const next = lines[index] ?? "";
        if (next.trim() !== "" && indentOf(next) === 0) break;
        block.push(next);
        index += 1;
      }
      const filled = block.filter((entry) => entry.trim() !== "");
      const margin = Math.min(...filled.map(indentOf));
      const text = block.map((entry) => entry.slice(Math.min(margin, indentOf(entry)))).join("\n");
      entries.set(key, text.replace(/\s+$/, ""));
      continue;
    }

    if (rest === "") {
      const items: string[] = [];
      while (index < lines.length) {
        const next = lines[index] ?? "";
        const nextTrimmed = next.trim();
        if (nextTrimmed === "" || nextTrimmed.startsWith("#")) {
          index += 1;
          continue;
        }
        if (indentOf(next) === 0) break;
        const item = /^-\s+(.*)$/.exec(nextTrimmed);
        if (item?.[1] === undefined) fail(`expected "- item" under "${key}", got "${nextTrimmed}"`);
        items.push(unquote((item?.[1] ?? "").trim()));
        index += 1;
      }
      entries.set(key, items.length === 0 ? "" : items);
      continue;
    }

    entries.set(key, unquote(rest));
  }
  return entries;
}

/**
 * The body of an ```ask fence as a block, or an Error saying which fence and why.
 *
 * A small YAML subset and no YAML dependency, for the reason the front matter has
 * none: a scalar (`key: value`, quoted or verbatim to the end of the line), a
 * block scalar (`key: |` and indented lines) and a list (`key:` and indented
 * `- item` lines) are the whole of it. It throws rather than guessing, because it
 * runs during the build and a question that silently lost its options is worse
 * than a build that stops.
 */
export function parseAsk(id: string, body: string): AskBlock {
  const fail = (reason: string): never => {
    throw new Error(`ask "${id}": ${reason}`);
  };
  const entries = readEntries(id, body);

  const text = (key: string): string | undefined => {
    const value = entries.get(key);
    if (value === undefined) return undefined;
    if (typeof value !== "string") return fail(`"${key}" must be a single value, not a list`);
    return value;
  };

  const kind = text("kind");
  if (kind === undefined) fail('missing "kind"');
  if (kind === undefined || !KINDS.has(kind)) {
    fail(`"kind" must be one of yesno, choice, multi, text, got "${kind}"`);
  }

  const question = text("question");
  if (question === undefined || question === "") fail('missing "question"');

  const rawOptions = entries.get("options");
  const hasOptions = kind === "choice" || kind === "multi";
  if (rawOptions !== undefined && !hasOptions) fail(`"options" is not allowed for kind "${kind}"`);
  if (hasOptions && (rawOptions === undefined || typeof rawOptions === "string")) {
    fail(`kind "${kind}" needs "options" as a non-empty list`);
  }
  const options: readonly string[] = typeof rawOptions === "string" ? [] : (rawOptions ?? []);

  const rawAnswer = entries.get("answer");
  let answer: string | readonly string[] | undefined;
  if (rawAnswer !== undefined) {
    if (kind === "multi") {
      const picked = typeof rawAnswer === "string" ? (rawAnswer === "" ? [] : null) : rawAnswer;
      if (picked === null) fail('"answer" must be a list for kind "multi"');
      for (const entry of picked ?? []) {
        if (!options.includes(entry)) fail(`answer "${entry}" is not one of the options`);
      }
      answer = picked ?? [];
    } else {
      if (typeof rawAnswer !== "string") fail(`"answer" must be a single value for kind "${kind}"`);
      const value = typeof rawAnswer === "string" ? rawAnswer : "";
      if (kind === "yesno" && value !== "yes" && value !== "no") {
        fail(`"answer" must be yes or no, got "${value}"`);
      }
      if (kind === "choice" && !options.includes(value)) {
        fail(`answer "${value}" is not one of the options`);
      }
      answer = value;
    }
  }

  const flag = text("answered");
  if (flag !== undefined && flag !== "true" && flag !== "false") {
    fail(`"answered" must be true or false, got "${flag}"`);
  }

  return {
    id,
    kind: kind as AskKind,
    question: question ?? "",
    options,
    answer,
    comment: text("comment"),
    answered: flag === "true",
  };
}
