/**
 * What the sidebar shows, and what it used to drop.
 *
 * The filter was `entry.group === category.slug` and nothing else, so a page whose
 * group matched no category was not rendered anywhere — not misplaced, not last,
 * absent. Three of the forty-one pages were in that state, including the site's
 * own front page, and nothing in the build said so.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { axisControlsFor, MIRALABS_MATRIX } from "../src/core/axes";
import { orderEntries, SIDEBAR_CLOSED_KEY, SIDEBAR_SCROLL_KEY } from "../src/core/sidebar";
import {
  type ChromeEntry,
  type ChromeProps,
  NavBar,
  placeEntries,
  StaticChrome,
} from "../src/react/chrome";

const CATEGORIES = [{ slug: "overlays", label: "Overlays", blurb: "Surfaces that leave the flow." }];

const ENTRIES: readonly ChromeEntry[] = [
  { route: "/", title: "MiraLabs UI", group: undefined, description: "The front page." },
  { route: "/components", title: "Components", group: undefined, description: "Every component." },
  {
    route: "/components/overlays/dialog",
    title: "Dialog",
    group: "overlays",
    description: "A portalled surface.",
  },
];

function render(over: Partial<ChromeProps> = {}): string {
  const props: ChromeProps = {
    categories: CATEGORIES,
    entries: ENTRIES,
    current: "/components/overlays/dialog",
    degraded: null,
    ...over,
  };
  return renderToStaticMarkup(createElement(StaticChrome, props));
}

describe("the sidebar", () => {
  it("shows a page that belongs to no category instead of dropping it", () => {
    const html = render();
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/components"');
    expect(html).toContain("MiraLabs UI");
  });

  it("still groups a page under the category its directory names", () => {
    const html = render();
    expect(html).toContain("Overlays");
    expect(html).toContain('href="/components/overlays/dialog"');
    expect(html).toContain('aria-current="page"');
  });

  it("leads with the ungrouped pages, before the first category", () => {
    const html = render();
    expect(html.indexOf('href="/components"')).toBeLessThan(html.indexOf("Overlays"));
  });

  it("puts the site root first among them, whatever order they were scanned in", () => {
    // The scan sorts by file path, and `components/index.md` sorts before
    // `index.md` — so the landing page for one section led the sidebar and the
    // site's own front page came second.
    const html = render();
    expect(html.indexOf('href="/"')).toBeLessThan(html.indexOf('href="/components"'));
  });

  it("folds each category in a details that arrives open, named by its slug", () => {
    // Open, so a reader with no script and no stored fold sees the whole site;
    // named, so the fold the script remembers can be applied to this one and not
    // to whichever section happens to be third.
    const html = render();
    expect(html).toContain('<details open="" data-category="overlays">');
    expect(html).toContain("<summary><h2>Overlays</h2></summary>");
    // Still a section: the outline of the page is the same with or without the fold.
    expect(html).toContain('<section><details open="" data-category="overlays">');
  });

  it("carries its boot script last, inside the column, and the script knows both keys", () => {
    const html = render();
    const script = html.lastIndexOf("<script>");
    expect(script).toBeGreaterThan(html.lastIndexOf("</nav>"));
    expect(html.endsWith("</script></div>")).toBe(true);
    // The two things it remembers, by the names a reader could clear.
    expect(html.slice(script)).toContain(SIDEBAR_SCROLL_KEY);
    expect(html.slice(script)).toContain(SIDEBAR_CLOSED_KEY);
    // Handed its own column, never a selector over the document: two chromes in
    // one document each get theirs.
    expect(html.slice(script)).toContain("document.currentScript");
  });

  it("names a group no category claims, rather than swallowing it", () => {
    // The failure mode this replaces is silence. A page under `content/widgets/`
    // with no `widgets` category is a config that is missing an entry, and the
    // build has to say which one.
    expect(() =>
      render({
        entries: [{ route: "/widgets/thing", title: "Thing", group: "widgets", description: undefined }],
      }),
    ).toThrowError(/widgets/);
  });
});

describe("page order inside a category", () => {
  const route = (name: string, order?: number): ChromeEntry => ({
    route: `/guide/${name}`,
    title: name,
    group: "guide",
    description: undefined,
    order,
  });

  it("puts ordered pages first, ascending, tied by route, then the others as given", () => {
    const entries = [route("c"), route("b", 2), route("a", 2), route("z", 1), route("d")];
    expect(orderEntries(entries).map((entry) => entry.route)).toEqual([
      "/guide/z",
      "/guide/a",
      "/guide/b",
      "/guide/c",
      "/guide/d",
    ]);
  });

  it("orders the sidebar section by sidebar.order, not by file path", () => {
    const entries = [
      route("cli", 3),
      route("installation", 2),
      route("introduction", 1),
      route("limits"),
      route("registries"),
    ];
    const { sections } = placeEntries([{ slug: "guide", label: "Guide" }], entries);
    expect(sections[0]?.items.map((entry) => entry.title)).toEqual([
      "introduction",
      "installation",
      "cli",
      "limits",
      "registries",
    ]);
  });
});

describe("the axis controls", () => {
  const axes = (matrix: Parameters<typeof axisControlsFor>[0]): string[] =>
    axisControlsFor(matrix).map((control) => control.axis);

  it("offers theme alone for a matrix of one auto entry", () => {
    expect(axes([{}])).toEqual(["theme"]);
  });

  it("adds density when an entry sets it", () => {
    expect(axes(MIRALABS_MATRIX)).toEqual(["theme", "density"]);
  });

  it("does not add a control for an axis that has none", () => {
    expect(axes([{ motion: "reduced" }])).toEqual(["theme"]);
  });

  it("renders no density button with the default matrix", () => {
    const html = render();
    expect(html).toContain('data-mira-axis="theme"');
    expect(html).not.toContain('data-mira-axis="density"');
  });

  it("renders the density buttons when the matrix sets density", () => {
    const html = render({ matrix: MIRALABS_MATRIX });
    expect(html).toContain('data-mira-axis="theme"');
    expect(html).toContain('data-mira-axis="density"');
  });
});

describe("the search mounts", () => {
  it("puts one empty mount in the sidebar, before the axis switch", () => {
    const html = render();
    expect(html.match(/data-mira-search=""/g)).toHaveLength(1);
    expect(html).toContain('<div class="mira-docs__search" data-mira-search=""></div>');
    expect(html.indexOf("data-mira-search")).toBeLessThan(html.indexOf("data-mira-axes"));
  });

  it("puts one empty mount in the bar, after the site's name", () => {
    const html = renderToStaticMarkup(createElement(NavBar, { siteName: "Docs" }));
    expect(html.match(/data-mira-search=""/g)).toHaveLength(1);
    expect(html).toContain('<span class="mira-docs__bar-search" data-mira-search=""></span>');
    expect(html.indexOf("Docs")).toBeLessThan(html.indexOf("data-mira-search"));
  });
});
