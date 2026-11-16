import { defineConfig } from "@standarx/mdocs/config";

/**
 * The engine's own fixture: a small site that needs no UI library, so the
 * package builds and tests with nothing beside it.
 *
 * Two of the three categories have no page on purpose: they are the fixture for
 * the rule that an empty category is drawn nowhere, which
 * `tests/cli/site.test.ts` asserts.
 */
export default defineConfig({
  contentDir: "content",
  demosDir: "demos",
  apiDir: "api",
  siteName: "Fixture Docs",
  categories: [
    { slug: "forms", label: "Forms", blurb: "Controls that hold a value." },
    { slug: "disclosure", label: "Disclosure", blurb: "A region that opens and closes." },
    { slug: "display", label: "Display", blurb: "Parts that carry no state of their own." },
  ],
  stylesheets: ["@standarx/mdocs/styles/docs.css"],
  scripts: ["./client/boot.ts"],
});
