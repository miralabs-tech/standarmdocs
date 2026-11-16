/**
 * The two halves of the bet that are not about focus: that the reader gets the
 * whole page before any script, and that the demo is not in the first script
 * they get. Asserted against the artefact on disk, which is the only thing a
 * reader ever sees.
 *
 * Built once for the unit project by `tests/setup/build-fixture.ts`, and spawned
 * rather than imported, because `Bun.build` exists only under the Bun runtime and
 * vitest's node project is not it.
 *
 * "ships no prerenderer" is deliberately absent: it is `check:bundle`, which
 * reads the same directory and asserts three needles rather than two.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const site = fileURLToPath(new URL("../fixtures/site", import.meta.url));
const dist = path.join(site, "dist");
const assets = path.join(dist, "assets");

let html = "";
let stages = "";
let entryName = "";
let entry = "";
let chunks: readonly string[] = [];

beforeAll(() => {
  html = fs.readFileSync(path.join(dist, "components/disclosure/disclosure/index.html"), "utf8");

  // The rendered demos, with the source listings left out. Every demo's own file
  // is folded into a `<details>` under its stage, so the page now legitimately
  // contains the text of a surface that is not open — as escaped source, inside a
  // `<pre>`. A needle searched across the whole document can no longer tell
  // "rendered" from "quoted", and the claim below is about the first one.
  stages = [...html.matchAll(/<div class="mira-demo__stage">([\s\S]*?)<\/div><details/g)]
    .map((match) => match[1] ?? "")
    .join("\n");

  // The entry is read out of the page, never matched by filename: two of the
  // built chunks are named `entry-*`, and only the one the page links is the one
  // the reader loads. A `startsWith("entry")` here picks whichever `readdir`
  // returned first.
  const script = /<script type="module" src="([^"]+)"><\/script>/.exec(html);
  const src = script?.[1];
  if (src === undefined) throw new Error("the built page loads no module script");
  entryName = path.basename(src);
  entry = fs.readFileSync(path.join(dist, src.replace(/^\//, "")), "utf8");

  chunks = fs.readdirSync(assets).filter((name) => name.endsWith(".js"));
});

describe("the built page", () => {
  it("rewrites a relative .md link to the route of its target", () => {
    expect(html).toContain('href="/components/disclosure/callout#anatomy"');
    expect(html).not.toContain("callout.md");
  });

  it("carries all four of its sources, with no script behind any of them", () => {
    // One needle per source, each checked to appear in that source and no other.
    // The obvious needles do not discriminate: "Rename file" is in the prose's
    // `tsx` fence and a title is in every part of the page — either would pass
    // on half of it.
    expect(html).toContain("Fixture Docs"); // chrome, from mdocs.config.ts
    expect(html).toContain("dangling IDREF"); // prose, from the .md
    expect(html).toContain("DisclosureProps"); // props table, from api/disclosure.json
    expect(html).toContain("Just a title"); // demo, from demos/disclosure-basic.tsx
  });

  it("carries no open region, because nothing is open", () => {
    // This holds across the whole document: a source listing is escaped, so
    // `aria-expanded={open}` in a demo's file reaches the page as an expression
    // and a literal match here still means a real attribute on a real element.
    expect(html).not.toContain('aria-expanded="true"');

    // The same claim in its sharpest form: the third disclosure's button is served
    // and its panel is not, so what the page is missing is the region and not the
    // demo.
    expect(stages).not.toBe("");
    expect(stages).toContain("Delete project");
    expect(stages).not.toContain("There is no undo");
  });

  it("folds each demo's own file under its stage", () => {
    expect(html).toContain("Show code");
    // The listing is the demo's source, so it carries what the rendered stage
    // deliberately does not — which is the property that makes it a listing of
    // the demo rather than a transcription beside it.
    expect(html).toContain("There is no undo");
    expect(html).toContain('class="shiki');
  });

  it("loads its islands from a module script and nothing sooner", () => {
    expect(html).toContain('<script type="module"');
  });
});

describe("the built scripts", () => {
  it("splits the demo out of the entry chunk", () => {
    const rest = chunks
      .filter((name) => name !== entryName)
      .map((name) => fs.readFileSync(path.join(assets, name), "utf8"))
      .join("\n");

    // A demo's own strings are the cheapest proof of which chunk it landed in,
    // and they are asserted before the chunk count on purpose: the regression
    // this guards against — the entry reaching the barrel and dragging half the
    // world in behind it — grows the entry without changing how many chunks
    // there are. The count would stay green through it.
    for (const mark of ["Just a title", "Delete project", "There is no undo"]) {
      expect(entry, `"${mark}" leaked into the entry chunk`).not.toContain(mark);
      expect(rest, `"${mark}" is in no chunk at all`).toContain(mark);
    }

    expect(chunks.length).toBeGreaterThan(1);
  });

  it("bundles the site's own script into the entry every page loads", () => {
    // Asserted on the entry chunk and not on a file in `assets`, because that is
    // the difference between `scripts` and `stylesheets`: a stylesheet is copied
    // and linked, a script is bundled. A copy would reach the reader as an
    // unresolved bare specifier the first time a site pointed the field at a
    // package.
    expect(entry, "the site's boot module is not in the entry chunk").toContain("data-site-boot");
  });

  it("imports the site's script after the kit's modules and before its calls", () => {
    // Read off the generated file rather than the bundle: this is a claim about
    // evaluation order, and a minified chunk is the wrong place to make one.
    //
    // The ordering is not cosmetic. ESM evaluates every import before the first
    // statement, so the only lever the generator has is position *within the
    // import list* — last there means the kit's modules are evaluated and its
    // calls have not run, which is what lets a site arm a document-level
    // behaviour before the first island starts hydrating.
    const generated = fs.readFileSync(path.join(site, ".mdocs/entry.ts"), "utf8");
    const imported = generated.indexOf('import "../client/boot.ts"');
    const kit = generated.indexOf('from "@standarx/mdocs/react/hydrate"');
    const called = generated.indexOf("wireAxisControls(document)");

    expect(imported, "the site's script is not imported at all").toBeGreaterThan(-1);
    expect(imported).toBeGreaterThan(kit);
    expect(imported).toBeLessThan(called);
  });
});
