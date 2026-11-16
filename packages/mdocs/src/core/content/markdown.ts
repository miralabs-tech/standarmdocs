import MarkdownIt from "markdown-it";
import type { Axes } from "../axes";
import type { PageModel, Segment } from "../model";
import { parseDirective, toSegment } from "./fences";
import { parseFrontmatter } from "./frontmatter";
import { groupTabs, type Section, tabRun, tabSlug } from "./tabs";
import { MARKDOWN_OPTIONS, plainMarkdown } from "./markdown-it";
import { assignHeadingIds, type HeadingSlugs } from "./toc";

/**
 * Colours one fenced block, and returns the whole `<pre>` for it.
 *
 * The contract is markdown-it's own: return a complete element and it is used
 * verbatim, return `""` and the default plain rendering takes over. Synchronous,
 * because markdown-it's `highlight` hook is — which is why the build resolves its
 * highlighter once, up front, and passes the ready one down rather than a promise.
 */
export type Highlight = (code: string, lang: string) => string;

/**
 * One MarkdownIt per highlighter, and the plain one when there is none.
 *
 * Cached on the function's identity rather than rebuilt per page: a build calls
 * this once per page with the same highlighter every time, and a fresh MarkdownIt
 * for each of forty-one pages is forty-one rule tables assembled for nothing.
 */
let cached: { readonly fn: Highlight; readonly md: MarkdownIt } | null = null;

function instanceFor(highlight: Highlight | undefined): MarkdownIt {
  if (highlight === undefined) return plainMarkdown;
  if (cached?.fn === highlight) return cached.md;
  const md = new MarkdownIt({ ...MARKDOWN_OPTIONS, highlight });
  cached = { fn: highlight, md };
  return md;
}

type Token = ReturnType<MarkdownIt["parse"]>[number];

/**
 * One run of Markdown as inline HTML, with no block wrapper around it.
 *
 * A props table's Notes cell is authored as Markdown — the generator reads JSDoc,
 * where `` `alertdialog` `` means what it means everywhere else. Rendered as React
 * text that cell ships its backticks; rendered with `render` it would put a `<p>`
 * inside a `<td>`. This is the third thing, and the only correct one.
 */
export function renderInline(text: string): string {
  return plainMarkdown.renderInline(text);
}

export interface ParsePageOptions {
  readonly route: string;
  readonly group?: string | undefined;
  /** Overrides the matrix every ```demo fence on this page is rendered over. */
  readonly matrix?: readonly Axes[] | undefined;
  /** Colours every fenced block that is not a directive. Absent renders them plain. */
  readonly highlight?: Highlight | undefined;
  /**
   * The `##` headings that end a page as a tab strip, when they end it in a run.
   *
   * Absent, or empty, and no page on the site has tabs — which is the default
   * because the engine documents no particular library and these are one
   * library's section names. See `content/tabs.ts` for why it is the *trailing*
   * run and never a gather.
   */
  readonly tabs?: readonly string[] | undefined;
  /**
   * How headings get their ids. Absent, `standardoc`: the engine's ASCII slug.
   * `github` gives the anchors GitHub renders for the same Markdown, `####` included.
   */
  readonly headingSlugs?: HeadingSlugs | undefined;
  /** Rewrites the `href` of every link in the prose; code spans and fences are never offered. */
  readonly link?: ((href: string) => string) | undefined;
}

/** The text of the `#` heading a body opens on, when it opens on one. */
export function leadingHeading(tokens: readonly Token[]): string | undefined {
  const [open, inline] = tokens;
  if (open?.type !== "heading_open" || open.tag !== "h1" || inline?.type !== "inline") {
    return undefined;
  }
  const text = inline.content.trim();
  return text === "" ? undefined : text;
}

/**
 * Markdown in, segments out — the article split at its directives.
 *
 * The prose between two directives is rendered to HTML once, here, and reaches
 * the page as a string. That is safe precisely because the article is *not* an
 * island: nothing re-parses it on the client, so there is no hydration boundary
 * for whitespace normalisation to disagree across. Making the article an island
 * would break that, and the comment above `dangerouslySetInnerHTML` in the page
 * says so where someone would be tempted.
 *
 * A directive is pulled out of the token stream before anything renders it, which
 * is also why the highlighter never sees one: ```demo is not a language, and a
 * highlighter asked for it would either throw or invent a plain block that the
 * renderer then draws underneath the real demo.
 */

export function parsePage(source: string, options: ParsePageOptions): PageModel {
  const md = instanceFor(options.highlight);
  const { data, lists, body } = parseFrontmatter(source);
  const tokens = md.parse(body, {});
  const rewrite = options.link;
  if (rewrite !== undefined) {
    for (const token of tokens) {
      for (const child of token.children ?? []) {
        if (child.type !== "link_open") continue;
        const href = child.attrGet("href");
        if (href !== null) child.attrSet("href", rewrite(href));
      }
    }
  }
  const heading = data["title"] === undefined ? leadingHeading(tokens) : undefined;
  // The page draws its own <h1> from the title, so a heading promoted to the
  // title leaves the body, or the page would open on it twice.
  if (heading !== undefined) tokens.splice(0, 3);

  // Which `##` end the page as tabs is known before anything renders, because
  // the headings get their ids now: a tab's label must not take the id its panel
  // is going to have, and nothing inside the strip is listed in the contents.
  const vocabulary = options.tabs ?? [];
  const titles = tokens.flatMap((token, index) => {
    if (token.type !== "heading_open" || token.tag !== "h2") return [];
    const inline = tokens[index + 1];
    return [inline?.type === "inline" ? inline.content.trim() : undefined];
  });
  const folded = tabRun(titles, vocabulary);
  let tabFrom = tokens.length;
  if (folded > 0) {
    let seen = 0;
    for (const [index, token] of tokens.entries()) {
      if (token.type !== "heading_open" || token.tag !== "h2") continue;
      if (seen === titles.length - folded) {
        tabFrom = index;
        break;
      }
      seen += 1;
    }
  }
  const toc = assignHeadingIds(
    tokens,
    tabFrom,
    titles.slice(titles.length - folded).map((title) => tabSlug(title ?? "")),
    options.headingSlugs,
  );

  // Split at the directives as before, and at `##` as well — but the heading
  // boundary only *records* where a section starts. Whether any of them becomes
  // a tab is decided afterwards, by `groupTabs`, from a vocabulary this engine
  // does not own. A page on a site that configures none parses into exactly the
  // segments it always did.
  const sections: Section[] = [];
  let title: string | undefined;
  let current: Segment[] = [];
  let pending: Token[] = [];

  const flush = (): void => {
    if (pending.length === 0) return;
    const html = md.renderer.render(pending, md.options, {});
    pending = [];
    if (html.trim() !== "") current.push({ kind: "html", html });
  };

  const closeSection = (): void => {
    flush();
    if (current.length > 0) sections.push({ title, segments: current });
    current = [];
  };

  for (const [index, token] of tokens.entries()) {
    if (token.type === "heading_open" && token.tag === "h2") {
      // Closed before the title changes, and the heading itself pushed after —
      // a `##` opens its section rather than closing the one above it, so the
      // panel a tab shows starts with its own heading.
      closeSection();
      const inline = tokens[index + 1];
      title = inline?.type === "inline" ? inline.content.trim() : undefined;
      pending.push(token);
      continue;
    }

    const directive = token.type === "fence" ? parseDirective(token.info) : null;
    if (directive === null) {
      pending.push(token);
      continue;
    }
    flush();
    const segment = toSegment(directive, token.content);
    current.push(
      segment.kind === "demo" && options.matrix !== undefined
        ? { ...segment, matrix: options.matrix }
        : segment,
    );
  }
  closeSection();

  return {
    route: options.route,
    title: data["title"] ?? heading ?? options.route,
    description: data["description"],
    group: options.group,
    segments: groupTabs(sections, vocabulary),
    toc,
    related: lists["related"] ?? [],
  };
}
