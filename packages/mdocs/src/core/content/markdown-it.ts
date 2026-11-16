import MarkdownIt from "markdown-it";

/**
 * The one markdown-it configuration of the kit. Every reader of a page's source
 * parses with it — the renderer, the ask scanner, the llms export — so the token
 * stream one of them sees, and the line numbers on it, are the ones the others see.
 */
export const MARKDOWN_OPTIONS = { html: true, linkify: false, typographer: false } as const;

/** The shared instance without a highlighter. Parsing keeps no state between calls. */
export const plainMarkdown = new MarkdownIt(MARKDOWN_OPTIONS);
