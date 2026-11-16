/**
 * Who gets to colour a fence, and which fences are never offered.
 *
 * `markdown.ts` built one MarkdownIt with no `highlight`, so every fenced block on
 * the site rendered as plain text — forty of them across the ported pages, thirty
 * eight of which are `tsx`. The Astro site had Shiki through Starlight's `<Code>`,
 * and losing it was not a decision anyone took.
 *
 * The second assertion is the one that would rot quietly: ```demo and ```props are
 * directives, not code. They are removed from the token stream before it is
 * rendered, and a highlighter that ever sees one means the interception broke.
 */

import { describe, expect, it } from "vitest";
import { parsePage } from "../src/core/content/markdown";

const SOURCE = `---
title: Thing
---

Prose first.

\`\`\`tsx
const answer = 42;
\`\`\`

\`\`\`demo dialog-basic
\`\`\`

\`\`\`props dialog
\`\`\`

\`\`\`sh
bun add ./thing.tgz
\`\`\`
`;

function html(model: ReturnType<typeof parsePage>): string {
  return model.segments.map((segment) => (segment.kind === "html" ? segment.html : "")).join("\n");
}

describe("fenced code", () => {
  it("is handed to the highlighter, language and all", () => {
    const seen: { code: string; lang: string }[] = [];
    const model = parsePage(SOURCE, {
      route: "/thing",
      highlight: (code, lang) => {
        seen.push({ code, lang });
        return `<pre data-lang="${lang}">coloured</pre>`;
      },
    });

    expect(seen.map((one) => one.lang)).toEqual(["tsx", "sh"]);
    expect(seen[0]?.code).toContain("const answer = 42;");
    expect(html(model)).toContain('<pre data-lang="tsx">coloured</pre>');
    expect(html(model)).toContain('<pre data-lang="sh">coloured</pre>');
  });

  it("never offers a directive to the highlighter", () => {
    const langs: string[] = [];
    parsePage(SOURCE, {
      route: "/thing",
      highlight: (_code, lang) => {
        langs.push(lang);
        return "";
      },
    });
    expect(langs).not.toContain("demo");
    expect(langs).not.toContain("props");
  });

  it("still renders a page with no highlighter, as plain markup", () => {
    const model = parsePage(SOURCE, { route: "/thing" });
    expect(html(model)).toContain("const answer = 42;");
    expect(model.segments.filter((segment) => segment.kind === "demo")).toHaveLength(1);
  });
});
