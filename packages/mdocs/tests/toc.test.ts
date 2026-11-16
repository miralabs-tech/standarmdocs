/**
 * The table of contents: the ids the headings get, the list built from them, and
 * the markup that draws it. The ids are the part with a contract — a link into
 * the page is only as good as the slug being the same one next build.
 */

import MarkdownIt from "markdown-it";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { currentHeading } from "../src/client/toc";
import { pageMarkdown } from "../src/core/content/llms";
import { parsePage } from "../src/core/content/markdown";
import { assignHeadingIds, githubSlug, headingSlug } from "../src/core/content/toc";
import type { PageModel, Segment } from "../src/core/model";
import type { ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

const CHROME: ChromeProps = {
  categories: [{ slug: "forms", label: "Forms" }],
  entries: [{ route: "/c/button", title: "Button", group: "forms", description: undefined }],
  current: "/c/button",
  degraded: null,
};

function parse(source: string, tabs: readonly string[] = []): PageModel {
  return parsePage(source, { route: "/c/button", group: "forms", tabs });
}

function render(model: PageModel): string {
  return renderToStaticMarkup(createElement(Page, { model, chrome: CHROME, demos: {}, api: {} }));
}

function html(segments: readonly Segment[]): string {
  return segments.map((segment) => (segment.kind === "html" ? segment.html : "")).join("");
}

describe("headingSlug", () => {
  it("lowercases, strips accents and folds runs of other characters into one dash", () => {
    expect(headingSlug("Café au lait")).toBe("cafe-au-lait");
    expect(headingSlug("  Keyboard & Focus: the (long) story!  ")).toBe("keyboard-focus-the-long-story");
    expect(headingSlug("Ａｂｃ ２")).toBe("abc-2");
  });

  it("falls back on `section` when nothing alphanumeric is left", () => {
    expect(headingSlug("")).toBe("section");
    expect(headingSlug("?! — ?!")).toBe("section");
  });
});

describe("githubSlug", () => {
  it("keeps accents, drops punctuation and turns each space into a hyphen", () => {
    expect(githubSlug("2.1 Graphe de dépendances")).toBe("21-graphe-de-dépendances");
    expect(githubSlug("2.3 Vagues conseillées (2 agents max, 1 seul lourd, aucun fichier partagé)")).toBe(
      "23-vagues-conseillées-2-agents-max-1-seul-lourd-aucun-fichier-partagé",
    );
    expect(githubSlug("Keyboard & Focus")).toBe("keyboard--focus");
    expect(githubSlug("snake_case - dash")).toBe("snake_case---dash");
  });

  it("falls back on `section` when nothing is left", () => {
    expect(githubSlug("")).toBe("section");
    expect(githubSlug("?!")).toBe("section");
  });
});

describe("github heading ids", () => {
  const github = (source: string): PageModel =>
    parsePage(source, { route: "/c/button", group: "forms", headingSlugs: "github" });

  it("number a repeat from -1, the first one staying bare", () => {
    const model = github("## x\n\n## x\n\n### x\n");
    expect(model.toc.map((entry) => entry.id)).toEqual(["x", "x-1", "x-2"]);
  });

  it("give a #### an id that the contents never list", () => {
    const model = github("## Usage\n\n#### Deep\n");
    expect(html(model.segments)).toContain('<h4 id="deep">Deep</h4>');
    expect(model.toc.map((entry) => entry.id)).toEqual(["usage"]);
  });

  it("give a #### inside tabs an id, out of the contents", () => {
    const model = parsePage("## Usage\n\n## Keyboard\n\n## Props\n\n#### Deep\n", {
      route: "/c/button",
      group: "forms",
      tabs: ["Keyboard", "Props"],
      headingSlugs: "github",
    });
    expect(render(model)).toContain('<h4 id="deep">Deep</h4>');
    expect(model.toc.map((entry) => entry.id)).toEqual(["usage"]);
  });

  it("leave the default mode as it was", () => {
    const model = parsePage("## Usage\n\n#### Deep\n\n## 2.1 Café\n", {
      route: "/c/button",
      group: "forms",
      headingSlugs: "standardoc",
    });
    expect(html(model.segments)).toContain("<h4>Deep</h4>");
    expect(model.toc.map((entry) => entry.id)).toEqual(["usage", "2-1-cafe"]);
  });
});

describe("heading ids", () => {
  it("are given to every ## and ### of the body, and to no other level", () => {
    const model = parse("# Title\n\n## Usage\n\n### Café\n\n#### Deep\n");
    expect(html(model.segments)).toContain('<h2 id="usage">Usage</h2>');
    expect(html(model.segments)).toContain('<h3 id="cafe">Café</h3>');
    expect(html(model.segments)).toContain("<h4>Deep</h4>");
  });

  it("are unique on the page, suffixed from -2 in document order", () => {
    const model = parse("## Notes\n\n### Notes\n\n## Notes\n\n## \n\n## ??\n");
    expect(model.toc.map((entry) => entry.id)).toEqual(["notes", "notes-2", "notes-3", "section", "section-2"]);
  });

  it("keep an id the heading already carries, and generated ones step around it", () => {
    const tokens = new MarkdownIt().parse("## Usage\n\n## Other\n", {});
    const first = tokens.find((token) => token.type === "heading_open");
    first?.attrSet("id", "other");
    const toc = assignHeadingIds(tokens, tokens.length, []);
    expect(toc.map((entry) => entry.id)).toEqual(["other", "other-2"]);
  });
});

describe("toc extraction", () => {
  it("lists ## and ### with their depth, in page order, as plain text", () => {
    const model = parse(
      "Intro.\n\n## The `Button` root\n\n### A [link](/x) and *emphasis*\n\n## Plain\n\n#### Skipped\n",
    );
    expect(model.toc).toEqual([
      { id: "the-button-root", text: "The Button root", depth: 2 },
      { id: "a-link-and-emphasis", text: "A link and emphasis", depth: 3 },
      { id: "plain", text: "Plain", depth: 2 },
    ]);
  });

  it("is empty for a page with no ## or ###", () => {
    expect(parse("# Title\n\nProse.\n").toc).toEqual([]);
  });

  it("leaves out the sections that became tabs, and what sits inside them", () => {
    const source = [
      "## Usage",
      "",
      "### Install",
      "",
      "## Keyboard",
      "",
      "### Focus",
      "",
      "## Props",
      "",
      "Text.",
    ].join("\n");
    const model = parse(source, ["Keyboard", "Props"]);
    expect(model.toc.map((entry) => entry.id)).toEqual(["usage", "install"]);
    const tabs = model.segments.find((segment) => segment.kind === "tabs");
    expect(tabs?.kind === "tabs" ? tabs.tabs.map((tab) => tab.slug) : []).toEqual(["keyboard", "props"]);
  });

  it("does not hand a tab's label the id its panel already has", () => {
    const source = "## Usage\n\n## Keyboard\n\n### Props\n\n## Props\n";
    const model = parse(source, ["Keyboard", "Props"]);
    const rendered = render(model);
    expect(rendered.match(/id="props"/g)).toHaveLength(1);
    expect(rendered).toContain('<h3 id="props-2">Props</h3>');
    expect(rendered).toContain('<h2>Keyboard</h2>');
  });

  it("lists everything when the trailing run is too short to be a strip", () => {
    const model = parse("## Usage\n\n## Props\n", ["Keyboard", "Props"]);
    expect(model.toc.map((entry) => entry.id)).toEqual(["usage", "props"]);
  });
});

describe("the markdown view", () => {
  it("is unchanged by the ids", () => {
    const source = "---\ntitle: Button\n---\n\n## Usage\n\n### Install\n\nProse.\n\n## Usage\n";
    expect(pageMarkdown(source, { title: "Button", description: undefined }, { api: {}, entries: [] })).toBe(
      "# Button\n\n## Usage\n\n### Install\n\nProse.\n\n## Usage\n",
    );
  });
});

describe("the rendered page", () => {
  const MANY = parse("## One\n\n### Inner\n\n## Two\n\n### Other\n");

  it("draws the nav, once for the rail and once as a fold, with the same links", () => {
    const rendered = render(MANY);
    expect(rendered.match(/<nav class="docs-toc docs-toc--(?:rail|fold)" aria-label="On this page"/g)).toHaveLength(2);
    expect(rendered).toContain("<details><summary>On this page</summary>");
    expect(rendered.match(/<a href="#one">One<\/a>/g)).toHaveLength(2);
    expect(rendered.match(/<a href="#inner">Inner<\/a>/g)).toHaveLength(2);
    expect(rendered).toContain('<h2 id="one">One</h2>');
  });

  it("nests a ### under the ## above it", () => {
    const rendered = render(MANY);
    expect(rendered).toContain(
      '<li><a href="#one">One</a><ol class="docs-toc__list"><li><a href="#inner">Inner</a></li></ol></li>',
    );
  });

  it("is absent with one heading, or none", () => {
    expect(render(parse("## Only\n"))).not.toContain("docs-toc");
    expect(render(parse("Prose.\n"))).not.toContain("docs-toc");
    expect(render(parse("## Only\n"))).toContain('<h2 id="only">Only</h2>');
  });
});

describe("currentHeading", () => {
  const HEADINGS = [
    { id: "one", top: -300 },
    { id: "two", top: 40 },
    { id: "three", top: 900 },
  ];

  it("is the last heading at or above the line", () => {
    expect(currentHeading(HEADINGS, 200)).toBe("two");
    expect(currentHeading(HEADINGS, 40)).toBe("two");
    expect(currentHeading(HEADINGS, 5000)).toBe("three");
  });

  it("is none while the reader is above the first heading", () => {
    expect(currentHeading(HEADINGS, -400)).toBeNull();
    expect(currentHeading([], 200)).toBeNull();
  });
});
