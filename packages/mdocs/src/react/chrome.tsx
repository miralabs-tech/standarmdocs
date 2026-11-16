import type { ReactNode } from "react";
import { AXIS_CONTROLS } from "../core/axes";
import { withBase } from "../core/base";
import { SEARCH_MOUNT } from "../core/search";
import {
  NAV_BAR,
  NAV_MENU,
  orderEntries,
  SIDEBAR_CATEGORY,
  sidebarBootScript,
} from "../core/sidebar";

export interface ChromeCategory {
  readonly slug: string;
  readonly label: string;
  readonly blurb?: string;
}

export interface ChromeEntry {
  readonly route: string;
  readonly title: string;
  readonly group: string | undefined;
  /** The page's own front matter description, which is what an index grid shows. */
  readonly description: string | undefined;
  /** The page's `sidebar.order`; pages with one come first in their category. */
  readonly order?: number | undefined;
}

export interface ChromeProps {
  readonly categories: readonly ChromeCategory[];
  readonly entries: readonly ChromeEntry[];
  readonly current: string;
  /**
   * Why the build is degraded. A string renders the banner; `null` is a build
   * with nothing to report, including the deliberate `--chrome=static` one.
   */
  readonly degraded: string | null;
  /** Named on the compact top bar that shows beside the navigation drawer. */
  readonly siteName?: string;
  /** The path the site is served under, normalized. Absent, `/`. */
  readonly base?: string;
}

interface Placement {
  /** Pages that head a section rather than sitting in one. Rendered first, unlabelled. */
  readonly lead: readonly ChromeEntry[];
  readonly sections: readonly { readonly category: ChromeCategory; readonly items: readonly ChromeEntry[] }[];
}

/**
 * Every entry placed exactly once, or an error naming the one that could not be.
 *
 * The filter this replaces was `entry.group === category.slug` inside the render,
 * which is the same rule with the failure case left out: an entry matching no
 * category matched nothing and was rendered nowhere. Not last, not misplaced —
 * absent, on a site whose sidebar is its only navigation. Three of the first
 * forty-one pages were in that state and the build reported all forty-one.
 *
 * So the two cases are separated here. No group at all is a section head and
 * leads the sidebar; a group no category claims is a `mdocs.config.ts` missing an
 * entry, and there is nothing sensible to render for it.
 */
export function placeEntries(
  categories: readonly ChromeCategory[],
  entries: readonly ChromeEntry[],
): Placement {
  const known = new Set(categories.map((category) => category.slug));
  const orphans = entries.filter(
    (entry) => entry.group !== undefined && !known.has(entry.group),
  );
  if (orphans.length > 0) {
    const named = orphans.map((entry) => `${entry.route} (group "${entry.group}")`).join(", ");
    throw new Error(`no category for: ${named} — add one to \`categories\` in mdocs.config.ts`);
  }

  return {
    // Shallowest first, then alphabetical. The scan orders pages by file path,
    // where `components/index.md` precedes `index.md` — so left alone the sidebar
    // opened on a section's landing page and listed the site's own front page
    // under it.
    lead: entries
      .filter((entry) => entry.group === undefined)
      .toSorted((a, b) => {
        const depth = a.route.split("/").length - b.route.split("/").length;
        return depth === 0 ? a.route.localeCompare(b.route) : depth;
      }),
    sections: categories
      .map((category) => ({
        category,
        items: orderEntries(entries.filter((entry) => entry.group === category.slug)),
      }))
      .filter((section) => section.items.length > 0),
  };
}

function Link({
  entry,
  current,
  base,
}: {
  readonly entry: ChromeEntry;
  readonly current: string;
  readonly base: string;
}): ReactNode {
  return (
    <li>
      <a href={withBase(base, entry.route)} {...(entry.route === current ? { "aria-current": "page" } : {})}>
        {entry.title}
      </a>
    </li>
  );
}

/**
 * The axis switch, as markup that does nothing until a script says otherwise.
 *
 * Hidden by CSS until the boot script sets its flag on `<html>`, which is not a
 * progressive-enhancement flourish: these buttons write an attribute on `<html>`
 * and have no meaning without script, and a control that is visible and inert is
 * worse than one that never appeared. Readers with no JavaScript keep the auto
 * case, which is the media query — the same thing the buttons default to.
 *
 * The flag is set from `<head>`, before paint, so the control is never revealed
 * in a second pass and never shifts the sidebar under a reader's cursor. The
 * `aria-pressed` values below say "auto" because the server cannot know the
 * reader's stored preference; the module script corrects them from the attributes
 * the boot script already applied.
 *
 * Plain buttons and no island. The rest of the sidebar is anchors precisely so it
 * works before any script arrives, and handing this one control to React would
 * put the whole chrome behind a hydration boundary to win nothing.
 */
function AxisControls(): ReactNode {
  return (
    <div className="mira-docs__axes" data-mira-axes>
      {AXIS_CONTROLS.map((control) => (
        <div key={control.axis} className="mira-docs__axis" role="group" aria-label={control.label}>
          {control.values.map((value) => (
            <button
              key={value.value}
              type="button"
              data-mira-axis={control.axis}
              data-mira-axis-value={value.value}
              aria-pressed={value.value === "" ? "true" : "false"}
            >
              {value.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The compact top bar, rendered for everyone and shown to no one without script.
 *
 * It holds an empty mount point for the drawer's trigger, the site's name and an
 * empty mount point for the search trigger. The stylesheet keeps it out of the
 * layout until the client module has mounted the trigger, so a reader with no
 * script never sees a control that does nothing and keeps the sidebar in the flow
 * at every width.
 */
export function NavBar({ siteName }: { readonly siteName: string | undefined }): ReactNode {
  return (
    <div className="mira-docs__bar" {...{ [NAV_BAR]: "" }}>
      <span {...{ [NAV_MENU]: "" }} />
      {siteName === undefined ? null : <span className="mira-docs__bar-name">{siteName}</span>}
      <span className="mira-docs__bar-search" {...{ [SEARCH_MOUNT]: "" }} />
    </div>
  );
}

/**
 * The chrome, static markup and no island.
 *
 * A navigation that needed hydrating would be inert to a keyboard until its
 * script arrived, on a site whose subject is keyboard behaviour. So the sidebar
 * is anchors, and it works with the script blocked.
 *
 * This is what every build renders. The ui package only adds behaviour on top
 * of this markup, so the fallback half of `--chrome=` is exercised by every build
 * and cannot rot unnoticed.
 */
export function StaticChrome({
  categories,
  entries,
  current,
  degraded,
  base = "/",
}: ChromeProps): ReactNode {
  const { lead, sections } = placeEntries(categories, entries);

  return (
    <div className="mira-docs__sidebar">
      {degraded === null ? null : (
        <p className="mira-docs__banner" role="status">
          {degraded}
        </p>
      )}
      <div className="mira-docs__search" {...{ [SEARCH_MOUNT]: "" }} />
      <AxisControls />
      <nav aria-label="Documentation">
        {lead.length === 0 ? null : (
          <ul className="mira-docs__lead">
            {lead.map((entry) => (
              <Link key={entry.route} entry={entry} current={current} base={base} />
            ))}
          </ul>
        )}
        {sections.map(({ category, items }) => (
          <section key={category.slug}>
            {/* A category folds, and it folds with no script: `<details>` is the
                one disclosure the platform ships, keyboard and all. Open by
                default, because a sidebar that arrives folded hides the site;
                the reader's own folds are remembered by the script below. The
                heading stays a heading inside the summary — the outline of the
                page does not change because a section can close. */}
            <details open {...{ [SIDEBAR_CATEGORY]: category.slug }}>
              <summary>
                <h2>{category.label}</h2>
              </summary>
              <ul>
                {items.map((entry) => (
                  <Link key={entry.route} entry={entry} current={current} base={base} />
                ))}
              </ul>
            </details>
          </section>
        ))}
      </nav>
      {/* Last in the column, so every element it reads exists when it runs — and
          before the rest of the document is parsed, so the column is scrolled
          before the reader sees it. See `core/sidebar.ts`. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the kit's own boot script, a string literal built at render time from nothing outside this package */}
      <script dangerouslySetInnerHTML={{ __html: sidebarBootScript() }} />
    </div>
  );
}
