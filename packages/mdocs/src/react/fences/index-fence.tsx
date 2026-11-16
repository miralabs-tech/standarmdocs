import type { ReactNode } from "react";
import { withBase } from "../../core/base";
import { orderEntries } from "../../core/sidebar";
import type { ChromeEntry } from "../chrome";

/**
 * What a ```index fence becomes: every page of one group, as a grid of cards.
 *
 * The group is a directory, never a list, so a component added under
 * `content/components/overlays/` joins the overlays grid with no edit here and
 * none in the page that renders it. An empty grid is refused rather than drawn —
 * a heading over nothing is what a typo in the fence looks like, and it looks
 * exactly like a category that is genuinely still empty.
 */
export function IndexFence({
  group,
  entries,
  base = "/",
}: {
  readonly group: string;
  readonly entries: readonly ChromeEntry[];
  readonly base?: string;
}): ReactNode {
  const items = orderEntries(entries.filter((entry) => entry.group === group));
  if (items.length === 0) throw new Error(`\`\`\`index ${group} matches no page`);

  return (
    <ul className="mira-docs__grid">
      {items.map((entry) => (
        <li key={entry.route}>
          <a href={withBase(base, entry.route)}>{entry.title}</a>
          {entry.description === undefined ? null : <p>{entry.description}</p>}
        </li>
      ))}
    </ul>
  );
}
