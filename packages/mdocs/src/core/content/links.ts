import { posix } from "node:path";

export type LinkResolution =
  | { readonly kind: "route"; readonly route: string; readonly fragment: string }
  | { readonly kind: "unknown"; readonly resolved: string };

const MARKDOWN_LINK = /^([^#?]*\.md)(#.*)?$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Where a relative link to a `.md` file lands, or null when the link is not one.
 *
 * `routes` maps each scanned file, relative to the content root, to its route, so
 * the file-to-route mapping stays the scan's own. Absolute URLs, root-relative paths,
 * pure fragments and anything not ending in `.md` are not this function's business.
 */
export function resolveLink(
  file: string,
  href: string,
  routes: ReadonlyMap<string, string>,
): LinkResolution | null {
  if (href.startsWith("#") || href.startsWith("/") || SCHEME.test(href)) return null;
  const match = MARKDOWN_LINK.exec(href);
  if (match === null) return null;
  const target = match[1] ?? "";
  const fragment = match[2] ?? "";
  let decoded = target;
  try {
    decoded = decodeURI(target);
  } catch {
    decoded = target;
  }
  const resolved = posix.normalize(posix.join(posix.dirname(file), decoded));
  const route = routes.get(resolved);
  return route === undefined
    ? { kind: "unknown", resolved }
    : { kind: "route", route, fragment };
}
