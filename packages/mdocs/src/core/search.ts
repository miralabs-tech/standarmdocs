import type { ApiTables, PageModel, Segment } from "./model";

/**
 * What the search palette reads, and the one contract between the build that
 * writes it and the UI package that loads it.
 *
 * The index is a list of documents, one per section a reader can land on: the
 * lead of a page, each `##` and `###` of its article, each panel of a tab strip.
 * A hit then links to the heading and not to the top of a long page, which is the
 * whole difference between a search and a list of titles. The format is plain
 * JSON with a version, and no search engine is named here — the UI package picks
 * and tunes its own, so swapping it never touches the build.
 *
 * Only `import type` from the rest of the kit, on purpose: this file is imported
 * by the browser bundle for its constants, and a value import of the content
 * scan would carry `markdown-it` and `node:fs` along with them.
 */

/** The file the build writes at the top of the output. */
export const SEARCH_INDEX_FILE = "search-index.json";

/** Where a page fetches it from. */
export const SEARCH_INDEX_URL = `/${SEARCH_INDEX_FILE}`;

/** Bumped when a document gains or loses a field a reader of the index relies on. */
export const SEARCH_INDEX_VERSION = 1;

/** On each empty element in the chrome where the palette's trigger is mounted. */
export const SEARCH_MOUNT = "data-mira-search";

/** Set on `<html>` once the palette is mounted; the stylesheet shows the mounts on it. */
export const SEARCH_READY = "data-mira-search-ready";

/** One section a reader can land on. */
export interface SearchDocument {
  /** `route` for a page's lead, `route#anchor` for a section; unique in an index. */
  readonly id: string;
  readonly route: string;
  /** The `id` of the heading or the tab panel the hit links to. Absent on a page's lead. */
  readonly anchor?: string;
  /** The page's title. */
  readonly title: string;
  /** The heading the section opens on, or the tab's label. Absent on a page's lead. */
  readonly section?: string;
  /** The section as plain text: no markup, no code blocks. */
  readonly text: string;
}

export interface SearchIndex {
  readonly version: 1;
  readonly documents: readonly SearchDocument[];
}

export interface SearchOptions {
  /** The props tables a ```props fence names; their table and row names become searchable. */
  readonly api?: ApiTables | undefined;
}

/** Where a hit goes. */
export function searchHref(document: {
  readonly route: string;
  readonly anchor?: string | undefined;
}): string {
  return document.anchor === undefined ? document.route : `${document.route}#${document.anchor}`;
}

const INLINE = /<\/?(?:a|abbr|b|code|del|em|i|ins|kbd|mark|s|small|span|strong|sub|sup|u)\b[^>]*>/gi;

const ENTITY =/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi;

const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decode(text: string): string {
  return text.replace(ENTITY, (whole, body: string) => {
    const name = body.toLowerCase();
    const named = NAMED[name];
    if (named !== undefined) return named;
    const code = name.startsWith("#x") ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/**
 * Rendered HTML as the words a reader would read: code blocks gone, tags gone,
 * entities decoded, whitespace collapsed.
 *
 * A block tag becomes a space, so the end of one paragraph never glues onto the
 * start of the next, and an inline one becomes nothing, so `<code>open</code>?`
 * stays one word. Entities are decoded last and once, which is why `&amp;lt;`
 * comes out as `&lt;` and not `<`.
 */
function plainText(html: string): string {
  return decode(
    html
      .replace(/<pre\b[\s\S]*?<\/pre>/gi, " ")
      .replace(INLINE, "")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const HEADING = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;

interface Draft {
  anchor: string | undefined;
  section: string | undefined;
  texts: string[];
}

/**
 * A page as search documents, in page order.
 *
 * What is indexed is what a reader reads: prose, tab panels, and the names in a
 * props table. Demos, the index grid, the home fence and `ask` blocks are not —
 * a demo is a component and not text, and a question is for the author. A `###`
 * inside a tab panel stays in the panel's document, since the panel is the link
 * target and the other panels are hidden.
 */
export function searchDocuments(
  model: PageModel,
  { api = {} }: SearchOptions = {},
): readonly SearchDocument[] {
  const labels = new Map(model.toc.map((entry) => [entry.id, entry.text]));
  const documents: SearchDocument[] = [];
  let draft: Draft = {
    anchor: undefined,
    section: undefined,
    texts: model.description === undefined ? [] : [model.description],
  };

  const close = (): void => {
    const text = draft.texts.join(" ").replace(/\s+/g, " ").trim();
    const { anchor, section } = draft;
    documents.push({
      id: searchHref({ route: model.route, anchor }),
      route: model.route,
      ...(anchor === undefined ? {} : { anchor }),
      title: model.title,
      ...(section === undefined ? {} : { section }),
      text,
    });
  };

  const propsText = (name: string): string[] =>
    (api[name] ?? []).map((table) => [table.name, ...table.rows.map((row) => row.name)].join(" "));

  const prose = (html: string): void => {
    let last = 0;
    for (const match of html.matchAll(HEADING)) {
      const id = /\sid="([^"]*)"/.exec(match[2] ?? "")?.[1];
      if (id === undefined || id === "") continue;
      draft.texts.push(plainText(html.slice(last, match.index)));
      last = match.index + match[0].length;
      close();
      const anchor = decode(id);
      draft = { anchor, section: labels.get(anchor) ?? plainText(match[3] ?? ""), texts: [] };
    }
    draft.texts.push(plainText(html.slice(last)));
  };

  const panel = (segments: readonly Segment[]): string[] =>
    segments.flatMap((segment): string[] => {
      if (segment.kind === "html") return [plainText(segment.html.replace(/<h2\b[\s\S]*?<\/h2>/gi, " "))];
      if (segment.kind === "props") return propsText(segment.name);
      return [];
    });

  let tabbed = false;
  for (const segment of model.segments) {
    if (segment.kind === "html") prose(segment.html);
    else if (segment.kind === "props") draft.texts.push(...propsText(segment.name));
    else if (segment.kind === "tabs") {
      close();
      for (const tab of segment.tabs) {
        draft = { anchor: tab.slug, section: tab.title, texts: panel(tab.segments) };
        close();
      }
      tabbed = true;
    }
  }
  if (!tabbed) close();
  return documents;
}

/** Every page's documents, in the order the pages were given. */
export function searchIndex(
  pages: readonly PageModel[],
  options: SearchOptions = {},
): SearchIndex {
  return {
    version: SEARCH_INDEX_VERSION,
    documents: pages.flatMap((page) => searchDocuments(page, options)),
  };
}
