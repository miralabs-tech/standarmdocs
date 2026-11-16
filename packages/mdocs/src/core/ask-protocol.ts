import type { AskBlock } from "./content/ask-block";

export type { AskBlock, AskKind } from "./content/ask-block";

/**
 * The attribute that marks a question the page can answer, and whose value is
 * its props as JSON.
 *
 * It sits on the static `ask` section the renderer always writes, so the page is
 * whole before any script and the interactive island, when there is one, is a
 * client render over markup that already says the same thing. Nothing but
 * `JSON` is needed to read it, which is what keeps this module out of the
 * way of `node:crypto`.
 */
export const ASK_ISLAND = "data-mira-ask";

/** Where an answer is posted. The dev server owns the route; a built site has none. */
export const ASK_ENDPOINT = "/__ask";

/**
 * The global the dev server sets, at serve time, when it was started with
 * `--write`. Never written into a page on disk: a flag in the output would make
 * a built site look writable to whoever opens it.
 */
export const ASK_WRITE_FLAG = "__MDOCS_WRITE__";

/**
 * The `window` event the dev page raises when the server wrote an answer, so an
 * island can take the new text in place instead of the page reloading.
 */
export const ASK_ANSWER_EVENT = "mdocs:answer";

/** The detail of `ASK_ANSWER_EVENT`: the block that was written and what it now says. */
export interface AskAnswerDetail {
  /** Path under the content root, forward slashes, as the island holds it. */
  readonly file: string;
  readonly id: string;
  /** The fence hash after the write. */
  readonly hash: string;
  readonly answer: string | readonly string[];
  readonly comment: string;
}

/** What an island needs to put a question and send the answer back. */
export interface AskIslandProps {
  readonly block: AskBlock;
  /** Path under the content root, forward slashes — what `POST /__ask` expects. */
  readonly file: string;
  /** The sha256 of the fence when the page was built; echoed back to detect a stale write. */
  readonly hash: string;
}

/** The marker's value for one question. */
export function askIslandValue(props: AskIslandProps): string {
  return JSON.stringify(props);
}

/** Null for a marker that does not carry a usable block, rather than a throw mid-hydration. */
export function readAskIsland(node: Element): AskIslandProps | null {
  const raw = node.getAttribute(ASK_ISLAND);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AskIslandProps> | null;
    if (
      parsed === null ||
      typeof parsed.file !== "string" ||
      typeof parsed.hash !== "string" ||
      typeof parsed.block?.id !== "string"
    ) {
      return null;
    }
    return { block: parsed.block, file: parsed.file, hash: parsed.hash };
  } catch {
    return null;
  }
}
