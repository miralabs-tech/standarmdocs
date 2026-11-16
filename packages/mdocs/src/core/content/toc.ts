import type MarkdownIt from "markdown-it";
import type { TocEntry } from "../model";

type Token = ReturnType<MarkdownIt["parse"]>[number];

/** On the `<nav>` of every table of contents the page renders. */
export const TOC = "data-mira-toc";

/** `Don't panic: Café` → `dont-panic-cafe`; `""` and `"?!"` → `section`. */
export function headingSlug(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "section" : slug;
}

/**
 * How headings are given their ids: `standardoc` is the engine's ASCII slug, `github`
 * the one GitHub renders for the same Markdown.
 */
export type HeadingSlugs = "standardoc" | "github";

/**
 * GitHub's anchor for a heading: lowercased, everything but letters, numbers, marks,
 * spaces, `-` and `_` dropped, each space a hyphen. `2.1 Graphe de dépendances` →
 * `21-graphe-de-dépendances`; `""` → `section`.
 */
export function githubSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, "")
    .replace(/ /g, "-");
  return slug === "" ? "section" : slug;
}

/**
 * The text a heading reads as, with its inline markup gone.
 *
 * Built from the inline token's children and not from its source: `content` is
 * the Markdown the author typed, and a link or an emphasis in it would arrive in
 * the contents as asterisks and brackets.
 */
export function headingText(inline: Token | undefined): string {
  if (inline?.type !== "inline") return "";
  let text = "";
  for (const child of inline.children ?? []) {
    if (
      child.type === "text" ||
      child.type === "text_special" ||
      child.type === "code_inline" ||
      child.type === "image"
    ) {
      text += child.content;
    } else if (child.type === "softbreak" || child.type === "hardbreak") {
      text += " ";
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Gives every `##` and `###` of the token stream an `id`, and lists the ones a
 * reader can jump to.
 *
 * Ids are unique per page: an `id` the source already carries is kept and
 * claimed first, then the rest take their slug and a `-2`, `-3`… suffix when it
 * is taken. `reserved` holds the ids the page spends elsewhere — a tab panel's
 * `id` is its slug, and a heading sharing it would make the panel unreachable.
 *
 * From token `tabFrom` on, the page is inside its tab strip. A `##` there is the
 * tab's label and gets no id (the panel is the link target); a `###` gets one
 * but, like every heading there, stays out of the contents — the panels are
 * hidden but one, so a link into the others would lead nowhere.
 *
 * With `slugs` set to `github`, ids are GitHub's: the first of a kind is bare, the
 * next ones take `-1`, `-2`…, and a `####` gets an id too (it never enters the
 * contents, which stay `##` and `###`).
 */
export function assignHeadingIds(
  tokens: readonly Token[],
  tabFrom: number,
  reserved: readonly string[],
  slugs: HeadingSlugs = "standardoc",
): TocEntry[] {
  const github = slugs === "github";
  const used = new Set(reserved);
  for (const token of tokens) {
    const id = token.type === "heading_open" ? token.attrGet("id") : null;
    if (id !== null && id !== "") used.add(id);
  }

  const toc: TocEntry[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.type !== "heading_open") continue;
    const listed = token.tag === "h2" || token.tag === "h3";
    if (!listed && !(github && token.tag === "h4")) continue;
    const inTabs = index >= tabFrom;
    if (inTabs && token.tag === "h2") continue;

    const text = headingText(tokens[index + 1]);
    let id = token.attrGet("id");
    if (id === null || id === "") {
      const base = github ? githubSlug(text) : headingSlug(text);
      id = base;
      for (let n = github ? 1 : 2; used.has(id); n += 1) id = `${base}-${n}`;
      used.add(id);
      token.attrSet("id", id);
    }
    if (listed && !inTabs) toc.push({ id, text, depth: token.tag === "h2" ? 2 : 3 });
  }
  return toc;
}
