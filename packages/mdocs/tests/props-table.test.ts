/**
 * What a props table does with the two things JSON can actually hand it.
 *
 * These tables are not written in TypeScript. They are `api/<name>.json` files
 * read at build time and cast to `ApiTable[]` — a cast, so nothing checks them.
 * Both defects below were live in the only page the repo had built: the caption
 * read "DialogMachineProps — extends null", and a note about `alertdialog` shipped
 * its backticks as text.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApiRow, ApiTables, PageModel } from "../src/core/model";
import type { ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

const CHROME: ChromeProps = {
  categories: [],
  entries: [],
  current: "/thing",
  degraded: null,
};

const MODEL: PageModel = {
  route: "/thing",
  title: "Thing",
  description: undefined,
  group: undefined,
  toc: [],
  related: [],
  segments: [{ kind: "props", name: "thing" }],
};

/**
 * The table alone, never the page around it: the chrome's boot script is
 * JavaScript, and JavaScript says `null` — the word this file has to be able to
 * assert the absence of in a caption.
 */
function render(api: ApiTables): string {
  const html = renderToStaticMarkup(
    createElement(Page, { model: MODEL, chrome: CHROME, demos: {}, api }),
  );
  const table = /<table class="mira-docs__props">[\s\S]*?<\/table>/.exec(html)?.[0];
  if (table === undefined) throw new Error("the page rendered no props table");
  return table;
}

// `| undefined` on all three, and not for tidiness: `exactOptionalPropertyTypes` is
// on, so an optional property does not admit an explicit `undefined` — and passing
// one explicitly is half of what these tests are here to distinguish.
function table(over: {
  extends?: string | null | undefined;
  definition?: string | null | undefined;
  rows?: readonly ApiRow[] | undefined;
}): ApiTables {
  return {
    thing: [
      {
        name: "ThingProps",
        extends: over.extends,
        definition: over.definition,
        rows: over.rows ?? [],
      },
    ],
  };
}

/** Any row at all, for the tests whose subject is the table around it. */
const ROW: ApiRow = { name: "open?", type: "boolean", notes: undefined, source: undefined };

/** A row under a heading — or, with `null`, one whose author wrote none. */
function group(name: string, label: string | null): ApiRow {
  return { name, type: "boolean", notes: undefined, source: undefined, group: label };
}

/** The `<tbody>` elements of a rendered table, in order. */
function bodies(html: string): readonly string[] {
  return [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((match) => match[1] ?? "");
}

/**
 * A band carrying one heading — matched without regard to case.
 *
 * React 19 emits `colSpan="3"` with the capital it was written with, on `th` and
 * `td` alike (measured on 19.2.8), and an HTML parser reads attribute names
 * case-insensitively, so the served page spans correctly either way. Matching
 * case-insensitively here says the contract is the attribute and not React's
 * spelling of it; `props-table.browser.test.tsx` is where the spanning is
 * measured in a browser rather than argued from the spec.
 */
function band(label: string): RegExp {
  return new RegExp(`<th scope="rowgroup" colspan="3">${label}</th>`, "i");
}

describe("a props table renders what JSON can carry, not what TypeScript would have written", () => {
  // `rows: [ROW]` on both, and it is the point rather than scenery: the helper
  // defaults rows to empty, so without it these two would be asserting the caption
  // of a table that has no caption text left to assert — the empty-table branch
  // spends its heritage in a cell instead, and both would pass for the wrong reason.
  it("says nothing about a table that extends nothing, whether the key is absent or explicitly null", () => {
    // The generator omits the key; the committed example wrote it out. Both are
    // "extends nothing", and `JSON.parse` can only ever produce the second.
    expect(render(table({ extends: undefined, rows: [ROW] }))).not.toContain("extends");
    expect(render(table({ extends: null, rows: [ROW] }))).not.toContain("extends");
  });

  it("still names what a table does extend", () => {
    const html = render(table({ extends: "UseThingProps", rows: [ROW] }));
    expect(html).toContain("— extends UseThingProps");
    expect(html).toContain("<thead>");
  });

  it("renders inline code in a note as code, not as its backticks", () => {
    const html = render(
      table({
        rows: [
          {
            name: "role?",
            type: "ThingRole",
            notes: "`alertdialog` is what lets `alert-dialog` reuse this machine.",
            source: undefined,
          },
        ],
      }),
    );
    expect(html).toContain("<code>alertdialog</code>");
    expect(html).toContain("<code>alert-dialog</code>");
    expect(html).not.toContain("`alertdialog`");
  });

  it("shows an em dash for a note that is absent either way", () => {
    const absent = table({
      rows: [{ name: "open?", type: "boolean", notes: undefined, source: undefined }],
    });
    const asNull = table({
      rows: [{ name: "open?", type: "boolean", notes: null, source: undefined }],
    });
    expect(render(absent)).toContain("—");
    expect(render(asNull)).toContain("—");
    expect(render(asNull)).not.toContain("null");
  });

  it("leaves a note that is plain prose alone, with no paragraph wrapper around it", () => {
    const html = render(
      table({
        rows: [
          { name: "modal?", type: "boolean", notes: "Controlled.", source: undefined },
        ],
      }),
    );
    expect(html).toContain("Controlled.");
    // `renderInline`, not `render`: a table cell is not a document.
    expect(html).not.toContain("<p>Controlled.</p>");
  });
});

/**
 * The heading a run of rows sits under, which is the one thing in these tables
 * the generator reads from its source rather than derives.
 *
 * Every case here is a way the feature could rewrite a table rather than label
 * it: rows gathered out of their order, a run annexed by the heading above it,
 * or a heading printed as the backticks its author typed.
 */
describe("a run of rows under the heading its author wrote", () => {
  it("changes nothing at all for a table whose rows carry no heading", () => {
    // 834 of the 1058 rows on the generator feeding this kit. The band is an
    // addition for the tables that earned one, never a new shape for every table.
    const html = render(table({ rows: [ROW, group("gap?", null)] }));
    expect(html).not.toContain("rowgroup");
    expect(bodies(html)).toHaveLength(1);
  });

  it("opens each run with a band that heads exactly its own row group", () => {
    const html = render(
      table({
        rows: [
          group("open?", "openness"),
          group("defaultOpen?", "openness"),
          group("gap?", "positioning"),
        ],
      }),
    );

    // One `tbody` per run, and that is what makes `scope="rowgroup"` true: in a
    // single `tbody` the first band would head every row in the table.
    const [openness, positioning] = bodies(html);
    expect(bodies(html)).toHaveLength(2);
    expect(openness).toMatch(band("openness"));
    expect(openness).toContain("open?");
    expect(openness).toContain("defaultOpen?");
    expect(openness).not.toContain("gap?");
    expect(positioning).toMatch(band("positioning"));
    expect(positioning).not.toContain("open?");
  });

  it("spans every column, so a reader hears no blank cells after the heading", () => {
    // Three, matching the `thead`. A band two cells short is read out as the
    // heading followed by two empty cells, once per group, on every page.
    const html = render(table({ rows: [group("open?", "openness")] }));
    expect(html).toMatch(/colspan="3"/i);
    expect([...html.matchAll(/<th scope="col">/g)]).toHaveLength(3);
  });

  it("leaves the rows above the first heading unbanded, rather than annexing them", () => {
    // Six of the interfaces this was written for open this way — `open`,
    // `defaultOpen` and `presentation` stand above the first banner. Saying they
    // belong to the group below would be the renderer inventing a claim.
    const html = render(
      table({ rows: [group("role?", null), group("open?", "openness")] }),
    );
    const [head, openness] = bodies(html);
    expect(bodies(html)).toHaveLength(2);
    expect(head).toContain("role?");
    expect(head).not.toContain("rowgroup");
    expect(openness).toMatch(band("openness"));
  });

  it("keeps two runs of one name as two runs, and never gathers them", () => {
    // The contiguity contract. The generator emits rows in the order its source
    // declares them, so a renderer that collected every row sharing a heading
    // would be reordering an author's interface on a guess about what it meant.
    const html = render(
      table({
        rows: [group("dir?", "naming"), group("gap?", "positioning"), group("label?", "naming")],
      }),
    );
    expect(bodies(html)).toHaveLength(3);
    expect([...html.matchAll(/<th scope="rowgroup"/g)]).toHaveLength(3);
  });

  it("renders inline code in a heading as code, not as its backticks", () => {
    // Not hypothetical: one real heading reads "focus, dismissal, the rest
    // identical to `DialogMachineProps`" and stands over eighteen rows. It is the
    // same defect this file already pins for a note, on a second surface.
    const html = render(
      table({ rows: [group("autoFocus?", "focus, the rest as `DialogMachineProps`")] }),
    );
    expect(html).toContain("<code>DialogMachineProps</code>");
    expect(html).not.toContain("`DialogMachineProps`");
  });

  it("treats a null heading and an absent one alike, and prints neither", () => {
    // `JSON.parse` cannot produce `undefined`: a generator that omits the key
    // gives one, a generator that writes it out gives the other, both mean absent.
    const asNull = render(table({ rows: [group("open?", null)] }));
    const absent = render(table({ rows: [ROW] }));
    expect(asNull).not.toContain("rowgroup");
    expect(asNull).not.toContain("null");
    expect(absent).not.toContain("rowgroup");
  });

  it("adds bands without adding or losing a single prop row", () => {
    // The count a consuming site's gate is downstream of. Bands are `th`
    // elements in rows of their own; the prop rows are untouched and still one
    // `th[scope="row"]` each.
    const rows = [group("open?", "openness"), group("gap?", "positioning"), group("pad?", "positioning")];
    const banded = render(table({ rows }));
    const flat = render(table({ rows: rows.map((row) => ({ ...row, group: null })) }));
    expect([...banded.matchAll(/<th scope="row">/g)]).toHaveLength(3);
    expect([...flat.matchAll(/<th scope="row">/g)]).toHaveLength(3);
  });
});

/**
 * The table with no rows, which on the one generator feeding this kit is 102 of
 * 291 — a third of them. It used to render three column headers over an empty
 * body, which is indistinguishable from a generator that broke.
 *
 * Two shapes reach here and they are not the same statement. A type alias says
 * `= "a" | "b"`; an interface that declares no member of its own says
 * `extends Base`. The field that carries the text is what decides, never the
 * emptiness: on this generator 65 of the 102 are aliases and 37 are interfaces,
 * so a renderer that guessed from `rows.length === 0` would be wrong 37 times.
 */
describe("a table with no rows states itself instead of showing empty column headers", () => {
  it("drops the column headers, which have nothing left to head", () => {
    const html = render(table({ definition: "ThingRole | null" }));
    expect(html).not.toContain("<thead>");
    expect(html).not.toContain("Notes");
  });

  it("keeps the headers whenever there is a row to put under them", () => {
    expect(render(table({ definition: null, rows: [ROW] }))).toContain("<thead>");
  });

  it("states an alias with `=`, and never with the word extends", () => {
    const html = render(table({ definition: "ThingRole | null" }));
    expect(html).toContain("= ThingRole | null");
    expect(html).not.toContain("extends");
  });

  it("states an interface that inherits every member with extends, and states it once", () => {
    const html = render(table({ extends: "BaseProps" }));
    expect(html).toContain("extends BaseProps");
    // Not in the caption: the em dash is the caption's own separator, and a table
    // that spends its heritage in a cell must not also print it above.
    expect(html).not.toContain("— extends");
    expect(html.split("BaseProps").length - 1).toBe(1);
  });

  it("marks the cell so the type column's chip cannot claim it", () => {
    // `td:first-of-type code` in docs.css draws the type column's bordered chip,
    // and this lone cell is a first-of-type. The class is what the `:not()` there
    // hangs off; drop it and a whole union is drawn as a stretched chip.
    expect(render(table({ definition: "ThingRole" }))).toContain(
      '<td class="mira-docs__definition">',
    );
  });

  it("says nothing at all when a table carries neither, rather than inventing a row", () => {
    const html = render(table({ extends: null, definition: null }));
    expect(html).not.toContain("<td");
    expect(html).not.toContain("null");
  });

  it("still emits the exact table markup a consuming site counts, with bands in play", () => {
    // The same assertion as below, made on a grouped table: the bands are what
    // could have changed the element, and the gate matches it as a literal.
    expect(
      render(table({ rows: [group("open?", "openness"), group("gap?", "positioning")] })),
    ).toContain('<table class="mira-docs__props">');
  });

  it("still emits the exact table markup a consuming site counts", () => {
    // miralabs-ui's `check:site` matches `<table class="mira-docs__props">` as a
    // literal string and asserts the count equals the number of entries in the
    // component's JSON. A second class on this element makes it count zero tables
    // on every page of that site, so the element is a cross-repo contract.
    expect(render(table({ definition: "ThingRole" }))).toContain(
      '<table class="mira-docs__props">',
    );
  });
});
