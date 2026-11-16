import { TAB, TABS_STORAGE_KEY } from "../core/content/tabs";

/**
 * The half of the tab strip a reader has to act to reach.
 *
 * Split from the boot script on the same line the sidebar's is: what must happen
 * before paint is inline, and what only answers a press can arrive with the
 * bundle. Hiding the inactive panels is the first kind — miss it by a frame and
 * every page flashes its whole reference. Switching between them is the second:
 * a press that lands while this module is still in flight does nothing, which is
 * exactly what the axis switch does and for exactly as long.
 *
 * One listener on the document rather than one per strip, for the reason the
 * axis switch keeps: the article is not an island and is never re-rendered, so
 * there is no lifecycle to attach to and nothing to tear down.
 */

function panelOf(tab: Element): HTMLElement | null {
  const id = tab.getAttribute("aria-controls");
  if (id === null) return null;
  return tab.ownerDocument.getElementById(id);
}

function tabsIn(group: Element): readonly HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>(`[${TAB}]`)];
}

/**
 * Applied to every tab of the strip, never only to the two that changed.
 *
 * The state lives in the attributes, and the attributes were written by a boot
 * script this module never spoke to. Reading "which one was on" from anywhere
 * but the DOM would be a second copy of the truth, and the first load after a
 * reader chose something is where the two would disagree.
 */
function select(group: Element, slug: string, focus: boolean): void {
  for (const tab of tabsIn(group)) {
    const on = tab.getAttribute(TAB) === slug;
    tab.setAttribute("aria-selected", String(on));
    tab.setAttribute("tabindex", on ? "0" : "-1");
    const panel = panelOf(tab);
    if (panel === null) continue;
    if (on) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "");
    if (on && focus) tab.focus();
  }

  try {
    localStorage.setItem(TABS_STORAGE_KEY, slug);
  } catch {
    // A browser set to block site data still gets the tabs, for this page.
  }
}

/**
 * Automatic activation — the arrow key moves the focus and the panel follows.
 *
 * The APG allows either, and makes the choice on what a panel costs to show.
 * Every panel here is already in the document and already rendered; the key only
 * removes an attribute. Manual activation would buy nothing and would ask a
 * keyboard reader for a second press on every tab.
 */
function step(tabs: readonly HTMLElement[], from: number, key: string): number | null {
  if (key === "ArrowRight") return (from + 1) % tabs.length;
  if (key === "ArrowLeft") return (from - 1 + tabs.length) % tabs.length;
  if (key === "Home") return 0;
  if (key === "End") return tabs.length - 1;
  return null;
}

export function wireTabs(document: Document): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tab = target.closest<HTMLElement>(`[${TAB}]`);
    const group = tab?.closest("[data-mira-tabs]");
    const slug = tab?.getAttribute(TAB);
    if (tab === null || tab === undefined || group == null || slug == null) return;
    select(group, slug, false);
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tab = target.closest<HTMLElement>(`[${TAB}]`);
    const group = tab?.closest("[data-mira-tabs]");
    if (tab === null || tab === undefined || group == null) return;

    const tabs = tabsIn(group);
    const next = step(tabs, tabs.indexOf(tab), event.key);
    if (next === null) return;
    const slug = tabs[next]?.getAttribute(TAB);
    if (slug == null) return;

    // Only once a key is one of ours: Tab still leaves the strip, and Home and
    // End still reach the top and bottom of a page whose focus is elsewhere.
    event.preventDefault();
    select(group, slug, true);
  });
}
