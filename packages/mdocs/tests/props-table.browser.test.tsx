/**
 * The one thing about a grouped props table a static-markup test cannot answer.
 *
 * React 19 emits the attribute with the capital it was written with —
 * `colSpan="3"`, measured on 19.2.8, on `th` and `td` alike — and every argument
 * that this is harmless is an argument from the HTML spec: attribute names are
 * ASCII case-insensitive to a parser, so `colSpan` becomes `colspan` and the cell
 * spans. That is a claim about a browser, and this file is where it is measured
 * in one rather than reasoned about.
 *
 * It matters because the failure is quiet. A band that does not span is not a
 * broken page; it is a heading sitting in the first column with two empty cells
 * beside it, on every grouped table on the site, which looks like a design choice.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
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

function row(name: string, label: string | null): ApiRow {
  return {
    name,
    type: "boolean",
    notes: "A note long enough that the third column is not zero wide.",
    source: "thing.types.ts:1",
    group: label,
  };
}

const hosts: HTMLElement[] = [];

/** The page's own markup, in the document, so the browser lays it out. */
function mount(rows: readonly ApiRow[]): HTMLTableElement {
  const api: ApiTables = {
    thing: [{ name: "ThingProps", extends: undefined, definition: undefined, rows }],
  };
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(Page, { model: MODEL, chrome: CHROME, demos: {}, api }),
  );
  document.body.append(host);
  hosts.push(host);
  const table = host.querySelector("table.mira-docs__props");
  if (table === null) throw new Error("the page rendered no props table");
  return table as HTMLTableElement;
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

describe("the band that opens a group", () => {
  it("really spans every column, whatever case React wrote the attribute in", () => {
    const table = mount([
      row("open?", "openness"),
      row("defaultOpen?", "openness"),
      row("gap?", "positioning"),
    ]);

    const band = table.querySelector('th[scope="rowgroup"]');
    const name = table.querySelector('th[scope="row"]');
    if (band === null || name === null) throw new Error("no band, or no prop row");

    // The parser's own answer, which is the whole question: the property is
    // `colSpan` and it reads the attribute case-insensitively.
    expect((band as HTMLTableCellElement).colSpan).toBe(3);

    // And the layout's answer, which is the one a reader sees. Compared against
    // the prop-name column rather than against a number: a band that failed to
    // span would be exactly that column's width, and the table's own width is
    // whatever the viewport gave it.
    const bandWidth = band.getBoundingClientRect().width;
    const nameWidth = name.getBoundingClientRect().width;
    const tableWidth = table.getBoundingClientRect().width;
    expect(bandWidth).toBeGreaterThan(nameWidth);

    // Not exact equality, and the slack is measured rather than guessed: this
    // harness mounts the markup without the kit's stylesheet, so the table keeps
    // the user agent's `border-spacing: 2px` and the band comes back 4px inside
    // the table's own box. Ten is enough room for that and nowhere near enough to
    // let a band that spans two columns of three through.
    expect(tableWidth - bandWidth).toBeLessThan(10);
  });

  it("puts each run in a row group of its own, which is what the scope claims", () => {
    // `scope="rowgroup"` says "header for the rest of this row group". Read back
    // off the live DOM: the band's own `tbody` holds it and its two rows, and the
    // second group is a different element entirely.
    const table = mount([
      row("open?", "openness"),
      row("defaultOpen?", "openness"),
      row("gap?", "positioning"),
    ]);

    const bodies = [...table.querySelectorAll("tbody")];
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.querySelectorAll("tr")).toHaveLength(3);
    expect(bodies[1]?.querySelectorAll("tr")).toHaveLength(2);
    expect(bodies[0]?.querySelector('th[scope="rowgroup"]')?.textContent).toBe("openness");
    expect(bodies[1]?.querySelector('th[scope="rowgroup"]')?.textContent).toBe("positioning");
  });

  it("leaves a table whose rows carry no heading with one row group and no band", () => {
    const table = mount([row("open?", null), row("gap?", null)]);
    expect(table.querySelectorAll("tbody")).toHaveLength(1);
    expect(table.querySelector('th[scope="rowgroup"]')).toBeNull();
  });
});
