/**
 * The ```ask fence: a body parsed strictly, a file indexed by line, and a page
 * that carries the question as a segment.
 *
 * The parser's errors are asserted by what they name, because they fire during
 * the build and a message that does not say which fence is a message that sends
 * an author searching. The index is asserted on lines and hashes, the two things
 * a tool rewriting an answer in place will trust.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { askIndex, parseAsk } from "../src/core/content/ask";
import { parseDirective } from "../src/core/content/fences";
import { parsePage } from "../src/core/content/markdown";
import type { ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

describe("parseAsk", () => {
  it("parses a yes/no question, quoted or verbatim", () => {
    const block = parseAsk("go", ['kind: yesno', 'question: "Ship it: now?"', "answer: yes", "answered: true"].join("\n"));
    expect(block).toEqual({
      id: "go",
      kind: "yesno",
      question: "Ship it: now?",
      options: [],
      answer: "yes",
      comment: undefined,
      answered: true,
    });
  });

  it("parses a choice with a list, and defaults to unanswered", () => {
    const block = parseAsk(
      "db",
      ["# which one", "kind: choice", "question: Which store?", "options:", "  - sqlite", '  - "postgres"', "  - 'files'"].join("\n"),
    );
    expect(block.options).toEqual(["sqlite", "postgres", "files"]);
    expect(block.answer).toBeUndefined();
    expect(block.answered).toBe(false);
  });

  it("parses a multi answer as a list of options", () => {
    const block = parseAsk(
      "m",
      ["kind: multi", "question: Which?", "options:", "  - a", "  - b", "  - c", "answer:", "  - a", "  - c"].join("\n"),
    );
    expect(block.answer).toEqual(["a", "c"]);
  });

  it("parses a text answer and a block scalar comment", () => {
    const block = parseAsk(
      "t",
      ["kind: text", "question: Why?", "answer: because", "comment: |", "  first line", "    indented", "", "  last", ""].join("\n"),
    );
    expect(block.answer).toBe("because");
    expect(block.comment).toBe("first line\n  indented\n\nlast");
  });

  it("accepts CRLF", () => {
    const block = parseAsk("c", "kind: text\r\nquestion: Why?\r\n");
    expect(block.question).toBe("Why?");
  });

  const failures: readonly (readonly [string, string, RegExp])[] = [
    ["a missing kind", "question: Q?", /missing "kind"/],
    ["a bad kind", "kind: radio\nquestion: Q?", /"kind" must be one of/],
    ["a missing question", "kind: text", /missing "question"/],
    ["a choice without options", "kind: choice\nquestion: Q?", /needs "options"/],
    ["a multi with an empty options key", "kind: multi\nquestion: Q?\noptions:", /needs "options"/],
    ["options on a yesno", "kind: yesno\nquestion: Q?\noptions:\n  - a", /not allowed/],
    ["options on a text", "kind: text\nquestion: Q?\noptions:\n  - a", /not allowed/],
    ["an answer outside the options", "kind: choice\nquestion: Q?\noptions:\n  - a\nanswer: b", /not one of the options/],
    ["a multi answer outside the options", "kind: multi\nquestion: Q?\noptions:\n  - a\nanswer:\n  - z", /not one of the options/],
    ["a yesno answer that is neither", "kind: yesno\nquestion: Q?\nanswer: maybe", /yes or no/],
    ["a multi answer that is not a list", "kind: multi\nquestion: Q?\noptions:\n  - a\nanswer: a", /must be a list/],
    ["an unknown key", "kind: text\nquestion: Q?\nowner: me", /unknown key "owner"/],
    ["a repeated key", "kind: text\nkind: text\nquestion: Q?", /appears twice/],
    ["a bad answered flag", "kind: text\nquestion: Q?\nanswered: soon", /true or false/],
  ];

  it.each(failures)("throws on %s, naming the id", (_name, body, reason) => {
    expect(() => parseAsk("the-id", body)).toThrow(/ask "the-id"/);
    expect(() => parseAsk("the-id", body)).toThrow(reason);
  });
});

describe("askIndex", () => {
  const ONE = ["kind: yesno", "question: First?", "answer: no", "answered: true"];
  const TWO = ["kind: choice", "question: Second?", "options:", "  - a", "  - b"];

  const file = (prose = "Some prose.", eol = "\n"): string =>
    [
      "---",
      "title: Notes",
      "---",
      "",
      prose,
      "",
      "```ask id=first",
      ...ONE,
      "```",
      "",
      "Between.",
      "",
      "```ask id=second",
      ...TWO,
      "```",
      "",
    ].join(eol);

  it("reports the line range of each fence, end exclusive", () => {
    const entries = askIndex(file());
    expect(entries.map((entry) => entry.block.id)).toEqual(["first", "second"]);
    expect(entries[0]).toMatchObject({ startLine: 6, endLine: 12 });
    expect(entries[1]).toMatchObject({ startLine: 15, endLine: 22 });
    const lines = file().split("\n");
    expect(lines[entries[0]?.startLine ?? 0]).toBe("```ask id=first");
    expect(lines[(entries[0]?.endLine ?? 0) - 1]).toBe("```");
  });

  it("reports the same ranges and hashes for CRLF input", () => {
    expect(askIndex(file("Some prose.", "\r\n"))).toEqual(askIndex(file()));
  });

  it("keeps the hash when prose outside the fence changes", () => {
    const before = askIndex(file("Some prose."));
    const after = askIndex(file("Rewritten prose.\n\nAnd a second paragraph."));
    expect(after.map((entry) => entry.hash)).toEqual(before.map((entry) => entry.hash));
  });

  it("changes the hash when the body changes, and only that block's", () => {
    const before = askIndex(file());
    const after = askIndex(file().replace("answer: no", "answer: yes"));
    expect(after[0]?.hash).not.toBe(before[0]?.hash);
    expect(after[1]?.hash).toBe(before[1]?.hash);
    expect(before[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("finds a fence nested in a list", () => {
    const source = ["- item", "", "  ```ask id=nested", "  kind: text", "  question: Why?", "  ```", ""].join("\n");
    const [entry] = askIndex(source);
    expect(entry?.block.id).toBe("nested");
    expect(entry).toMatchObject({ startLine: 2, endLine: 6 });
  });

  it("ignores an ask quoted inside another code block", () => {
    const source = ["````md", "```ask id=quoted", "kind: text", "question: Why?", "```", "````", ""].join("\n");
    expect(askIndex(source)).toEqual([]);
  });

  it("throws on a duplicate id, naming it", () => {
    const source = ["```ask id=dup", ...ONE, "```", "", "```ask id=dup", ...ONE, "```"].join("\n");
    expect(() => askIndex(source)).toThrow(/ask "dup"/);
  });

  it("throws on an invalid body, naming the id", () => {
    expect(() => askIndex("```ask id=bad\nkind: nope\nquestion: Q?\n```")).toThrow(/ask "bad"/);
  });
});

describe("an ask fence in a page", () => {
  const route = "/notes";
  const CHROME: ChromeProps = { categories: [], entries: [], current: route, degraded: null };

  it("becomes an ask segment", () => {
    const page = parsePage(
      ["Intro.", "", "```ask id=go", "kind: yesno", "question: Ship it?", "```", "", "Outro."].join("\n"),
      { route },
    );
    expect(page.segments.map((segment) => segment.kind)).toEqual(["html", "ask", "html"]);
    const segment = page.segments[1];
    expect(segment?.kind === "ask" && segment.block.question).toBe("Ship it?");
  });

  it("fails the build on an invalid body, naming the id", () => {
    expect(() =>
      parsePage("```ask id=broken\nkind: nope\nquestion: Q?\n```", { route }),
    ).toThrow(/ask "broken"/);
  });

  it("leaves an ask without a valid id as a plain code block", () => {
    for (const info of ["ask", "ask go", "ask id=", "ask id=Bad_Id", "ask id=a extra=b"]) {
      expect(parseDirective(info)).toBeNull();
      const page = parsePage(`\`\`\`${info}\nkind: nope\n\`\`\``, { route });
      expect(page.segments.map((segment) => segment.kind)).toEqual(["html"]);
    }
  });

  it("renders as read-only HTML with the chosen option and the state marked", () => {
    const page = parsePage(
      [
        "```ask id=db",
        "kind: choice",
        "question: Which store?",
        "options:",
        "  - sqlite",
        "  - files",
        "answer: files",
        "comment: simpler",
        "answered: true",
        "```",
      ].join("\n"),
      { route },
    );
    const html = renderToStaticMarkup(
      createElement(Page, { model: page, chrome: CHROME, demos: {}, api: {} }),
    );
    expect(html).toContain('data-ask-id="db"');
    expect(html).toContain('data-ask-state="answered"');
    expect(html).toContain("Which store?");
    expect(html).toMatch(/<li data-chosen="true" aria-current="true">files<\/li>/);
    expect(html).toContain("<li>sqlite</li>");
    expect(html).toContain("simpler");
  });
});
