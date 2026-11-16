import type { Axes } from "./axes";
import type { AskBlock } from "./content/ask-block";

/**
 * What a page is once the Markdown has been read, and the only thing the
 * renderer sees.
 *
 * The author writes prose and fences; the boundary between static HTML and a
 * hydrated island is decided here, from the *kind* of segment — never from an
 * attribute an author could put on the wrong node.
 */
export type Segment =
  | { readonly kind: "html"; readonly html: string }
  | { readonly kind: "demo"; readonly id: string; readonly matrix: readonly Axes[] }
  | { readonly kind: "props"; readonly name: string }
  | { readonly kind: "index"; readonly group: string }
  | { readonly kind: "home" }
  | AskSegment
  | { readonly kind: "tabs"; readonly tabs: readonly TabPanel[] };

/**
 * A question put to the reader.
 *
 * `file` and `hash` say where the block lives and what it looked like when the
 * page was read: the path under the content root with forward slashes, and the
 * sha256 of the fence's own lines from `askIndex`. They are attached on the node
 * side by the content scan, and only when asked for, so a page that is not meant
 * to answer back never carries them. The hash needs `node:crypto`, which the
 * renderer and the hydrator must not import: they only read what the scan left.
 */
export interface AskSegment {
  readonly kind: "ask";
  readonly block: AskBlock;
  readonly file?: string;
  readonly hash?: string;
}

/**
 * One panel of a tab strip: a `##` section of the article, held whole.
 *
 * It carries segments rather than HTML because a section is not only prose — the
 * one this was written for ends in a ```props fence, and a panel that could hold
 * only a string would have had to render that fence somewhere else.
 *
 * `slug` is the panel's `id` as well as its handle, so a tab is a link target:
 * `/components/forms/button#props` opens the page on that panel.
 */
export interface TabPanel {
  readonly slug: string;
  /** The heading as the author wrote it, and the tab's label. */
  readonly title: string;
  readonly segments: readonly Segment[];
}

/**
 * One line of a page's table of contents: a `##` or `###` of the article.
 *
 * `text` is the heading read as plain text, its inline markup gone, and `id` is
 * the `id` the rendered heading carries — so `#id` is the link.
 */
export interface TocEntry {
  readonly id: string;
  readonly text: string;
  readonly depth: 2 | 3;
}

/** A resolved `related:` entry: the target page's route, title and description. */
export interface SeeAlsoLink {
  readonly route: string;
  readonly title: string;
  readonly description: string | undefined;
}

export interface PageModel {
  /** `/components/overlays/dialog` — leading slash, no trailing one. */
  readonly route: string;
  readonly title: string;
  readonly description: string | undefined;
  /** The directory the page sits in, which is what decides its sidebar group. */
  readonly group: string | undefined;
  readonly segments: readonly Segment[];
  /**
   * The headings a reader can jump to, in page order. Those that became a tab
   * label, or sit inside a tab panel, are not listed.
   */
  readonly toc: readonly TocEntry[];
  /** The routes the front matter's `related:` names, as written. */
  readonly related: readonly string[];
  /**
   * `related` once each route has been matched to a scanned page by
   * `resolveRelated`. Absent on a model that has not been through it.
   */
  readonly seeAlso?: readonly SeeAlsoLink[] | undefined;
  /**
   * The source file, relative to the content root with forward slashes. Set by the
   * content scan, which is what lets a build read the Markdown a page came from
   * again; a model made by `parsePage` alone has none.
   */
  readonly file?: string | undefined;
  /**
   * The real file the page was read from, and the content root it belongs to, set
   * by the content scan beside `file`. `file` is virtual once a root is mounted
   * under a prefix; this is what a build reads again and what a link resolves from.
   */
  readonly origin?: PageOrigin | undefined;
}

export interface PageOrigin {
  /** The root as given to the scan: a directory, or the file of a single-file root. */
  readonly root: string;
  /** The absolute path of the page's own `.md`. */
  readonly path: string;
}

/**
 * The page with every `ask` segment taken out, tab panels included.
 *
 * A question is a conversation with the author, and a site that is read by the
 * public is not part of it. Dropping the segments rather than hiding them is the
 * point: nothing of a question, answered or pending, is left in the HTML to find.
 */
export function withoutAsks(model: PageModel): PageModel {
  const strip = (segments: readonly Segment[]): readonly Segment[] =>
    segments.flatMap((segment): Segment[] => {
      if (segment.kind === "ask") return [];
      if (segment.kind === "tabs") {
        return [
          { ...segment, tabs: segment.tabs.map((tab) => ({ ...tab, segments: strip(tab.segments) })) },
        ];
      }
      return [segment];
    });
  return { ...model, segments: strip(model.segments) };
}

/**
 * One row of a generated props table. `source` is what makes it checkable.
 *
 * Every optional field admits `null` as well as `undefined`, and that is not
 * defensive noise: these tables reach the renderer through `JSON.parse`, which
 * cannot produce `undefined` at all. A generator that omits an absent key yields
 * `undefined`; one that writes it out yields `null`; both mean absent, and a
 * renderer that tests only one of them prints the word "null" into a caption.
 */
export interface ApiRow {
  readonly name: string;
  readonly type: string;
  readonly notes: string | null | undefined;
  readonly source: string | null | undefined;
  /**
   * The heading this row belongs under, where the generator found one.
   *
   * On the row and never a list of spans beside the rows: a span is a second
   * statement about the same rows, and an index into a list nobody renumbers is
   * the shape that rots. A run of consecutive rows carrying the same label *is*
   * the group, so the renderer can only ever draw what the data says.
   *
   * The one optional *key* on this interface, where `notes` and `source` are
   * required keys that admit an absent value. The difference is deliberate and it
   * is the same principle the whole kit is built on: every props table has a note
   * and a place it was declared, even when both are missing, but grouping is a
   * notion a generator may simply not have. Requiring the key would make this
   * engine demand something of a generator it documents nothing about.
   *
   * Absent on most rows even where it is understood: on the one generator feeding
   * this kit, 224 of 1058 rows carry one.
   */
  readonly group?: string | null | undefined;
}

/**
 * A table is an interface or a type alias, and the two are told apart by which
 * field carries the text — never by whether `rows` is empty.
 *
 * The distinction cannot be recovered here. `BadgeComposedProps` is an alias whose
 * definition is the single name `BadgeRootProps`; `UseButtonProps` is an interface
 * that extends the single name `ButtonMachineProps` — one field, one shape, two
 * different statements. Inferring "alias" from an empty `rows` gets it wrong for
 * every interface that declares no member of its own, which on the one generator
 * feeding this kit is 37 of the 102 empty tables.
 */
export interface ApiTable {
  readonly name: string;
  /** An interface's base list, joined. Reads as `extends A, B`. */
  readonly extends: string | null | undefined;
  /** A type alias's right-hand side. Reads as `= A | B`. Absent on an interface. */
  readonly definition: string | null | undefined;
  readonly rows: readonly ApiRow[];
}

/** `dialog` → the tables the ```props dialog fence renders. */
export type ApiTables = Readonly<Record<string, readonly ApiTable[]>>;

/**
 * The demo ids a page needs, in the order they appear.
 *
 * Walks into tab panels rather than over them. This is what decides whether a
 * demo inside a tabbed section is bundled at all: the build generates one
 * dynamic import per id this returns, so an id it misses is a stage that
 * prerenders and then never hydrates — and `check:hydration` on the site that
 * drove this would report it as an island that never mounted, one page at a time.
 */
export function demoIds(model: PageModel): readonly string[] {
  const ids: string[] = [];
  const walk = (segments: readonly Segment[]): void => {
    for (const segment of segments) {
      if (segment.kind === "demo" && !ids.includes(segment.id)) ids.push(segment.id);
      else if (segment.kind === "tabs") for (const tab of segment.tabs) walk(tab.segments);
    }
  };
  walk(model.segments);
  return ids;
}
