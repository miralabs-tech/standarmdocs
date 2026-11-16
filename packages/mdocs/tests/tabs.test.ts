/**
 * The trailing sections of a page, folded into a strip — and the three ways that
 * fold is allowed to refuse.
 *
 * The rule is deliberately narrow, so most of what is asserted here is what it
 * does *not* do: it never reaches into the middle of a page, it never folds a
 * lone section, and it never runs at all on a site that has not named its
 * headings. Each of those is a way an engine could quietly rewrite an article.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parsePage } from "../src/core/content/markdown";
import { demoIds, type PageModel, type Segment } from "../src/core/model";
import type { ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

const VOCABULARY = ["Keyboard", "Parts", "Props"];

const CHROME: ChromeProps = {
  categories: [{ slug: "forms", label: "Forms" }],
  entries: [{ route: "/components/forms/button", title: "Button", group: "forms", description: undefined }],
  current: "/components/forms/button",
  degraded: null,
};

/** A component page as this site writes one: prose, then the reference. */
const PAGE = [
  "---",
  "title: Button",
  "---",
  "",
  "The root infers what it renders.",
  "",
  "## What the composed name settles",
  "",
  "Three things the hand-assembled form has to remember.",
  "",
  "## Keyboard",
  "",
  "| Key | Effect |",
  "| --- | --- |",
  "| `Enter` | Activates on keydown |",
  "",
  "## Parts",
  "",
  "The tree below is what `<Button>` renders.",
  "",
  "## Props",
  "",
  "The tables below are read from the source.",
  "",
  "```props button",
  "```",
  "",
].join("\n");

function parse(source: string, tabs: readonly string[] = VOCABULARY): PageModel {
  return parsePage(source, { route: "/components/forms/button", group: "forms", tabs });
}

function tabsOf(model: PageModel): Extract<Segment, { kind: "tabs" }> {
  const found = model.segments.find((segment) => segment.kind === "tabs");
  if (found === undefined) throw new Error("the page has no tab strip");
  return found;
}

function render(model: PageModel): string {
  return renderToStaticMarkup(
    createElement(Page, {
      model,
      chrome: CHROME,
      demos: {},
      api: {
        button: [
          { name: "ButtonMachineProps", extends: undefined, definition: undefined, rows: [
            { name: "disabled?", type: "boolean", notes: undefined, source: "button.types.ts:19" },
          ] },
          { name: "ButtonSize", extends: undefined, definition: '"sm" | "lg"', rows: [] },
        ],
      },
    }),
  );
}

describe("the fold", () => {
  it("takes the trailing run and leaves the prose above it alone", () => {
    const model = parse(PAGE);
    const strip = tabsOf(model);

    expect(strip.tabs.map((tab) => tab.title)).toEqual(["Keyboard", "Parts", "Props"]);
    expect(strip.tabs.map((tab) => tab.slug)).toEqual(["keyboard", "parts", "props"]);

    // The strip is last, and everything before it is still the article. The
    // composed-name section is *not* in the strip: it is not in the vocabulary,
    // and it is what stops the run.
    expect(model.segments.at(-1)).toBe(strip);
    const above = model.segments.slice(0, -1);
    expect(above.every((segment) => segment.kind === "html")).toBe(true);
    expect(above.map((segment) => (segment.kind === "html" ? segment.html : "")).join("")).toContain(
      "What the composed name settles",
    );
  });

  it("keeps each section's own heading inside its panel", () => {
    // The heading is what a reader without script sees, and what a screen reader
    // navigating by heading still finds. The stylesheet hides it from the eye
    // once a tab carries the same word; the markup keeps it either way.
    const first = tabsOf(parse(PAGE)).tabs[0];
    const html = first?.segments[0];
    expect(html?.kind).toBe("html");
    expect(html?.kind === "html" ? html.html : "").toContain("<h2>Keyboard</h2>");
  });

  it("carries a section's fence into its panel, not out of it", () => {
    const props = tabsOf(parse(PAGE)).tabs.at(-1);
    expect(props?.slug).toBe("props");
    expect(props?.segments.map((segment) => segment.kind)).toEqual(["html", "props"]);
  });

  it("stops at the first heading the vocabulary does not name", () => {
    // `Keyboard` above the composed-name section is the shape five pages of the
    // site were written in. The run is the *trailing* one, so a `Keyboard` that
    // sits higher stays where the author put it rather than being hoisted down.
    const moved = PAGE.replace(
      "## What the composed name settles\n\nThree things the hand-assembled form has to remember.\n\n## Keyboard\n\n| Key | Effect |\n| --- | --- |\n| `Enter` | Activates on keydown |\n",
      "## Keyboard\n\n| Key | Effect |\n| --- | --- |\n| `Enter` | Activates on keydown |\n\n## What the composed name settles\n\nThree things the hand-assembled form has to remember.\n",
    );
    expect(moved).not.toBe(PAGE);

    expect(tabsOf(parse(moved)).tabs.map((tab) => tab.title)).toEqual(["Parts", "Props"]);
  });

  it("does not fold a lone trailing section", () => {
    const one = ["---", "title: Theming", "---", "", "Prose.", "", "## Props", "", "One section."].join("\n");
    expect(parse(one).segments.some((segment) => segment.kind === "tabs")).toBe(false);
  });

  it("folds nothing at all when the site names no headings", () => {
    // The engine documents no particular library, so the default has to be the
    // article exactly as it parsed before there were tabs.
    const without = parse(PAGE, []);
    expect(without.segments.some((segment) => segment.kind === "tabs")).toBe(false);
    expect(without.segments.map((segment) => segment.kind)).toEqual(["html", "props"]);
  });

  it("refuses two sections that would share a slug", () => {
    const twice = ["---", "title: X", "---", "", "## Props", "", "One.", "", "## Props", "", "Two."].join("\n");
    expect(() => parse(twice)).toThrowError(/share a slug/);
  });

  it("finds a demo inside a panel", () => {
    // The build generates one dynamic import per id this returns. An id it
    // missed would be a stage that prerenders and never hydrates.
    const withDemo = PAGE.replace("The tree below is what `<Button>` renders.", "```demo button-basic\n```");
    expect(demoIds(parse(withDemo))).toEqual(["button-basic"]);
  });
});

describe("the markup", () => {
  it("renders every panel, and hides only the strip", () => {
    const html = render(parse(PAGE));

    // The whole no-script story in two assertions: the control that would do
    // nothing is not shown, and no panel is withheld.
    expect(html).toContain('<div class="mira-docs__tablist" role="tablist" hidden');
    expect(html).not.toMatch(/<section class="mira-docs__tabpanel"[^>]*\shidden/);
    for (const slug of ["keyboard", "parts", "props"]) {
      expect(html).toContain(`id="${slug}"`);
    }
  });

  it("pairs each tab with its panel, and calls no section a panel yet", () => {
    const html = render(parse(PAGE));

    expect(html).toContain('id="tab-props"');
    expect(html).toContain('aria-controls="props"');
    expect(html).toContain('aria-labelledby="tab-props"');
    // `role="tabpanel"` is the boot script's to add: a panel is only a panel
    // once something can switch to it.
    expect(html).not.toContain('role="tabpanel"');
  });

  it("renders the props tables inside the panel, and exactly as many as before", () => {
    // The gate on the site that drove this counts `<table class="mira-docs__props">`
    // as an exact string, page by page, in strict equality against the number of
    // entries in the JSON. Tabs that rendered one panel lazily would take it red.
    const tabbed = render(parse(PAGE));
    const plain = render(parse(PAGE, []));
    const count = (html: string): number =>
      [...html.matchAll(/<table class="mira-docs__props">/g)].length;

    expect(count(plain)).toBe(2);
    expect(count(tabbed)).toBe(count(plain));
  });
});
