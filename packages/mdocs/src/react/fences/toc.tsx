import type { ReactNode } from "react";
import { TOC } from "../../core/content/toc";
import type { TocEntry } from "../../core/model";

/** A `##` and the `###` that follow it; a `###` before any `##` stands alone. */
interface TocGroup {
  readonly entry: TocEntry;
  readonly children: TocEntry[];
}

function tocGroups(toc: readonly TocEntry[]): readonly TocGroup[] {
  const groups: TocGroup[] = [];
  for (const entry of toc) {
    const last = groups.at(-1);
    if (entry.depth === 3 && last !== undefined && last.entry.depth === 2) last.children.push(entry);
    else groups.push({ entry, children: [] });
  }
  return groups;
}

function TocList({ toc }: { readonly toc: readonly TocEntry[] }): ReactNode {
  return (
    <ol className="docs-toc__list">
      {tocGroups(toc).map(({ entry, children }) => (
        <li key={entry.id}>
          <a href={`#${entry.id}`}>{entry.text}</a>
          {children.length === 0 ? null : (
            <ol className="docs-toc__list">
              {children.map((child) => (
                <li key={child.id}>
                  <a href={`#${child.id}`}>{child.text}</a>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * "On this page", twice: once for the wide layout and once for the narrow one.
 *
 * Two copies and CSS picks one, because a closed `<details>` cannot be made to
 * show its content on a wide screen without `::details-content`, which not every
 * engine ships. The copies share no `id` — every link is a plain `#fragment` —
 * so the document stays valid, and the module that marks the current section
 * marks both.
 */
export function TocRail({ toc }: { readonly toc: readonly TocEntry[] }): ReactNode {
  return (
    <nav className="docs-toc docs-toc--rail" aria-label="On this page" {...{ [TOC]: "" }}>
      <p className="docs-toc__title">On this page</p>
      <TocList toc={toc} />
    </nav>
  );
}

export function TocFold({ toc }: { readonly toc: readonly TocEntry[] }): ReactNode {
  return (
    <nav className="docs-toc docs-toc--fold" aria-label="On this page" {...{ [TOC]: "" }}>
      <details>
        <summary>On this page</summary>
        <TocList toc={toc} />
      </details>
    </nav>
  );
}
