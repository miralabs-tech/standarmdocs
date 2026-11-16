import { TOC } from "../core/content/toc";

/**
 * Which section the reader is in, marked on its link in the table of contents.
 *
 * Progressive in the plain sense: the contents are anchors and work without this.
 * What the module adds is `aria-current="location"` on the link of the section
 * being read, which CSS draws as the current item.
 *
 * A heading is "current" from the moment its top crosses a line a quarter of the
 * way down the viewport until the next one does. The observer only says *when* to
 * look — it watches the band above that line, so each crossing, in either
 * direction, triggers one recount — and the answer comes from the headings'
 * positions, so it cannot drift from what is on screen.
 */

/** Where the line sits, as a share of the viewport's height. */
const LINE = 0.25;

export interface HeadingTop {
  readonly id: string;
  readonly top: number;
}

/**
 * The last heading whose top is at or above `line`, in document order; none while
 * the reader is above the first.
 */
export function currentHeading(headings: readonly HeadingTop[], line: number): string | null {
  let current: string | null = null;
  for (const heading of headings) {
    if (heading.top > line) break;
    current = heading.id;
  }
  return current;
}

function fragment(link: HTMLAnchorElement): string | null {
  const href = link.getAttribute("href");
  if (href === null || !href.startsWith("#") || href.length < 2) return null;
  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}

export function wireToc(document: Document): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>(`[${TOC}] a[href^="#"]`)];
  const ids = [...new Set(links.map(fragment))].filter((id): id is string => id !== null);
  const targets = ids
    .map((id) => document.getElementById(id))
    .filter((element): element is HTMLElement => element !== null);
  const view = document.defaultView;
  if (targets.length === 0 || view === null || typeof IntersectionObserver === "undefined") return;

  // At the end of the page the last sections can never reach the line, so the
  // whole viewport counts and the last heading in view is the current one.
  const root = document.documentElement;
  const atBottom = (): boolean => view.innerHeight + view.scrollY >= root.scrollHeight - 2;
  let bottom = atBottom();

  const mark = (): void => {
    const headings = targets
      .map((element) => ({ id: element.id, top: element.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top);
    const line = bottom ? view.innerHeight : view.innerHeight * LINE;
    const current = currentHeading(headings, line);
    for (const link of links) {
      if (fragment(link) === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  };

  const band = `${Math.round(-(1 - LINE) * 100)}%`;
  const observer = new IntersectionObserver(mark, { rootMargin: `0px 0px ${band} 0px` });
  for (const element of targets) observer.observe(element);
  view.addEventListener(
    "scroll",
    () => {
      const now = atBottom();
      if (now === bottom) return;
      bottom = now;
      mark();
    },
    { passive: true },
  );
  mark();
}
