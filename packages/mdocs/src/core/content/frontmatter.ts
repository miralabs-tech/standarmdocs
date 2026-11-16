export interface Frontmatter {
  readonly data: Readonly<Record<string, string>>;
  /** Keys written as a one-line `[a, b]` sequence; they are not in `data`. */
  readonly lists: Readonly<Record<string, readonly string[]>>;
  readonly body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function flowItems(inner: string): string[] {
  const items: string[] = [];
  let at = 0;
  while (at < inner.length) {
    while (at < inner.length && /\s/.test(inner.charAt(at))) at += 1;
    if (at >= inner.length) break;
    const quote = inner.charAt(at);
    const quoted = quote === '"' || quote === "'";
    const close = quoted ? inner.indexOf(quote, at + 1) : -1;
    const end = quoted ? close : inner.indexOf(",", at);
    const stop = end === -1 ? inner.length : end;
    const item = (quoted ? inner.slice(at + 1, stop) : inner.slice(at, stop)).trim();
    const comma = inner.indexOf(",", stop);
    at = comma === -1 ? inner.length : comma + 1;
    if (item !== "") items.push(item);
  }
  return items;
}

/**
 * Enough YAML for the front matter these pages actually carry, and no more.
 *
 * Measured before it was written: all 41 pages ported from the Astro site carry
 * `title` and `description` and nothing else, except one `sidebar.order` and one
 * `template`/`hero`. A YAML dependency for `key: value` would be a dependency to
 * keep current for the rest of the project's life.
 *
 * A value may be quoted; anything else is taken verbatim to the end of the line,
 * which is why a description containing a colon needs no escaping.
 *
 * One exception to "a value is a string": a value written as a one-line flow
 * sequence, `related: [/a, "/b"]`, is read into `lists` instead of `data`. Items
 * are split on commas outside quotes and may be quoted; `[]` is an empty list.
 * Block sequences (`- item` lines) are not read.
 */
export function parseFrontmatter(source: string): Frontmatter {
  const match = FENCE.exec(source);
  if (match === null || match[1] === undefined) return { data: {}, lists: {}, body: source };

  const data: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const raw = trimmed.slice(colon + 1).trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      lists[key] = flowItems(raw.slice(1, -1));
      continue;
    }
    const quoted = /^(["'])([\s\S]*)\1$/.exec(raw);
    data[key] = quoted?.[2] ?? raw;
  }
  return { data, lists, body: source.slice(match[0].length) };
}
