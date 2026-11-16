import { DEFAULT_MATRIX } from "../axes";
import type { Segment } from "../model";
import { askId, parseAsk } from "./ask-block";

/**
 * The four directives, and the whole authoring surface of a page.
 *
 * ```demo dialog-basic      — the demo by that id, rendered over the matrix
 * ```props dialog           — the generated table for that component
 * ```index overlays         — every page of that group, as a grid of cards
 * ```ask id=scope           — a question for the reader, its body a small YAML
 *                             subset (see `content/ask.ts`); without a valid
 *                             `id=` it is not a directive and stays a code block
 *
 * A directive is a *fence*, not a component and not a JSX import: MDX was
 * rejected for this exact reason. An author writes an id; where the hydration
 * boundary lands, how many copies are rendered and which axes each one carries
 * are decided by the renderer, so there is no attribute to put on the wrong node.
 *
 * ```index is the one the Astro site wrote as `<ComponentGrid category="forms"/>`
 * six times on one page. It takes a group and not a list, for the reason the scan
 * takes a directory and not a list: a component added under `content/components/
 * overlays/` has to appear on the overlays grid with no edit anywhere.
 */
export interface Directive {
  readonly kind: "demo" | "props" | "index" | "ask";
  readonly argument: string;
}

const KINDS = new Set<Directive["kind"]>(["demo", "props", "index", "ask"]);

function isKind(value: string | undefined): value is Directive["kind"] {
  return value !== undefined && KINDS.has(value as Directive["kind"]);
}

export function parseDirective(info: string): Directive | null {
  const [keyword, ...rest] = info.trim().split(/\s+/);
  if (!isKind(keyword)) return null;
  if (keyword === "ask") {
    const id = askId(info);
    return id === null ? null : { kind: "ask", argument: id };
  }
  const argument = rest.join(" ").trim();
  if (argument === "") return null;
  return { kind: keyword, argument };
}

export function toSegment(directive: Directive, body = ""): Segment {
  if (directive.kind === "ask") {
    return { kind: "ask", block: parseAsk(directive.argument, body) };
  }
  if (directive.kind === "demo") {
    return { kind: "demo", id: directive.argument, matrix: DEFAULT_MATRIX };
  }
  if (directive.kind === "index") return { kind: "index", group: directive.argument };
  return { kind: "props", name: directive.argument };
}
