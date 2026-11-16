import type { PageModel, SeeAlsoLink } from "../model";

/**
 * What a `related:` route that matches no page does: `error` throws, naming the
 * source file and the route, which is what a build wants; `warn` reports it and
 * leaves the link out, which is what a watch loop wants.
 */
export type RelatedPolicy = "error" | "warn";

/**
 * Each page's `related` routes matched against the pages that were scanned, so a
 * page carries the title and description of what it points at.
 *
 * It runs where every page is known — a route can only be checked against the
 * whole set. A page with no `related` is returned untouched.
 */
export function resolveRelated(
  pages: readonly PageModel[],
  policy: RelatedPolicy,
  warn: (message: string) => void = console.warn,
): readonly PageModel[] {
  const byRoute = new Map(pages.map((page) => [page.route, page]));
  return pages.map((page) => {
    if (page.related.length === 0) return page;
    const seeAlso: SeeAlsoLink[] = [];
    for (const route of page.related) {
      const target = byRoute.get(route);
      if (target === undefined) {
        const message = `${page.file ?? page.route}: related route ${route} matches no page`;
        if (policy === "error") throw new Error(message);
        warn(message);
        continue;
      }
      seeAlso.push({ route: target.route, title: target.title, description: target.description });
    }
    return { ...page, seeAlso };
  });
}
