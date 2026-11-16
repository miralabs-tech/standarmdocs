import { createHighlighter } from "shiki";
import type { Highlight } from "./markdown";

/**
 * The languages a documentation site actually fences, loaded once and by name.
 *
 * Shiki resolves grammars lazily and asynchronously, and markdown-it's `highlight`
 * hook is synchronous — so every grammar a page might use has to be loaded before
 * the first page is parsed. Measured on the ported corpus: forty fences, thirty
 * eight `tsx`, one `sh`, one `ts`. The rest of this list is the set a page could
 * plausibly reach for next, and loading one grammar that goes unused costs a build
 * a few milliseconds; discovering a missing one costs a silently plain block.
 */
const LANGS = [
  "tsx",
  "ts",
  "jsx",
  "js",
  "json",
  "sh",
  "bash",
  "css",
  "scss",
  "html",
  "md",
  "diff",
];

const THEMES = { light: "github-light", dark: "github-dark" } as const;

/**
 * One highlighter for the whole build, as a synchronous colouring function.
 *
 * The two themes are rendered into the same markup rather than one theme per
 * build: shiki writes the light colour inline and the dark one as a
 * `--shiki-dark` custom property on the same span, so `docs.css` can switch the
 * whole listing on `data-mira-theme` with two rules. That matters here more than
 * on most sites — the theme is a *reader's* switch on this one, flipped after the
 * page is built, and a listing coloured for one theme would be the only thing on
 * the page that did not follow it.
 *
 * An unknown language returns `""`, which is markdown-it's "render it plainly"
 * and not an error: a fence tagged with a language nobody loaded is a fence that
 * should still be readable, and failing the whole build over one would trade a
 * cosmetic loss for no site at all.
 */
export type HighlightHandle = Highlight & { dispose(): void };

export async function createHighlight(): Promise<HighlightHandle> {
  const highlighter = await createHighlighter({ themes: [THEMES.light, THEMES.dark], langs: LANGS });
  const loaded = new Set(highlighter.getLoadedLanguages());

  const highlight = (code: string, lang: string): string => {
    if (!loaded.has(lang)) return "";
    return highlighter.codeToHtml(code, { lang, themes: THEMES });
  };
  return Object.assign(highlight, { dispose: () => highlighter.dispose() });
}
