import type { ReactNode } from "react";
import { renderInline } from "../../core/content/markdown";
import type { ApiRow, ApiTable } from "../../core/model";
import { useLabels } from "../labels-context";

/** A run of consecutive rows the generator gave the same heading, or none. */
interface RowRun {
  readonly label: string | null;
  readonly rows: readonly ApiRow[];
}

/**
 * The rows cut into runs, which is the only grouping this renderer can do.
 *
 * Consecutive and never gathered: two runs may carry the same label and stay two
 * runs. That is not a limitation to work around, it is the contract — the
 * generator emits rows in the order its source declares them, so a renderer that
 * collected every row with the same heading would be reordering an author's
 * interface on a guess about what the heading meant.
 */
function rowRuns(rows: readonly ApiRow[]): readonly RowRun[] {
  const runs: { label: string | null; rows: ApiRow[] }[] = [];
  for (const row of rows) {
    // `== null`, as everywhere these tables are read: a row whose author wrote no
    // banner has no key at all by the time it has been through `JSON.parse`.
    const label = row.group == null ? null : row.group;
    const last = runs.at(-1);
    if (last === undefined || last.label !== label) runs.push({ label, rows: [row] });
    else last.rows.push(row);
  }
  return runs;
}

/**
 * A table with no rows has nothing to put under Prop / Type / Notes, and three
 * headers over an empty body is exactly what a reader cannot tell from a broken
 * generator. Such a table states itself in one cell instead — and the verb comes
 * from the field that carries the text, not from the emptiness: `= …` for an
 * alias's definition, `extends …` for an interface that inherits every member.
 *
 * A table whose rows carry headings is cut into one `<tbody>` per run, and the
 * `<tbody>` is the grouping rather than a wrapper around it: `scope="rowgroup"`
 * means "header for the rest of this row group", and the row group is exactly
 * that element. Left in one `<tbody>` the same attribute would hand the first
 * heading every row in the table, the rows of every later group included.
 *
 * Rows above the first heading are a run with no label, and they are rendered
 * with no band. Six of the interfaces this was written for open that way, and
 * the honest thing to say about those rows is that their author named no group —
 * never that they belong to the one below them.
 */
export function PropsTable({ table }: { readonly table: ApiTable }): ReactNode {
  const labels = useLabels();
  // `== null`, not `=== undefined`: these tables arrive through `JSON.parse`,
  // which cannot produce `undefined`. A generator that omits the key gives one, a
  // generator that writes it out gives the other, and both mean absent.
  const inherited = table.extends == null ? null : `extends ${table.extends}`;
  const defined = table.definition == null ? null : `= ${table.definition}`;
  const empty = table.rows.length === 0;
  // The definition never appears twice: an empty table spends it in the cell, so
  // the caption keeps the name alone.
  const sole = empty ? (defined ?? inherited) : null;

  return (
    <table className="mira-docs__props">
      <caption>
        {table.name}
        {empty || inherited === null ? null : ` — ${inherited}`}
      </caption>
      {empty ? null : (
        <thead>
          <tr>
            <th scope="col">{labels.prop}</th>
            <th scope="col">{labels.type}</th>
            <th scope="col">{labels.notes}</th>
          </tr>
        </thead>
      )}
      {empty ? (
        <tbody>
          {sole === null ? null : (
            <tr>
              {/* Marked so the type column's chip cannot claim it: that rule is
                  `td:first-of-type`, and this lone cell is one. */}
              <td className="mira-docs__definition">
                <code>{sole}</code>
              </td>
            </tr>
          )}
        </tbody>
      ) : (
        rowRuns(table.rows).map((run) => (
          // A run is never empty, so its first row names it — and that name is
          // already unique within the table, being the key of the rows below.
          <tbody key={run.rows[0]?.name ?? ""}>
            {run.label === null ? null : (
              <tr>
                {/* `th` and not `td`, and the two reasons agree. A cell heading
                    the rows below it is a header, which is the honest half; and
                    the type column's chip is `td:first-of-type … code`, so as a
                    cell this band's own inline code would be drawn as a type chip
                    stretched across the table — the collision
                    `.mira-docs__definition` was invented for.

                    No class. `[scope="rowgroup"]` is the hook, it is already
                    load-bearing, and it carries the specificity the style needs.
                    A class here would be a second name for one fact. */}
                <th
                  scope="rowgroup"
                  // Three, matching the `thead`: without it the row is two cells
                  // short and a reader hears two blanks after the heading.
                  colSpan={3}
                  // The author's own words, and they have carried inline code
                  // since the day they were written — one of these headings names
                  // `DialogMachineProps` in backticks. Rendered like a note for
                  // that reason, and not for symmetry.
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown from this site's own api/*.json
                  dangerouslySetInnerHTML={{ __html: renderInline(run.label) }}
                />
              </tr>
            )}
            {run.rows.map((row) => (
              <tr key={row.name}>
                <th scope="row">
                  <code>{row.name}</code>
                </th>
                <td>
                  <code>{row.type}</code>
                </td>
                <td
                  // Authored as Markdown by the generator that read the JSDoc, so
                  // inline code in a note is code. Safe for the same reason the prose
                  // segment is: the table is not an island, nothing re-parses it.
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown from this site's own api/*.json
                  dangerouslySetInnerHTML={{
                    __html: row.notes == null ? "—" : renderInline(row.notes),
                  }}
                />
              </tr>
            ))}
          </tbody>
        ))
      )}
    </table>
  );
}
