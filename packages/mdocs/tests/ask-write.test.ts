/**
 * `writeAnswer`: the one function that edits a file an author wrote by hand.
 *
 * Asserted on three things a rewrite can get wrong without anyone noticing: that
 * the value reads back exactly as it was given, that nothing outside the three
 * keys moved by a byte, and that a refusal says why in a code a server can map.
 */

import { describe, expect, it } from "vitest";
import { askIndex, AskWriteError, parseAsk, writeAnswer } from "../src/core/content/ask";

const YESNO = ["```ask id=go", "kind: yesno", "question: Ship it?", "```"];
const CHOICE = [
  "```ask id=db",
  "kind: choice",
  "question: Which store?",
  "options:",
  "  - sqlite",
  "  - files",
  "```",
];
const MULTI = [
  "```ask id=m",
  "kind: multi",
  "question: Which?",
  "options:",
  "  - a",
  "  - b",
  "  - c",
  "```",
];
const TEXT = ["```ask id=why", "kind: text", "question: Why?", "```"];

function file(block: readonly string[], eol = "\n"): string {
  return ["# Notes", "", "Before.", "", ...block, "", "After.", ""].join(eol);
}

function only(source: string, id: string): ReturnType<typeof askIndex>[number] {
  const entry = askIndex(source).find((candidate) => candidate.block.id === id);
  if (entry === undefined) throw new Error(`no ${id}`);
  return entry;
}

function write(
  source: string,
  id: string,
  update: Parameters<typeof writeAnswer>[3],
): ReturnType<typeof writeAnswer> {
  return writeAnswer(source, id, only(source, id).hash, update);
}

function refusal(run: () => unknown): AskWriteError {
  try {
    run();
  } catch (error) {
    if (error instanceof AskWriteError) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("writeAnswer", () => {
  it("adds answer and answered to a yes/no question, before the closing fence", () => {
    const source = file(YESNO);
    const result = write(source, "go", { answer: "yes" });
    expect(result.source).toBe(
      file(["```ask id=go", "kind: yesno", "question: Ship it?", "answer: yes", "answered: true", "```"]),
    );
    const block = only(result.source, "go").block;
    expect(block).toMatchObject({ answer: "yes", answered: true, comment: undefined });
    expect(only(result.source, "go").hash).toBe(result.hash);
  });

  it("writes a choice, a multi list and a multi-line text", () => {
    expect(only(write(file(CHOICE), "db", { answer: "files" }).source, "db").block.answer).toBe("files");

    const multi = write(file(MULTI), "m", { answer: ["a", "c"] });
    expect(multi.source).toContain(["answer:", "  - a", "  - c", "answered: true"].join("\n"));
    expect(only(multi.source, "m").block.answer).toEqual(["a", "c"]);

    const text = write(file(TEXT), "why", { answer: "first\n\n  second: x", comment: "meh" });
    expect(text.source).toContain(["answer: |", "  first", "", "    second: x", "comment: meh"].join("\n"));
    expect(only(text.source, "why").block).toMatchObject({
      answer: "first\n\n  second: x",
      comment: "meh",
    });
  });

  it("replaces an existing list answer with its continuation lines", () => {
    const block = [...MULTI.slice(0, -1), "answer:", "  - a", "  - b", "comment: old", "answered: false", "```"];
    const result = write(file(block), "m", { answer: ["c"], comment: "new" });
    expect(result.source).toBe(
      file([...MULTI.slice(0, -1), "answer:", "  - c", "comment: new", "answered: true", "```"]),
    );
  });

  it("replaces an existing block scalar, and keeps the keys after it", () => {
    const block = [...TEXT.slice(0, -1), "answer: |", "  one", "  two", "", "answered: false", "```"];
    const result = write(file(block), "why", { answer: "short" });
    expect(result.source).toBe(
      file([...TEXT.slice(0, -1), "answer: short", "", "answered: true", "```"]),
    );
  });

  it("removes the comment when it is absent or blank", () => {
    const block = [...YESNO.slice(0, -1), "answer: no", "comment: |", "  a", "  b", "answered: true", "```"];
    for (const comment of [undefined, "", "  "]) {
      const result = write(file(block), "go", { answer: "yes", comment });
      expect(result.source).toBe(file([...YESNO.slice(0, -1), "answer: yes", "answered: true", "```"]));
      expect(only(result.source, "go").block.comment).toBeUndefined();
    }
  });

  it("keeps CRLF, and leaves every byte outside the block alone", () => {
    const source = file(CHOICE, "\r\n");
    const entry = only(source, "db");
    const result = writeAnswer(source, "db", entry.hash, { answer: "sqlite", comment: "ok" });
    expect(result.source).toBe(
      file([...CHOICE.slice(0, -1), "answer: sqlite", "comment: ok", "answered: true", "```"], "\r\n"),
    );
    expect(result.source.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);

    const lines = source.split("\n");
    const after = result.source.split("\n");
    expect(after.slice(0, entry.startLine + 1)).toEqual(lines.slice(0, entry.startLine + 1));
    expect(after.slice(-(lines.length - entry.endLine + 1))).toEqual(lines.slice(entry.endLine - 1));
  });

  it("keeps a file with mixed endings and a missing final newline byte for byte outside the block", () => {
    const source = `${["# T", "", "Prose  ", "", ...YESNO].join("\r\n")}\r\nlast\ntail`;
    const result = write(source, "go", { answer: "no" });
    expect(result.source.startsWith("# T\r\n\r\nProse  \r\n\r\n```ask id=go\r\n")).toBe(true);
    expect(result.source.endsWith("```\r\nlast\ntail")).toBe(true);
  });

  it("writes into a fence nested in a list, at its indent", () => {
    const source = ["- item", "", "  ```ask id=nested", "  kind: text", "  question: Why?", "  ```", ""].join("\n");
    const result = write(source, "nested", { answer: "because" });
    expect(result.source).toBe(
      ["- item", "", "  ```ask id=nested", "  kind: text", "  question: Why?", "  answer: because", "  answered: true", "  ```", ""].join("\n"),
    );
  });

  it("finds a block by id among several, and leaves the others' hashes", () => {
    const source = ["```ask id=one", "kind: yesno", "question: A?", "```", "", ...YESNO.map((l) => l.replace("go", "two")), ""].join("\n");
    const before = askIndex(source);
    const result = write(source, "two", { answer: "yes" });
    expect(only(result.source, "one").hash).toBe(before[0]?.hash);
    expect(only(result.source, "two").block.answer).toBe("yes");
  });

  it("answers the same question twice with the new hash", () => {
    const first = write(file(YESNO), "go", { answer: "yes" });
    const second = writeAnswer(first.source, "go", first.hash, { answer: "no" });
    expect(only(second.source, "go").block.answer).toBe("no");
  });

  it("refuses an unknown id", () => {
    expect(refusal(() => writeAnswer(file(YESNO), "nope", "x", { answer: "yes" })).code).toBe("not-found");
  });

  it("refuses a stale hash, and reports the current one", () => {
    const source = file(YESNO);
    const error = refusal(() => writeAnswer(source, "go", "0".repeat(64), { answer: "yes" }));
    expect(error.code).toBe("stale");
    expect(error.hash).toBe(only(source, "go").hash);
  });

  it("refuses an answer the question does not allow", () => {
    const cases: readonly [string, string, string | readonly string[]][] = [
      [file(CHOICE), "db", "mongo"],
      [file(YESNO), "go", "maybe"],
      [file(MULTI), "m", ["a", "z"]],
      [file(MULTI), "m", "a"],
      [file(YESNO), "go", ["yes"]],
      [file(CHOICE), "db", "sqlite\nfiles"],
      [file(MULTI), "m", ["a\nb"]],
    ];
    for (const [source, id, answer] of cases) {
      expect(refusal(() => write(source, id, { answer })).code).toBe("invalid");
    }
  });

  it("refuses a file whose fences do not parse", () => {
    const source = ["```ask id=bad", "kind: nope", "question: Q?", "```"].join("\n");
    expect(refusal(() => writeAnswer(source, "bad", "x", { answer: "yes" })).code).toBe("invalid");
  });

  it("refuses a text its subset cannot carry", () => {
    expect(refusal(() => write(file(TEXT), "why", { answer: "  a\n  b" })).code).toBe("invalid");
  });
});

describe("writeAnswer round trip", () => {
  const VALUES = [
    "plain",
    "",
    " leading",
    "trailing ",
    "has # hash",
    "# starts with hash",
    "key: value: more",
    'say "hi" now',
    '"quoted"',
    "'single'",
    "'",
    '"',
    "|",
    "back\\slash",
    "a: b # c",
    "line one\nline two",
    "line one\n\nline three",
    "  indented first\nsecond",
    "one\n    deep\ntwo",
    "# not a comment\nreally: not a key",
    "- not a list\n- at all",
  ];

  it("gives back a text answer exactly, whatever it contains", () => {
    for (const value of VALUES) {
      const result = write(file(TEXT), "why", { answer: value, comment: value });
      const block = parseAsk("why", askBody(result.source));
      expect(block.answer, JSON.stringify(value)).toBe(value);
      expect(block.comment, JSON.stringify(value)).toBe(value === "" ? undefined : value);
    }
  });

  it("gives back multi items exactly, whatever they contain", () => {
    const options = ["plain", " padded ", "has # hash", "a: b", '"q"', "|", "'"];
    const block = ["```ask id=m", "kind: multi", "question: Which?", "options:", ...options.map((o) => `  - "${o}"`), "```"];
    const source = file(block);
    expect(only(source, "m").block.options).toEqual(options);
    const result = write(source, "m", { answer: options });
    expect(only(result.source, "m").block.answer).toEqual(options);
    const none = write(source, "m", { answer: [] });
    expect(only(none.source, "m").block.answer).toEqual([]);
  });

  it("trims what a block scalar cannot keep, and says nothing", () => {
    const result = write(file(TEXT), "why", { answer: "a\r\nb  \n \n" });
    expect(only(result.source, "why").block.answer).toBe("a\nb");
  });
});

function askBody(source: string): string {
  const lines = source.split("\n");
  const [entry] = askIndex(source);
  if (entry === undefined) throw new Error("no ask");
  return lines.slice(entry.startLine + 1, entry.endLine - 1).join("\n");
}
