/**
 * The engine's own defaults, on the engine's own fixture.
 *
 * This file used to read `apps/miralabs-ui`, and it opened by naming the four
 * properties only a real corpus can show, "each of which was a live defect before
 * it was fixed". That corpus went home to miralabs-ui on 2026-09-09, and the
 * weakening is real and deliberate rather than incidental — a one-page fixture
 * cannot witness a routing rule about directory indexes, a sidebar that has
 * sections, a props table read out of an installed tarball, or a matrix override
 * across thirty-eight demos.
 *
 * Where each went:
 *
 *  - **one island per fence, not one per axis** and **a directory's index routes
 *    to the directory** moved with the corpus, into
 *    `apps/docs/scripts/check-site.ts` over there, and are verified red there.
 *  - **the props table comes from the installed package rather than a checkout
 *    beside this one** has no successor, because it has no subject: the package
 *    and the checkout are one tree now. What survives of it here is thinner and
 *    still worth having — a ```props fence renders rows at all, from whatever
 *    `apiDir` names.
 *  - **the sidebar lists the pages that head a section** needs a section, and this
 *    fixture has one page. Gone.
 *
 * What replaces them is the other side of the same coin, and it had no witness
 * anywhere until now. The corpus proved the *overrides*; the fixture is the only
 * place that can prove the **defaults** underneath them — one island where no
 * matrix is declared, and five of six categories drawn nowhere because nothing
 * sits in them. The old file asserted the empty-category rule while three
 * categories were still unported, then dropped it saying it "lives on the fixture
 * in `build.test.ts`". It did not: nothing there asserts a label is absent.
 *
 * Built once for the unit project by `tests/setup/build-fixture.ts`, and spawned
 * rather than imported, for the reason `build.test.ts` gives: `Bun.build` exists
 * only under the Bun runtime, and vitest's node project is not it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const site = fileURLToPath(new URL("../fixtures/site", import.meta.url));
const content = path.join(site, "content");
const dist = path.join(site, "dist");

let page = "";

beforeAll(() => {
  page = fs.readFileSync(path.join(dist, "components/disclosure/disclosure/index.html"), "utf8");
});

/** Every `index.html` the build wrote, as routes relative to `dist`. */
function routes(dir: string = dist, prefix = ""): readonly string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...routes(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    // Keyed on index.md, which only a source page writes: the generated front
    // page is an index.html with no markdown beside it.
    else if (entry.name === "index.md") found.push(prefix);
  }
  return found;
}

function sources(dir: string = content): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += sources(path.join(dir, entry.name));
    else if (entry.name.endsWith(".md")) total++;
  }
  return total;
}

describe("the routes", () => {
  it("writes one page per source file", () => {
    // A page that is never scanned raises nothing — it is simply absent from a
    // site that builds and reports a count of its own choosing.
    expect(routes()).toHaveLength(sources());
  });

  it("routes a leaf page under the directories it sits in", () => {
    expect(routes()).toEqual(["components/disclosure/callout/", "components/disclosure/disclosure/"]);
  });

  it("ends a page that names related routes on a See also block, in the HTML and the Markdown", () => {
    expect(page).toContain('<h2 id="mira-see-also">See also</h2>');
    expect(page).toContain('<a href="/components/disclosure/callout">Callout</a>');
    const text = fs.readFileSync(path.join(dist, "components/disclosure/disclosure/index.md"), "utf8");
    expect(text).toContain("## See also\n\n- [Callout](/components/disclosure/callout/index.md)");
    const callout = fs.readFileSync(path.join(dist, "components/disclosure/callout/index.html"), "utf8");
    expect(callout).not.toContain("See also");
  });

  it("generates a front page on / when no source is an index.md", () => {
    const home = fs.readFileSync(path.join(dist, "index.html"), "utf8");
    expect(home).toContain('class="mira-docs__sidebar"');
    expect(home).toContain('<link rel="stylesheet"');
    expect(home).toContain("<h1>");
    expect(home).not.toContain("mdocs-home");
    expect(home).toContain('class="mira-docs__card" href="/components/disclosure/disclosure"');
    expect(home).toContain('<span class="mira-docs__card-title">Disclosure</span>');
    expect(home).toContain('<span class="mira-docs__card-text">A button that opens and closes a region');
    const group = home.indexOf('<section class="mira-docs__home-group"><h2>Disclosure</h2>');
    expect(group).toBeGreaterThan(-1);
    expect(home.indexOf('href="/components/disclosure/disclosure"', group)).toBeGreaterThan(group);
  });
});

describe("the machine-readable outputs", () => {
  it("writes an index.md beside the index.html, without the demo or the front matter", () => {
    const text = fs.readFileSync(path.join(dist, "components/disclosure/disclosure/index.md"), "utf8");
    expect(text.startsWith("# Disclosure\n\n> A button that opens and closes a region")).toBe(true);
    expect(text).not.toContain("```demo");
    expect(text).not.toContain("```props");
    expect(text).not.toContain("title: Disclosure");
    expect(text).toContain("### DisclosureProps");
  });

  it("lists the page in llms.txt and repeats it in llms-full.txt", () => {
    const link = "/components/disclosure/disclosure/index.md";
    const index = fs.readFileSync(path.join(dist, "llms.txt"), "utf8");
    expect(index.startsWith("# Fixture Docs\n")).toBe(true);
    expect(index).toContain(`- [Disclosure](${link}): A button that opens and closes a region`);
    expect(fs.readFileSync(path.join(dist, "llms-full.txt"), "utf8")).toContain(`Source: ${link}\n\n# Disclosure`);
  });
});

describe("the sidebar", () => {
  it("draws the category a page sits in", () => {
    expect(page).toContain("Disclosure");
  });

  it("draws no category that nothing sits in", () => {
    // Three are declared in `mdocs.config.ts` and one has a page. An empty category
    // rendered as a bare heading is the failure this guards, and it is invisible
    // on any site whose categories all happen to be occupied — which is every
    // real one, which is why it belongs on the fixture.
    for (const label of ["Forms", "Display"]) {
      expect(page, `${label} is declared, empty, and drawn anyway`).not.toContain(label);
    }
  });
});

describe("the demos", () => {
  it("renders the default matrix, one island per demo", () => {
    // No `matrix` in this config, so the engine's own default applies: a single
    // copy of every demo. A site that wants variants declares `matrix`, and the
    // consumer that does is where the override is asserted.
    const fences = [...fs.readFileSync(path.join(content, "components/disclosure/disclosure.md"), "utf8")
      .matchAll(/^```demo\s+\S+/gm)].length;
    expect(fences).toBe(1);
    expect([...page.matchAll(/data-mira-island=/g)]).toHaveLength(1);
  });
});

describe("the props tables", () => {
  it("renders rows from whatever apiDir names", () => {
    // `apiDir: "api"` here is a directory in the site, not a package specifier —
    // the other half of a resolution rule whose package half a consumer exercises.
    expect([...page.matchAll(/<table class="mira-docs__props">/g)].length).toBeGreaterThan(0);
    expect(page).toContain("DisclosureProps");
  });
});
