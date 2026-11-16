/**
 * What the search index holds, and what it must never hold.
 *
 * The index is built from the page model and not from the rendered HTML, so the
 * claims below are about segments: which of them become text, where a document
 * starts and what a hit links to. A hit that lands on the top of a long page, a
 * code block in the text or a markup fragment in a snippet would each pass a
 * build and fail a reader.
 */

import { describe, expect, it } from "vitest";
import { parsePage } from "../src/core/content/markdown";
import type { ApiTables, PageModel } from "../src/core/model";
import {
  SEARCH_INDEX_FILE,
  SEARCH_INDEX_URL,
  SEARCH_INDEX_VERSION,
  searchDocuments,
  searchHref,
  searchIndex,
} from "../src/core/search";

const API: ApiTables = {
  button: [
    {
      name: "ButtonProps",
      extends: null,
      definition: null,
      rows: [
        { name: "variant?", type: "string", notes: null, source: null },
        { name: "pressed?", type: "boolean", notes: null, source: null },
      ],
    },
  ],
};

const SOURCE = [
  "---",
  "title: Button",
  "description: Presses things & more",
  "---",
  "",
  "The *root* infers what it renders.",
  "",
  "```ask id=scope",
  "kind: yesno",
  "question: Secret question?",
  "```",
  "",
  "## Usage",
  "",
  "Use `<Button>` for \"actions\" & more. Caf&#233; &amp;lt;.",
  "",
  "```tsx",
  "const hidden = <Button>codeblockword</Button>;",
  "```",
  "",
  "### Sizes",
  "",
  "Small and large.",
  "",
  "```demo button-basic",
  "```",
  "",
  "## Keyboard",
  "",
  "Enter activates on keydown.",
  "",
  "### Repeat",
  "",
  "Held keys do not repeat.",
  "",
  "## Props",
  "",
  "The tables are read from the source.",
  "",
  "```props button",
  "```",
  "",
].join("\n");

function parse(source = SOURCE, tabs: readonly string[] = ["Keyboard", "Props"]): PageModel {
  return parsePage(source, { route: "/components/forms/button", group: "forms", tabs });
}

describe("searchDocuments", () => {
  const documents = searchDocuments(parse(), { api: API });
  const byId = new Map(documents.map((doc) => [doc.id, doc]));

  it("opens with the page's lead: description and the prose before the first heading", () => {
    const lead = documents[0];
    expect(lead?.id).toBe("/components/forms/button");
    expect(lead?.anchor).toBeUndefined();
    expect(lead?.section).toBeUndefined();
    expect(lead?.title).toBe("Button");
    expect(lead?.text).toBe("Presses things & more The root infers what it renders.");
  });

  it("starts a document at each ## and ### outside the tab strip, linked by the heading's id", () => {
    expect(documents.map((doc) => doc.id)).toEqual([
      "/components/forms/button",
      "/components/forms/button#usage",
      "/components/forms/button#sizes",
      "/components/forms/button#keyboard",
      "/components/forms/button#props",
    ]);
    expect(byId.get("/components/forms/button#usage")).toMatchObject({
      route: "/components/forms/button",
      anchor: "usage",
      title: "Button",
      section: "Usage",
    });
    expect(byId.get("/components/forms/button#sizes")?.section).toBe("Sizes");
  });

  it("makes one document per tab panel, by slug, with the ### kept inside it", () => {
    const keyboard = byId.get("/components/forms/button#keyboard");
    expect(keyboard?.section).toBe("Keyboard");
    expect(keyboard?.text).toContain("Enter activates on keydown.");
    expect(keyboard?.text).toContain("Held keys do not repeat.");
    expect(keyboard?.text).not.toMatch(/^Keyboard/);
    expect(byId.has("/components/forms/button#repeat")).toBe(false);
  });

  it("drops code blocks, strips tags and decodes entities once", () => {
    const usage = byId.get("/components/forms/button#usage");
    expect(usage?.text).not.toContain("codeblockword");
    expect(usage?.text).not.toContain("hidden");
    expect(usage?.text).not.toMatch(/<\/?(?:p|code|pre|h2|em|strong)\b/);
    expect(usage?.text).toBe("Use <Button> for \"actions\" & more. Café &lt;.");
  });

  it("adds a props table's name and its rows' names to the panel that holds the fence", () => {
    const props = byId.get("/components/forms/button#props");
    expect(props?.text).toContain("The tables are read from the source.");
    expect(props?.text).toContain("ButtonProps variant? pressed?");
  });

  it("leaves demos, questions and the index and home fences out", () => {
    const all = documents.map((doc) => doc.text).join("\n");
    expect(all).not.toContain("Secret question");
    expect(all).not.toContain("button-basic");
    const grid = parsePage("# Grid\n\n```index forms\n```\n", { route: "/grid" });
    expect(searchDocuments(grid)).toEqual([{ id: "/grid", route: "/grid", title: "Grid", text: "" }]);
  });

  it("has a unique id for every document", () => {
    const ids = documents.map((doc) => doc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names the heading from its text when the contents do not list it", () => {
    const model: PageModel = {
      route: "/x",
      title: "X",
      description: undefined,
      group: undefined,
      segments: [{ kind: "html", html: '<h2 id="odd">Odd <em>one</em></h2>\n<p>Body &#39;text&#39;.</p>\n' }],
      toc: [],
      related: [],
    };
    expect(searchDocuments(model)[1]).toMatchObject({ anchor: "odd", section: "Odd one", text: "Body 'text'." });
  });
});

describe("searchIndex", () => {
  it("is versioned and concatenates the pages' documents in order", () => {
    const first = parse();
    const second = parsePage("# Other\n\nBody.\n", { route: "/other" });
    const index = searchIndex([first, second], { api: API });
    expect(index.version).toBe(SEARCH_INDEX_VERSION);
    expect(index.version).toBe(1);
    expect(index.documents).toEqual([
      ...searchDocuments(first, { api: API }),
      ...searchDocuments(second, { api: API }),
    ]);
  });

  it("round-trips through JSON", () => {
    const index = searchIndex([parse()], { api: API });
    expect(JSON.parse(JSON.stringify(index))).toEqual(index);
  });
});

describe("the contract's constants", () => {
  it("names one file at the top of the site", () => {
    expect(SEARCH_INDEX_FILE).toBe("search-index.json");
    expect(SEARCH_INDEX_URL).toBe("/search-index.json");
  });

  it("links a lead to its route and a section to its anchor", () => {
    expect(searchHref({ route: "/a" })).toBe("/a");
    expect(searchHref({ route: "/a", anchor: "b" })).toBe("/a#b");
  });
});
