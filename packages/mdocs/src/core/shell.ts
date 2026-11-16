import { axisAttributes, type Axes } from "./axes";
import { BASE_ATTRIBUTE } from "./base";

export interface ShellOptions {
  readonly title: string;
  readonly description: string | undefined;
  /** Module script, relative to the page's own directory. */
  readonly script: string;
  readonly stylesheets: readonly string[];
  /** Axes posted on `<html>`, which is where a page-wide default belongs. */
  readonly axes?: Axes;
  /**
   * Raw markup for `<head>`, last before the module script.
   *
   * It exists for exactly one thing that cannot be done any other way: a script
   * that runs *before* first paint. Everything else a page needs — stylesheets,
   * the description, the title — has its own field above, and belongs there.
   */
  readonly head?: string;
  /** The path the site is served under, normalized. Written on `<html>` unless it is `/`. */
  readonly base?: string;
  readonly lang?: string;
  readonly alternates?: readonly { readonly hreflang: string; readonly href: string }[];
}

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function escapeAttribute(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ESCAPES[character] ?? character);
}

/**
 * The document around a rendered body.
 *
 * The script is `type="module"` and carries no `defer`: a module script is
 * deferred by definition, and the islands it hydrates are already on screen and
 * already readable before it arrives. That ordering is the point of the whole
 * exercise, so it is stated here rather than assumed.
 */
export function shell(body: string, options: ShellOptions): string {
  const attributes = Object.entries(axisAttributes(options.axes ?? {}))
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
  const based =
    options.base === undefined || options.base === "/"
      ? ""
      : ` ${BASE_ATTRIBUTE}="${escapeAttribute(options.base)}"`;
  const description =
    options.description === undefined
      ? ""
      : `\n    <meta name="description" content="${escapeAttribute(options.description)}" />`;
  const links = options.stylesheets
    .map((href) => `\n    <link rel="stylesheet" href="${escapeAttribute(href)}" />`)
    .join("");

  const alternates = (options.alternates ?? [])
    .map(
      (alternate) =>
        `\n    <link rel="alternate" hreflang="${escapeAttribute(alternate.hreflang)}" href="${escapeAttribute(alternate.href)}" />`,
    )
    .join("");

  const head = options.head === undefined ? "" : `\n    ${options.head}`;

  return `<!doctype html>
<html lang="${escapeAttribute(options.lang ?? "en")}"${attributes}${based}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeAttribute(options.title)}</title>${description}${links}${alternates}${head}
    <script type="module" src="${escapeAttribute(options.script)}"></script>
  </head>
  <body>${body}</body>
</html>
`;
}

export interface RedirectOptions {
  readonly title: string;
  readonly lang: string;
  readonly href: string;
  readonly text: string;
}

export function redirectPage(options: RedirectOptions): string {
  const href = escapeAttribute(options.href);
  return `<!doctype html>
<html lang="${escapeAttribute(options.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeAttribute(options.title)}</title>
    <meta http-equiv="refresh" content="0; url=${href}" />
    <link rel="canonical" href="${href}" />
  </head>
  <body><a href="${href}">${escapeAttribute(options.text)}</a></body>
</html>
`;
}
