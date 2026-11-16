// Deep imports, not the barrel: the barrel is the build entry point and reaches
// `node:fs`, which a browser test cannot import. The rule the generated client
// entry follows, followed here too.
import { MIRALABS_MATRIX } from "../../src/core/axes";
import type { ApiTables, PageModel } from "../../src/core/model";
import type { ChromeProps } from "../../src/react/chrome";
import type { DemoRegistry } from "../../src/react/registry";

/**
 * One page carrying all three shapes at once, which is what makes the suite a
 * proof rather than three separate ones: the second island of a four-entry
 * matrix is exercised with two other demos hydrating around it.
 */
export const DEMOS: DemoRegistry = {
  "disclosure-basic": () => import("./site/demos/disclosure-basic"),
  "counter-basic": () => import("./site/demos/counter-basic"),
  "portal-basic": () => import("./site/demos/portal-basic"),
};

export const MODEL: PageModel = {
  route: "/components/disclosure/disclosure",
  title: "Disclosure",
  description: "A button that opens and closes a region.",
  group: "disclosure",
  toc: [],
  related: [],
  segments: [
    { kind: "html", html: "<p>A button and the region it controls.</p>" },
    // The matrix belongs to this fence and not to the site: `disclosure-basic` earns
    // the four `MIRALABS_MATRIX` copies by being the axis demonstration, and the
    // other two would only cost hydration time. A single entry is still a matrix.
    { kind: "demo", id: "disclosure-basic", matrix: MIRALABS_MATRIX },
    { kind: "demo", id: "counter-basic", matrix: [{}] },
    { kind: "demo", id: "portal-basic", matrix: [{}] },
    { kind: "props", name: "disclosure" },
  ],
};

export const ISLAND_COUNT: number = MODEL.segments.reduce(
  (total, segment) => total + (segment.kind === "demo" ? segment.matrix.length : 0),
  0,
);

const GROUPS = ["forms", "disclosure", "display"] as const;

export const CHROME: ChromeProps = {
  categories: GROUPS.map((slug) => ({ slug, label: slug })),
  // One entry per group, so every category renders: the chrome drops a category
  // with nothing under it, which is what a sidebar should do and what the count
  // in the first test is measuring.
  entries: GROUPS.map((slug) => ({
    route: `/components/${slug}/example`,
    title: slug,
    group: slug,
    description: `The ${slug} example.`,
  })),
  current: "/components/disclosure/example",
  degraded: null,
};

export const API: ApiTables = {
  disclosure: [
    // A type alias, first, because it is the table with no rows: its definition is
    // the whole of what it has to say and it says it in a body cell. Kept in the
    // fixture the browser suite mounts so the cell is asserted as a real node in a
    // real document, not only as a string out of `renderToStaticMarkup`.
    {
      name: "DisclosureState",
      extends: undefined,
      definition: '"open" | "closed"',
      rows: [],
    },
    {
      name: "DisclosureProps",
      extends: undefined,
      definition: undefined,
      rows: [
        { name: "open?", type: "boolean", notes: "Controlled.", source: undefined },
        { name: "defaultOpen?", type: "boolean", notes: undefined, source: undefined },
        { name: "label", type: "string", notes: undefined, source: undefined },
        {
          name: "onOpenChange?",
          type: "((open: boolean) => void)",
          notes: undefined,
          source: undefined,
        },
      ],
    },
  ],
};
