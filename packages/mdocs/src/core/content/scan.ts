import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import type { Axes } from "../axes";
import { rootedHref, withBase } from "../base";
import type { PageModel, Segment } from "../model";
import { askIndex } from "./ask";
import { resolveLink } from "./links";
import type { Highlight } from "./markdown";
import { parsePage } from "./markdown";
import type { RelatedPolicy } from "./related";
import type { HeadingSlugs } from "./toc";

/**
 * One place the content comes from, mounted somewhere in the route table.
 *
 * A directory is walked and each page keeps its path under `prefix`; a single `.md`
 * file is one page. The first is what `contentDir` has always been, an unprefixed
 * root, and stays so.
 */
export interface ContentRoot {
  /** The directory walked, or the directory holding the file of a single-file root. */
  readonly dir: string;
  /** Where the root is mounted: posix, no leading or trailing slash, empty for the top. */
  readonly prefix: string;
  /** The name of the `.md` file when the root is that one file and not a tree. */
  readonly file?: string | undefined;
  readonly locale?: boolean | undefined;
}

/**
 * The virtual path of a single-file root's page: the name of the file at the top,
 * or `<prefix>.md` when the root is mounted under a prefix. It is the `file` the
 * page and its `ask` segments carry. Mounted at the top the route is the file's
 * name in lower case (`README.md` is `/readme`), and `/` for an `index.md`.
 */
export function rootFile(root: ContentRoot): string {
  if (root.file === undefined) throw new Error(`${root.dir} is a directory root, not a file`);
  return root.prefix === "" ? root.file : `${root.prefix}.md`;
}

export interface ScanOptions {
  /** One unprefixed root. Ignored when `roots` is given. */
  readonly contentDir?: string | undefined;
  /** Several roots, in the order their pages are listed. */
  readonly roots?: readonly ContentRoot[] | undefined;
  readonly matrix?: readonly Axes[] | undefined;
  /** Colours every fenced block that is not a directive. Absent renders them plain. */
  readonly highlight?: Highlight | undefined;
  /** The `##` headings that end a page as a tab strip. Absent, no page has tabs. */
  readonly tabs?: readonly string[] | undefined;
  /** How headings get their ids. Absent, `standardoc`; `github` matches GitHub's anchors. */
  readonly headingSlugs?: HeadingSlugs | undefined;
  /**
   * Gives every `ask` segment the `file` it came from and the `hash` of its fence,
   * which is what a page needs to answer back. Off by default: a site that is
   * only read has no use for either, and should not carry them.
   */
  readonly askPositions?: boolean | undefined;
  /**
   * What a relative `.md` link to a file that was not scanned does: `error` throws,
   * naming the source file, the link and the resolved path; `warn` reports it and
   * leaves the link as written. Defaults to `error`.
   */
  readonly links?: RelatedPolicy | undefined;
  /**
   * The path the site is served under, normalized. Routes resolved from `.md` links
   * and root-absolute links written by hand are prefixed with it. Absent, `/`.
   */
  readonly base?: string | undefined;
}

/**
 * The folder of private notes a project keeps beside its work. The scan never
 * enters one, so a content tree that contains it cannot publish it by accident.
 */
export const PRIVATE_DIR = ".miralabs";

/**
 * `.md` and nothing else — but an `.mdx` is refused rather than skipped.
 *
 * The two are not alike. A `.png` in the content tree is an asset and ignoring it
 * is right; an `.mdx` is a page in the format this engine deliberately does not
 * read, and forty-one of them were converted by hand. One missed conversion used
 * to be a page that did not exist: no route, no sidebar entry, no error, and a
 * build that reported one page fewer than the author wrote.
 */
function walk(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== PRIVATE_DIR) walk(full, found);
    } else if (entry.name.endsWith(".md")) found.push(full);
    else if (entry.name.endsWith(".mdx")) {
      throw new Error(
        `${full} is .mdx — this engine reads .md and fences. Convert it, or move it out of the content tree.`,
      );
    }
  }
  return found;
}

function hasAsk(segments: readonly Segment[]): boolean {
  return segments.some(
    (segment) =>
      segment.kind === "ask" ||
      (segment.kind === "tabs" && segment.tabs.some((tab) => hasAsk(tab.segments))),
  );
}

function located(
  segments: readonly Segment[],
  file: string,
  hashes: ReadonlyMap<string, string>,
): readonly Segment[] {
  return segments.map((segment): Segment => {
    if (segment.kind === "tabs") {
      return {
        ...segment,
        tabs: segment.tabs.map((tab) => ({ ...tab, segments: located(tab.segments, file, hashes) })),
      };
    }
    const hash = segment.kind === "ask" ? hashes.get(segment.block.id) : undefined;
    return segment.kind === "ask" && hash !== undefined ? { ...segment, file, hash } : segment;
  });
}

interface Placement {
  readonly route: string;
  readonly group: string | undefined;
}

/**
 * A file's path, as a route and a group.
 *
 * An index file heads its directory rather than sitting in it, which settles both
 * halves at once: `components/index.md` is `/components` and not
 * `/components/index` — the route every link on the site was already written
 * against — and it belongs to no group, because the group it would otherwise take
 * is the name of the directory it heads, which no category ever claims. That was
 * how the front page and the components landing page fell out of the sidebar.
 */
function place(rel: string): Placement {
  const parts = rel.split(posix.sep);
  const stem = rel.replace(/\.md$/, "");
  const last = parts[parts.length - 1];

  if (last === "index.md") {
    const directory = parts.slice(0, -1).join(posix.sep);
    return { route: `/${directory}`.replace(/\/$/, "") || "/", group: undefined };
  }
  return { route: `/${stem}`, group: parts.length > 1 ? parts[parts.length - 2] : undefined };
}

function rootsOf(options: ScanOptions): readonly ContentRoot[] {
  if (options.roots !== undefined && options.roots.length > 0) return options.roots;
  if (options.contentDir !== undefined) return [{ dir: options.contentDir, prefix: "" }];
  throw new Error("scanContent needs contentDir or roots");
}

function realOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function locationOf(root: ContentRoot): string {
  return root.file === undefined ? root.dir : join(root.dir, root.file);
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/**
 * Two roots may not share a file: it would be a page twice, under two routes.
 * A root inside a `.miralabs` folder of another is the one nesting that is fine,
 * because the walk never enters that folder.
 */
function assertDisjoint(roots: readonly ContentRoot[]): void {
  const nested = (parent: ContentRoot, child: ContentRoot): boolean => {
    if (parent.file !== undefined) return realOf(locationOf(parent)) === realOf(locationOf(child));
    const lexical = relative(resolve(locationOf(parent)), resolve(locationOf(child)));
    if (!lexical.startsWith("..") && lexical.split(sep).includes(PRIVATE_DIR)) return false;
    return contains(realOf(locationOf(parent)), realOf(locationOf(child)));
  };
  for (const [index, first] of roots.entries()) {
    for (const second of roots.slice(index + 1)) {
      if (nested(first, second) || nested(second, first)) {
        throw new Error(
          `content roots overlap: ${locationOf(first)} and ${locationOf(second)}`,
        );
      }
    }
  }
}

interface Source {
  readonly root: ContentRoot;
  readonly path: string;
  readonly real: string;
  readonly rel: string;
  readonly placement: Placement;
}

function sourcesOf(root: ContentRoot): Source[] {
  const toSource = (path: string, rel: string, placement: Placement): Source => ({
    root,
    path: resolve(path),
    real: realOf(path),
    rel,
    placement,
  });
  if (root.file !== undefined) {
    const path = join(root.dir, root.file);
    if (root.file.endsWith(".mdx")) {
      throw new Error(
        `${path} is .mdx — this engine reads .md and fences. Convert it, or move it out of the content tree.`,
      );
    }
    if (!root.file.endsWith(".md")) throw new Error(`${path} is not a .md file`);
    const rel = rootFile(root);
    if (root.prefix === "") return [toSource(path, rel, place(rel.toLowerCase()))];
    const parts = root.prefix.split(posix.sep);
    const group = parts.length > 1 ? parts[parts.length - 2] : undefined;
    return [toSource(path, rel, { route: `/${root.prefix}`, group })];
  }
  return walk(root.dir, [])
    .sort()
    .map((file) => {
      const inRoot = relative(root.dir, file).split(sep).join(posix.sep);
      const rel = root.prefix === "" ? inRoot : `${root.prefix}/${inRoot}`;
      if (root.locale !== true) return toSource(file, rel, place(rel));
      const inside = place(inRoot);
      const route = inside.route === "/" ? `/${root.prefix}` : `/${root.prefix}${inside.route}`;
      return toSource(file, rel, { route, group: inside.group });
    });
}

const key = (path: string): string => path.split(sep).join(posix.sep);

/**
 * The content tree is the route table, and the directory is the group.
 *
 * `categories.ts` on the Astro site said it first, and it is worth keeping
 * literally: "membership is the directory a page sits in, never a list here". A
 * page added under `content/components/overlays/` joins the overlays group with
 * no edit anywhere — which is the only property that makes 38 pages bearable.
 *
 * With several roots the route table is the union of their virtual paths, a
 * root's prefix in front of the path inside it. A relative link is resolved from
 * the real file it was written in and mapped back through every root's real
 * files, so a page can link to one that sits under another root. Two roots that
 * claim the same route are an error, naming both files.
 */
export function scanContent(options: ScanOptions): readonly PageModel[] {
  const roots = rootsOf(options);
  assertDisjoint(roots);
  const sources = roots.flatMap(sourcesOf);

  const claimed = new Map<string, Source>();
  for (const source of sources) {
    const other = claimed.get(source.placement.route);
    if (other === undefined) claimed.set(source.placement.route, source);
    else if (other.root !== source.root) {
      throw new Error(
        `route ${source.placement.route} is claimed by both ${other.path} and ${source.path}`,
      );
    }
  }

  const routes = new Map<string, string>();
  for (const source of sources) {
    routes.set(key(source.path), source.placement.route);
    routes.set(key(source.real), source.placement.route);
  }
  const policy = options.links ?? "error";
  const base = options.base ?? "/";
  const mounted = roots.length > 1 || roots.some((root) => root.prefix !== "");
  return sources.map((source) => {
    const { rel } = source;
    const { route, group } = source.placement;
    const link = (href: string): string => {
      const resolution = resolveLink(key(source.real), href, routes);
      if (resolution === null) return rootedHref(base, href);
      if (resolution.kind === "route") {
        return withBase(base, `${resolution.route}${resolution.fragment}`);
      }
      const shown = mounted ? undefined : resolveLink(rel, href, new Map());
      const resolved = shown?.kind === "unknown" ? shown.resolved : resolution.resolved;
      const message = `${rel}: link ${href} resolves to ${resolved}, which is not a page`;
      if (policy === "error") throw new Error(message);
      console.warn(message);
      return href;
    };
    const text = readFileSync(source.path, "utf8");
    const page: PageModel = {
      ...parsePage(text, {
        route,
        group,
        matrix: options.matrix,
        highlight: options.highlight,
        tabs: options.tabs,
        headingSlugs: options.headingSlugs,
        link,
      }),
      file: rel,
      origin: { root: locationOf(source.root), path: source.path },
    };
    if (options.askPositions !== true || !hasAsk(page.segments)) return page;
    const hashes = new Map(askIndex(text).map((entry) => [entry.block.id, entry.hash]));
    return { ...page, segments: located(page.segments, rel, hashes) };
  });
}
