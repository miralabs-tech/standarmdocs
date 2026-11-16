/**
 * The plain-Markdown view of a page, and the two files a site publishes for
 * readers that have no browser. Pure text in and out, so nothing here touches the
 * disk: the fences are rewritten in the source, and what the author wrote around
 * them has to survive untouched.
 */

import { describe, expect, it } from "vitest";
import {
  apiTableMarkdown,
  type LlmsEntry,
  type LlmsPlacement,
  llmsFull,
  llmsTxt,
  pageHref,
  pageMarkdown,
} from "../src/core/content/llms";
import { parsePage } from "../src/core/content/markdown";
import { type ApiTable, type PageModel, withoutAsks } from "../src/core/model";

const ASK = ["```ask id=store", "kind: choice", "question: Which?", "options:", "  - a", "  - b", "```"];

const ENTRIES: readonly LlmsEntry[] = [
  { route: "/", title: "Home", group: undefined, description: "The front page" },
  { route: "/forms/input", title: "Input", group: "forms", description: "A text field" },
  { route: "/forms/select", title: "Select", group: "forms", description: undefined },
  { route: "/overlays/dialog", title: "Dialog", group: "overlays", description: "A surface" },
];

const MODEL = { title: "Dialog", description: "A portalled surface" };

function render(source: string, api = {}, entries = ENTRIES): string {
  return pageMarkdown(source, MODEL, { api, entries });
}

describe("the head of a page", () => {
  it("opens on the title and the description, and drops the front matter", () => {
    const text = render("---\ntitle: Dialog\ndescription: A portalled surface\n---\n\nProse.\n");
    expect(text).toBe("# Dialog\n\n> A portalled surface\n\nProse.\n");
  });

  it("takes a page's title from its leading # when the front matter names none, and writes it once", () => {
    const source = "# Plan\n\nProse.\n";
    const model = parsePage(source, { route: "/plan", group: undefined });
    expect(model.title).toBe("Plan");
    expect(JSON.stringify(model.segments)).not.toContain("<h1>");
    const text = pageMarkdown(source, { title: model.title, description: undefined }, { api: {}, entries: ENTRIES });
    expect(text).toBe("# Plan\n\nProse.\n");
  });

  it("keeps the front matter's title and the body's heading when both are written", () => {
    const model = parsePage("---\ntitle: Dialog\n---\n\n# Usage\n", { route: "/dialog", group: undefined });
    expect(model.title).toBe("Dialog");
    expect(JSON.stringify(model.segments)).toContain("<h1>Usage</h1>");
  });

  it("falls back on the route when the page opens on no heading", () => {
    expect(parsePage("Prose.\n", { route: "/plan", group: undefined }).title).toBe("/plan");
  });

  it("leaves the description line out when the page has none", () => {
    const text = pageMarkdown("Prose.\n", { title: "Dialog", description: undefined }, { api: {}, entries: [] });
    expect(text).toBe("# Dialog\n\nProse.\n");
  });

  it("reads a CRLF source as LF", () => {
    const text = render("---\r\ntitle: Dialog\r\n---\r\n\r\nOne.\r\n\r\n```demo x\r\n```\r\n\r\nTwo.\r\n");
    expect(text).not.toContain("\r");
    expect(text).toBe("# Dialog\n\n> A portalled surface\n\nOne.\n\nTwo.\n");
  });
});

describe("the fences that are dropped", () => {
  it("removes an ask, and the blank line it leaves", () => {
    const text = render(["Before.", "", ...ASK, "", "After.", ""].join("\n"));
    expect(text).toBe("# Dialog\n\n> A portalled surface\n\nBefore.\n\nAfter.\n");
  });

  it("removes a demo, and the blank line it leaves", () => {
    const text = render("Before.\n\n```demo dialog-basic\n```\n\nAfter.\n");
    expect(text).toBe("# Dialog\n\n> A portalled surface\n\nBefore.\n\nAfter.\n");
  });

  it("collapses a run of dropped fences into one gap", () => {
    const text = render(["A.", "", ...ASK, "", "```demo x", "```", "", "B."].join("\n"));
    expect(text).toBe("# Dialog\n\n> A portalled surface\n\nA.\n\nB.\n");
  });

  it("leaves nothing when the whole body was a directive", () => {
    expect(render("```demo x\n```\n")).toBe("# Dialog\n\n> A portalled surface\n");
  });

  it("keeps an ask without a valid id, because that is only a code block", () => {
    expect(render("```ask\nnot a directive\n```\n")).toContain("not a directive");
  });
});

describe("the fences that are kept", () => {
  it("keeps any other fence verbatim, a directive-looking one inside it included", () => {
    const source = ["```tsx", "const a = 1;", "```", "", "````md", "```demo inside", "```", "````", ""].join("\n");
    const text = render(source);
    expect(text).toContain("```tsx\nconst a = 1;\n```");
    expect(text).toContain("````md\n```demo inside\n```\n````");
  });
});

describe("props", () => {
  const table: ApiTable = {
    name: "DialogProps",
    extends: "BaseProps",
    definition: null,
    rows: [
      { name: "open?", type: "boolean", notes: "Controlled.", source: null },
      { name: "role?", type: '"dialog" | "alertdialog"', notes: "One of `two`\nvalues | no more", source: null },
      { name: "id", type: "string", notes: null, source: null },
    ],
  };

  it("becomes a heading, its extends line and a pipe table with the cells escaped", () => {
    expect(apiTableMarkdown(table)).toBe(
      [
        "### DialogProps",
        "",
        "`extends BaseProps`",
        "",
        "| Name | Type | Notes |",
        "| --- | --- | --- |",
        "| `open?` | `boolean` | Controlled. |",
        '| `role?` | `"dialog" \\| "alertdialog"` | One of `two`<br>values \\| no more |',
        "| `id` | `string` | — |",
      ].join("\n"),
    );
  });

  it("replaces the fence with one section per table", () => {
    const second: ApiTable = { name: "Other", extends: null, definition: null, rows: table.rows.slice(0, 1) };
    const text = render("Intro.\n\n```props dialog\n```\n\nOutro.\n", { dialog: [table, second] });
    expect(text).toContain("Intro.\n\n### DialogProps\n");
    expect(text).toContain("### Other\n\n| Name | Type | Notes |");
    expect(text.endsWith("| `open?` | `boolean` | Controlled. |\n\nOutro.\n")).toBe(true);
  });

  it("cuts the rows into runs, each behind its bold group line", () => {
    const grouped: ApiTable = {
      name: "Grouped",
      extends: null,
      definition: null,
      rows: [
        { name: "a", type: "A", notes: null, source: null },
        { name: "b", type: "B", notes: null, source: null, group: "First" },
        { name: "c", type: "C", notes: null, source: null, group: "First" },
        { name: "d", type: "D", notes: null, source: null, group: "`Second`" },
      ],
    };
    const text = apiTableMarkdown(grouped);
    expect(text.split("\n\n")).toEqual([
      "### Grouped",
      "| Name | Type | Notes |\n| --- | --- | --- |\n| `a` | `A` | — |",
      "**First**",
      "| Name | Type | Notes |\n| --- | --- | --- |\n| `b` | `B` | — |\n| `c` | `C` | — |",
      "**`Second`**",
      "| Name | Type | Notes |\n| --- | --- | --- |\n| `d` | `D` | — |",
    ]);
  });

  it("states an empty table in one line, as the page does", () => {
    expect(apiTableMarkdown({ name: "Alias", extends: null, definition: "A | B", rows: [] })).toBe(
      "### Alias\n\n`= A | B`",
    );
    expect(apiTableMarkdown({ name: "Child", extends: "Parent", definition: null, rows: [] })).toBe(
      "### Child\n\n`extends Parent`",
    );
    expect(apiTableMarkdown({ name: "Bare", extends: null, definition: null, rows: [] })).toBe("### Bare");
  });

  it("drops the fence when no table has that name", () => {
    expect(render("Before.\n\n```props missing\n```\n\nAfter.\n")).toBe(
      "# Dialog\n\n> A portalled surface\n\nBefore.\n\nAfter.\n",
    );
  });
});

describe("index", () => {
  it("becomes a list of the pages of its group, with their descriptions", () => {
    const text = render("```index forms\n```\n");
    expect(text).toBe(
      "# Dialog\n\n> A portalled surface\n\n- [Input](/forms/input/index.md): A text field\n- [Select](/forms/select/index.md)\n",
    );
  });

  it("refuses a group that matches no page, like the page does", () => {
    expect(() => render("```index nowhere\n```\n")).toThrowError(/matches no page/);
  });
});

describe("pageHref", () => {
  it("serves the root and a nested route beside their index.html", () => {
    expect(pageHref("/")).toBe("/index.md");
    expect(pageHref("/forms/input")).toBe("/forms/input/index.md");
  });
});

const PLACEMENT: LlmsPlacement = {
  lead: [ENTRIES[0] as LlmsEntry],
  sections: [
    { category: { label: "Forms" }, items: [ENTRIES[1] as LlmsEntry, ENTRIES[2] as LlmsEntry] },
    { category: { label: "Overlays" }, items: [ENTRIES[3] as LlmsEntry] },
  ],
};

describe("llms.txt", () => {
  it("lists the lead pages, then one section per category in sidebar order", () => {
    expect(llmsTxt({ name: "MiraLabs UI", description: "Components." }, PLACEMENT)).toBe(
      [
        "# MiraLabs UI",
        "",
        "> Components.",
        "",
        "- [Home](/index.md): The front page",
        "",
        "## Forms",
        "",
        "- [Input](/forms/input/index.md): A text field",
        "- [Select](/forms/select/index.md)",
        "",
        "## Overlays",
        "",
        "- [Dialog](/overlays/dialog/index.md): A surface",
        "",
      ].join("\n"),
    );
  });

  it("has no summary line and no lead list when there is neither", () => {
    const text = llmsTxt({ name: "Notes" }, { lead: [], sections: [PLACEMENT.sections[1] as never] });
    expect(text).toBe("# Notes\n\n## Overlays\n\n- [Dialog](/overlays/dialog/index.md): A surface\n");
  });

  it("escapes brackets in a title", () => {
    const text = llmsTxt(
      { name: "Notes" },
      { lead: [{ route: "/x", title: "A [b]", description: undefined }], sections: [] },
    );
    expect(text).toContain("- [A \\[b\\]](/x/index.md)");
  });
});

describe("llms-full.txt", () => {
  it("concatenates the pages in sidebar order, each behind its source line", () => {
    const pages = new Map(ENTRIES.map((entry) => [entry.route, `# ${entry.title}\n`]));
    expect(llmsFull(PLACEMENT, pages)).toBe(
      [
        "Source: /index.md",
        "",
        "# Home",
        "",
        "---",
        "",
        "Source: /forms/input/index.md",
        "",
        "# Input",
        "",
        "---",
        "",
        "Source: /forms/select/index.md",
        "",
        "# Select",
        "",
        "---",
        "",
        "Source: /overlays/dialog/index.md",
        "",
        "# Dialog",
        "",
      ].join("\n"),
    );
  });

  it("refuses a page it has no Markdown for", () => {
    expect(() => llmsFull(PLACEMENT, new Map())).toThrowError(/no Markdown for \//);
  });
});

describe("withoutAsks", () => {
  const ask = {
    kind: "ask" as const,
    block: {
      id: "q",
      kind: "yesno" as const,
      question: "Ok?",
      options: [],
      answer: undefined,
      comment: undefined,
      answered: false,
    },
  };

  it("takes the asks out of the page and out of its tab panels", () => {
    const model: PageModel = {
      route: "/x",
      title: "X",
      description: undefined,
      group: undefined,
      toc: [],
      related: [],
      segments: [
        { kind: "html", html: "<p>a</p>" },
        ask,
        {
          kind: "tabs",
          tabs: [{ slug: "props", title: "Props", segments: [{ kind: "html", html: "<h2>Props</h2>" }, ask] }],
        },
      ],
    };
    const stripped = withoutAsks(model);
    expect(JSON.stringify(stripped)).not.toContain('"ask"');
    expect(stripped.segments).toHaveLength(2);
    const tabs = stripped.segments[1];
    expect(tabs?.kind === "tabs" ? tabs.tabs[0]?.segments : []).toHaveLength(1);
  });
});
