import { rootedHref, withBase } from "../base";
import type { ApiRow, ApiTable, ApiTables, SeeAlsoLink } from "../model";
import { orderEntries } from "../sidebar";
import { parseDirective } from "./fences";
import { parseFrontmatter } from "./frontmatter";
import { resolveLink } from "./links";
import { leadingHeading } from "./markdown";
import { plainMarkdown } from "./markdown-it";

/**
 * The part of a sidebar entry these files need. `ChromeEntry` satisfies it, and
 * is not named here because it lives on the React side of the kit.
 */
export interface LlmsEntry {
  readonly route: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly group?: string | undefined;
  readonly order?: number | undefined;
}

/**
 * The sidebar as `placeEntries` returns it: pages that head a section first, then
 * one section per category that has a page. The order of a site's `llms.txt` is
 * the order a reader sees, so it is taken from the same placement and never
 * recomputed.
 */
export interface LlmsPlacement {
  readonly lead: readonly LlmsEntry[];
  readonly sections: readonly {
    readonly category: { readonly label: string };
    readonly items: readonly LlmsEntry[];
  }[];
}

export interface PageMarkdownContext {
  readonly api: ApiTables;
  /** Every page of the site, which is what an ```index fence lists from. */
  readonly entries: readonly LlmsEntry[];
  /** Every scanned file, relative to the content root, with its route. */
  readonly files?: ReadonlyMap<string, string> | undefined;
  /** The path the site is served under, normalized. Absent, `/`. */
  readonly base?: string | undefined;
}

function relinked(
  body: string,
  file: string,
  files: ReadonlyMap<string, string>,
  base: string,
): string {
  const lines = body.split("\n");
  for (const token of plainMarkdown.parse(body, {})) {
    if (token.type !== "inline" || token.map === null) continue;
    const [start, end] = token.map;
    let text = lines.slice(start, end).join("\n");
    let at = 0;
    for (const child of token.children ?? []) {
      if (child.type !== "link_open") continue;
      const href = child.attrGet("href");
      if (href === null) continue;
      const needle = `](${href}`;
      const found = text.indexOf(needle, at);
      if (found === -1) continue;
      const resolution = resolveLink(file, href, files);
      const next =
        resolution?.kind === "route"
          ? `${pageHref(resolution.route, base)}${resolution.fragment}`
          : rootedHref(base, href);
      text = `${text.slice(0, found)}](${next}${text.slice(found + needle.length)}`;
      at = found + 2 + next.length;
    }
    const replaced = text.split("\n");
    for (const [offset, line] of replaced.entries()) lines[start + offset] = line;
  }
  return lines.join("\n");
}

/**
 * Where a page's Markdown is served: the route's directory, beside its `index.html`.
 * Root-relative, because the config carries no site URL to make it absolute.
 */
export function pageHref(route: string, base = "/"): string {
  return withBase(base, route === "/" ? "/index.md" : `${route}/index.md`);
}

function linkText(text: string): string {
  return text.replace(/[\\[\]]/g, (char) => `\\${char}`);
}

function entryLine(entry: LlmsEntry, base: string): string {
  const link = `- [${linkText(entry.title)}](${pageHref(entry.route, base)})`;
  return entry.description === undefined || entry.description === ""
    ? link
    : `${link}: ${entry.description.replace(/\s*\r?\n\s*/g, " ")}`;
}

function codeSpan(text: string): string {
  const flat = text.replace(/\s*\r?\n\s*/g, " ");
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${flat}${pad}${fence}`;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\r?\n\s*/g, "<br>");
}

interface RowRun {
  readonly label: string | null;
  readonly rows: readonly ApiRow[];
}

function rowRuns(rows: readonly ApiRow[]): readonly RowRun[] {
  const runs: { label: string | null; rows: ApiRow[] }[] = [];
  for (const row of rows) {
    const label = row.group == null ? null : row.group;
    const last = runs.at(-1);
    if (last === undefined || last.label !== label) runs.push({ label, rows: [row] });
    else last.rows.push(row);
  }
  return runs;
}

/**
 * One generated props table as Markdown, the way the page draws it.
 *
 * A heading with the table's name, then its `extends` or `=` line, then a pipe
 * table of Name, Type and Notes. A run of rows under one group heading becomes a
 * table of its own behind a bold line, because a pipe table has no row that can
 * span its columns. A table with no rows has nothing to tabulate and states
 * itself in one line, `= …` for an alias and `extends …` for an interface, as the
 * page does in its single cell.
 */
export function apiTableMarkdown(table: ApiTable): string {
  const inherited = table.extends == null ? null : `extends ${table.extends}`;
  const defined = table.definition == null ? null : `= ${table.definition}`;
  const blocks = [`### ${table.name}`];

  if (table.rows.length === 0) {
    const sole = defined ?? inherited;
    if (sole !== null) blocks.push(codeSpan(sole));
    return blocks.join("\n\n");
  }

  if (inherited !== null) blocks.push(codeSpan(inherited));
  if (defined !== null) blocks.push(codeSpan(defined));
  for (const run of rowRuns(table.rows)) {
    if (run.label !== null) blocks.push(`**${run.label.replace(/\s*\r?\n\s*/g, " ")}**`);
    blocks.push(
      [
        "| Name | Type | Notes |",
        "| --- | --- | --- |",
        ...run.rows.map(
          (row) =>
            `| ${cell(codeSpan(row.name))} | ${cell(codeSpan(row.type))} | ${
              row.notes == null || row.notes === "" ? "—" : cell(row.notes)
            } |`,
        ),
      ].join("\n"),
    );
  }
  return blocks.join("\n\n");
}

function indexMarkdown(group: string, entries: readonly LlmsEntry[], base: string): string {
  const items = orderEntries(entries.filter((entry) => entry.group === group));
  if (items.length === 0) throw new Error(`\`\`\`index ${group} matches no page`);
  return items.map((entry) => entryLine(entry, base)).join("\n");
}

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === "";
}

interface Edit {
  readonly start: number;
  end: number;
  readonly lines: readonly string[];
}

/**
 * A page's source as plain Markdown for a reader that has no browser.
 *
 * Text in, text out: the fences are located with markdown-it's token maps, as
 * `askIndex` does, and replaced in the source lines, so everything the author
 * wrote outside a directive reaches the output byte for byte. `ask` and `demo`
 * are dropped, since a question is not for the public and a demo is not text;
 * `props` becomes the generated tables and `index` the list of pages of its
 * group. Any other fence, a code sample included, is kept as written.
 *
 * The page opens with its title and description from the model, and the front
 * matter is gone. Line endings are normalised to LF.
 */
export function pageMarkdown(
  source: string,
  model: {
    readonly title: string;
    readonly description: string | undefined;
    readonly seeAlso?: readonly SeeAlsoLink[] | undefined;
    readonly file?: string | undefined;
  },
  context: PageMarkdownContext,
): string {
  const parsed = parseFrontmatter(source.replace(/\r\n?/g, "\n"));
  const { data } = parsed;
  const base = context.base ?? "/";
  const body =
    model.file !== undefined && context.files !== undefined
      ? relinked(parsed.body, model.file, context.files, base)
      : parsed.body;
  const lines = body.split("\n");
  const edits: Edit[] = [];
  const tokens = plainMarkdown.parse(body, {});

  // The heading the model took its title from is written once, as the head.
  const first = tokens[0];
  if (data["title"] === undefined && leadingHeading(tokens) !== undefined && first?.map) {
    edits.push({ start: first.map[0], end: first.map[1], lines: [] });
  }

  for (const token of tokens) {
    if (token.type !== "fence" || token.map === null) continue;
    const directive = parseDirective(token.info);
    if (directive === null) continue;
    const [start, end] = token.map;

    let replacement: string | null = null;
    if (directive.kind === "props") {
      const tables = context.api[directive.argument];
      if (tables !== undefined && tables.length > 0) {
        replacement = tables.map(apiTableMarkdown).join("\n\n");
      }
    } else if (directive.kind === "index") {
      replacement = indexMarkdown(directive.argument, context.entries, base);
    }

    if (replacement !== null) {
      edits.push({ start, end, lines: replacement.split("\n") });
      continue;
    }
    const edit: Edit = { start, end, lines: [] };
    if (isBlank(lines[start - 1]) && isBlank(lines[edit.end])) {
      while (edit.end < lines.length && isBlank(lines[edit.end])) edit.end += 1;
    }
    edits.push(edit);
  }

  const out: string[] = [];
  let at = 0;
  for (const edit of edits) {
    out.push(...lines.slice(at, edit.start), ...edit.lines);
    at = edit.end;
  }
  out.push(...lines.slice(at));

  const text = out.join("\n").replace(/^(?:[ \t]*\n)+/, "").trimEnd();
  const head = [`# ${model.title}`];
  if (model.description !== undefined && model.description !== "") {
    head.push(
      model.description
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join("\n"),
    );
  }
  const related = model.seeAlso ?? [];
  const seeAlso = related.length === 0 ? [] : ["## See also", related.map((entry) => entryLine(entry, base)).join("\n")];
  return `${[...head, ...(text === "" ? [] : [text]), ...seeAlso].join("\n\n")}\n`;
}

export interface LlmsSite {
  readonly name: string;
  readonly description?: string | undefined;
  /** The path the site is served under, normalized. Absent, `/`. */
  readonly base?: string | undefined;
}

/**
 * The site's `llms.txt`, as llmstxt.org lays it out.
 *
 * The name, the summary when there is one, then the pages: those that head a
 * section as a bare list, as they lead the sidebar, and one `##` section per
 * category in sidebar order. Every link is the page's Markdown.
 */
export function llmsTxt(site: LlmsSite, placement: LlmsPlacement): string {
  const blocks = [`# ${site.name}`];
  if (site.description !== undefined && site.description !== "") {
    blocks.push(
      site.description
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join("\n"),
    );
  }
  const base = site.base ?? "/";
  if (placement.lead.length > 0) {
    blocks.push(placement.lead.map((entry) => entryLine(entry, base)).join("\n"));
  }
  for (const { category, items } of placement.sections) {
    blocks.push(`## ${category.label}`, items.map((entry) => entryLine(entry, base)).join("\n"));
  }
  return `${blocks.join("\n\n")}\n`;
}

/**
 * Every page's Markdown in one document, in sidebar order.
 *
 * Each page is preceded by a `Source:` line with the link `llms.txt` gives it,
 * and pages are separated by a line of `---`. A page the placement names and
 * `pages` lacks is a caller's mistake and is refused rather than skipped.
 */
export function llmsFull(
  placement: LlmsPlacement,
  pages: ReadonlyMap<string, string>,
  base = "/",
): string {
  const ordered = [...placement.lead, ...placement.sections.flatMap((section) => section.items)];
  const parts = ordered.map((entry) => {
    const text = pages.get(entry.route);
    if (text === undefined) throw new Error(`no Markdown for ${entry.route}`);
    return `Source: ${pageHref(entry.route, base)}\n\n${text}`;
  });
  return parts.join("\n---\n\n");
}
