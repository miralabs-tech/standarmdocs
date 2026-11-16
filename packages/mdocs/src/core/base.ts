/** Set on `<html>` by the shell when the site is served under a base other than `/`. */
export const BASE_ATTRIBUTE = "data-mdocs-base";

/**
 * A base path as the build wants it: a leading and a trailing slash, `/` for none.
 *
 * `"standarui"`, `"/standarui"` and `"/standarui/"` are one base. A value that
 * holds a scheme, a query or a fragment is a URL and not a path, and is refused.
 */
export function normalizeBase(value?: string): string {
  const raw = value ?? "";
  if (raw.includes("://") || raw.includes("?") || raw.includes("#")) {
    throw new Error(`base must be a path such as "/docs/", got "${raw}"`);
  }
  const inner = raw.replace(/^\/+|\/+$/g, "");
  return inner === "" ? "/" : `/${inner}/`;
}

/** A root-absolute `path` under a normalized `base`. `withBase("/", p)` is `p`. */
export function withBase(base: string, path: string): string {
  return base === "/" ? path : `${base.slice(0, -1)}${path}`;
}

/** The inverse of `withBase` on a pathname; a pathname outside the base is returned as it is. */
export function stripBase(base: string, pathname: string): string {
  if (base === "/") return pathname;
  if (pathname === base.slice(0, -1)) return "/";
  return pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname;
}

/**
 * A link written by hand, prefixed when it is root-absolute.
 *
 * Protocol-relative links and links that already start with the base are left as
 * they are, and so is everything that is not rooted at `/`.
 */
export function rootedHref(base: string, href: string): string {
  if (base === "/" || !href.startsWith("/") || href.startsWith("//")) return href;
  const bare = base.slice(0, -1);
  if (href === bare || href.startsWith(base) || href.startsWith(`${bare}?`) || href.startsWith(`${bare}#`)) {
    return href;
  }
  return withBase(base, href);
}
