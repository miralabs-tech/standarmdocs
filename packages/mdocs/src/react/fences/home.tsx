import type { ReactNode } from "react";
import { withBase } from "../../core/base";
import { type ChromeEntry, type ChromeProps, placeEntries } from "../chrome";

function HomeCards({
  entries,
  base,
}: {
  readonly entries: readonly ChromeEntry[];
  readonly base: string;
}): ReactNode {
  return (
    <ul className="mira-docs__cards">
      {entries.map((entry) => (
        <li key={entry.route}>
          <a className="mira-docs__card" href={withBase(base, entry.route)}>
            <span className="mira-docs__card-title">{entry.title}</span>
            {entry.description === undefined || entry.description === "" ? null : (
              <span className="mira-docs__card-text">{entry.description}</span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * The front page a folder with no `index.md` gets: every page as a card, root
 * pages first and then one block per sidebar group, in sidebar order.
 */
export function HomeFence({ chrome }: { readonly chrome: ChromeProps }): ReactNode {
  const { lead, sections } = placeEntries(chrome.categories, chrome.entries);
  const base = chrome.base ?? "/";
  return (
    <div className="mira-docs__home">
      {lead.length === 0 ? null : <HomeCards entries={lead} base={base} />}
      {sections.map(({ category, items }) => (
        <section key={category.slug} className="mira-docs__home-group">
          <h2>{category.label}</h2>
          <HomeCards entries={items} base={base} />
        </section>
      ))}
    </div>
  );
}
