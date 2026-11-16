/**
 * What the sidebar's boot script does to a real column, on a real engine.
 *
 * The script is the one piece of the chrome that runs, so it is the one piece a
 * static-markup test cannot vouch for. It is run here as the function body it
 * exports, against a column the chrome itself rendered — never a hand-built
 * one, or the test would pass on markup the chrome does not produce.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { SIDEBAR_BOOT_BODY, SIDEBAR_CLOSED_KEY, SIDEBAR_SCROLL_KEY } from "../src/core/sidebar";
import { type ChromeEntry, StaticChrome } from "../src/react/chrome";

// Eight categories of eight pages: a column far taller than the 240px it is
// given, so that a page in the last category starts out of view.
const CATEGORIES = Array.from({ length: 8 }, (_, index) => ({
  slug: `c${index}`,
  label: `Category ${index}`,
}));

const ENTRIES: readonly ChromeEntry[] = CATEGORIES.flatMap((category) =>
  Array.from({ length: 8 }, (_, index) => ({
    route: `/${category.slug}/p${index}`,
    title: `Page ${index}`,
    group: category.slug,
    description: undefined,
  })),
);

const hosts: HTMLElement[] = [];

function mount(current: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(StaticChrome, { categories: CATEGORIES, entries: ENTRIES, current, degraded: null }),
  );
  document.body.append(host);
  hosts.push(host);
  const sidebar = host.querySelector<HTMLElement>(".mira-docs__sidebar");
  if (sidebar === null) throw new Error("the chrome rendered no sidebar");
  // The column as the stylesheet makes it: a scroller of fixed height. The sheet
  // itself is not loaded here, so the two properties that matter are set by hand.
  sidebar.style.cssText = "height:240px;overflow-y:auto";
  return sidebar;
}

/** The script as the page runs it, handed the column it was rendered in. */
function boot(sidebar: HTMLElement): void {
  new Function("s", SIDEBAR_BOOT_BODY)(sidebar);
}

function details(sidebar: HTMLElement, slug: string): HTMLDetailsElement {
  const found = sidebar.querySelector<HTMLDetailsElement>(`details[data-category="${slug}"]`);
  if (found === null) throw new Error(`no category ${slug}`);
  return found;
}

function current(sidebar: HTMLElement): HTMLElement {
  const found = sidebar.querySelector<HTMLElement>('[aria-current="page"]');
  if (found === null) throw new Error("no current link");
  return found;
}

function inView(sidebar: HTMLElement, element: HTMLElement): boolean {
  const box = sidebar.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return rect.top >= box.top && rect.bottom <= box.bottom;
}

/** `toggle` is dispatched asynchronously; one task is enough for it to land. */
async function toggled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  sessionStorage.removeItem(SIDEBAR_SCROLL_KEY);
  localStorage.removeItem(SIDEBAR_CLOSED_KEY);
});

describe("the sidebar's boot script", () => {
  it("brings the current link into the column's view when nothing was saved", () => {
    const sidebar = mount("/c7/p7");
    expect(inView(sidebar, current(sidebar))).toBe(false);

    boot(sidebar);

    expect(sidebar.scrollTop).toBeGreaterThan(0);
    expect(inView(sidebar, current(sidebar))).toBe(true);
  });

  it("restores the position the tab last saved, when the current link is inside it", () => {
    const sidebar = mount("/c3/p2");
    const link = current(sidebar);
    // A position that keeps the link in view, as the one saved when the reader
    // clicked it always does.
    const saved = Math.max(0, link.offsetTop - 40);
    sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(saved));

    boot(sidebar);

    expect(sidebar.scrollTop).toBe(saved);
    expect(inView(sidebar, link)).toBe(true);
  });

  it("saves every position the column is scrolled to", () => {
    const sidebar = mount("/c0/p0");
    boot(sidebar);

    sidebar.scrollTop = 80;
    sidebar.dispatchEvent(new Event("scroll"));

    expect(sessionStorage.getItem(SIDEBAR_SCROLL_KEY)).toBe("80");
  });

  it("applies the folds a reader made, except around the page they are on", () => {
    localStorage.setItem(SIDEBAR_CLOSED_KEY, JSON.stringify(["c1", "c5"]));
    const sidebar = mount("/c5/p0");

    boot(sidebar);

    expect(details(sidebar, "c1").open).toBe(false);
    // Folded by the reader, unfolded by the page: the category holding the
    // current page is never hidden from them.
    expect(details(sidebar, "c5").open).toBe(true);
    expect(details(sidebar, "c0").open).toBe(true);
  });

  it("remembers a fold, and forgets one the reader is standing in", async () => {
    const first = mount("/c0/p0");
    boot(first);

    details(first, "c3").open = false;
    await toggled();
    expect(JSON.parse(localStorage.getItem(SIDEBAR_CLOSED_KEY) ?? "[]")).toEqual(["c3"]);

    // A later page, inside the folded category: it opens, and the fold is
    // dropped rather than reapplied on the next page.
    const second = mount("/c3/p4");
    boot(second);
    expect(details(second, "c3").open).toBe(true);
    await toggled();
    expect(JSON.parse(localStorage.getItem(SIDEBAR_CLOSED_KEY) ?? "[]")).toEqual([]);
  });

  it("ignores a closed list that is not one", () => {
    localStorage.setItem(SIDEBAR_CLOSED_KEY, '{"not":"a list"}');
    const sidebar = mount("/c0/p0");

    expect(() => boot(sidebar)).not.toThrow();
    expect(details(sidebar, "c1").open).toBe(true);
  });
});
