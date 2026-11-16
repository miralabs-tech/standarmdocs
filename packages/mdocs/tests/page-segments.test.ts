/**
 * The two things a page renders that are neither prose nor a props table.
 *
 * The source listing is a regression rather than a new feature: the Astro site
 * folded each demo's own file into a `<details>` under the stage, read with Vite's
 * `?raw` so the block *was* the demo and could not drift from it. The ```demo
 * fence rendered the component and nothing else, so thirty-eight pages lost their
 * code listing on the way across.
 *
 * The index grid is the other half of `components/index.mdx`, which called
 * `<ComponentGrid category="…"/>` six times. Its data was already here — the
 * chrome entries carry the title and the route — and only the description was
 * missing.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PageModel } from "../src/core/model";
import type { ChromeEntry, ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

const ENTRIES: readonly ChromeEntry[] = [
  {
    route: "/components/overlays/dialog",
    title: "Dialog",
    group: "overlays",
    description: "A portalled surface, modal by default.",
  },
  {
    route: "/components/overlays/popover",
    title: "Popover",
    group: "overlays",
    description: "An anchored surface that dismisses on outside press.",
  },
  { route: "/components/forms/button", title: "Button", group: "forms", description: undefined },
];

const CHROME: ChromeProps = {
  categories: [
    { slug: "overlays", label: "Overlays", blurb: "Surfaces that leave the flow." },
    { slug: "forms", label: "Forms", blurb: "Controls that hold a value." },
  ],
  entries: ENTRIES,
  current: "/thing",
  degraded: null,
};

function Demo(): ReturnType<typeof createElement> {
  return createElement("p", null, "the demo itself");
}

function render(model: PageModel, over: { sources?: Readonly<Record<string, string>> } = {}): string {
  return renderToStaticMarkup(
    createElement(Page, {
      model,
      chrome: CHROME,
      demos: { "dialog-basic": Demo },
      api: {},
      ...over,
    }),
  );
}

const WITH_DEMO: PageModel = {
  route: "/thing",
  title: "Thing",
  description: undefined,
  group: undefined,
  toc: [],
  related: [],
  segments: [{ kind: "demo", id: "dialog-basic", matrix: [{}] }],
};

describe("a demo fence", () => {
  it("folds the demo's own source under the stage", () => {
    const html = render(WITH_DEMO, {
      sources: { "dialog-basic": '<pre class="shiki"><code>export function DialogBasic() {}</code></pre>' },
    });
    expect(html).toContain("<details");
    expect(html).toContain("export function DialogBasic() {}");
    // The stage is still there — the listing is added below it, not instead of it.
    expect(html).toContain("the demo itself");
  });

  it("renders no disclosure at all when there is no source for that id", () => {
    // A `<details>` whose body is empty is worse than none: it invites a press
    // that does nothing. Read off the article and not the page: the sidebar
    // folds each category in a `<details>` of its own, by design.
    const html = render(WITH_DEMO);
    const article = html.slice(html.indexOf("<main"));
    expect(article).toContain("the demo itself");
    expect(article).not.toContain("<details");
  });
});

describe("an index fence", () => {
  const model: PageModel = {
    route: "/components",
    title: "Components",
    description: undefined,
    group: undefined,
    toc: [],
    related: [],
    segments: [{ kind: "index", group: "overlays" }],
  };

  it("lists every page of that group, with its description", () => {
    const html = render(model);
    expect(html).toContain('href="/components/overlays/dialog"');
    expect(html).toContain("A portalled surface, modal by default.");
    expect(html).toContain('href="/components/overlays/popover"');
  });

  it("lists only that group", () => {
    // Scoped to the grid rather than the page: the sidebar lists every entry on
    // the site by design, so the whole-page form of this assertion asserts
    // nothing about the fence.
    const grid = /<ul class="mira-docs__grid">[\s\S]*?<\/ul>/.exec(render(model))?.[0];
    expect(grid).toBeDefined();
    expect(grid).toContain('href="/components/overlays/dialog"');
    expect(grid).not.toContain('href="/components/forms/button"');
  });

  it("names a group that matches no page rather than rendering an empty grid", () => {
    const empty: PageModel = { ...model, segments: [{ kind: "index", group: "widgets" }] };
    expect(() => render(empty)).toThrowError(/widgets/);
  });
});
