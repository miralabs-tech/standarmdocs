import { createElement, type ReactNode } from "react";
import { prerender } from "react-dom/static";
import { type ApiTables, demoIds, type PageModel } from "../core/model";
import type { ChromeProps } from "./chrome";
import { islandPrefix, islandSlot } from "./island";
import { Page } from "./page";
import { type DemoRegistry, loadDemos } from "./registry";

/**
 * `prerender` and not `prerenderToNodeStream`, and the reason is the test rather
 * than taste: the node-stream form cannot run in a browser, so choosing it would
 * mean the three-engine suite exercised a second code path that the built site
 * does not use. A web stream is read the same way by Bun, by Node and by every
 * test engine — one path, tested where it runs.
 */
async function toHtml(node: ReactNode, identifierPrefix?: string): Promise<string> {
  const { prelude } = await prerender(
    node,
    identifierPrefix === undefined ? {} : { identifierPrefix },
  );
  return await new Response(prelude).text();
}

export interface RenderPageOptions {
  readonly model: PageModel;
  readonly chrome: ChromeProps;
  readonly registry: DemoRegistry;
  readonly api: ApiTables;
  /** Demo id → that demo's own file, coloured at build time. */
  readonly sources?: Readonly<Record<string, string>>;
  /**
   * `false` renders every island inside the page's own tree instead of giving it
   * a root of its own — the naive shape, whose `useId` values cannot survive
   * hydration. Only the island suite passes it, to hold the failure up.
   */
  readonly perIslandRoot?: boolean;
}

/**
 * The page as body-level content: no `<html>`, no `<head>`. That is what lets a
 * test drop the result into a container and hydrate it, and `shell()` supplies
 * the document around it.
 */
export async function renderPage(options: RenderPageOptions): Promise<string> {
  const { model, chrome, registry, api, sources } = options;
  const perIslandRoot = options.perIslandRoot ?? true;
  const demos = await loadDemos(registry, demoIds(model));
  const extra = sources === undefined ? {} : { sources };

  if (!perIslandRoot) {
    return await toHtml(<Page model={model} chrome={chrome} demos={demos} api={api} {...extra} />);
  }

  // Each island prerendered by its own root, with its own identifier prefix,
  // before the page is assembled around the strings. Both halves of the fix are
  // here and neither works without the other: the root makes `useId` survive the
  // boundary, the prefix keeps four copies of one demo from claiming one id set.
  const islands: Record<string, string> = {};
  for (const segment of model.segments) {
    if (segment.kind !== "demo") continue;
    const component = demos[segment.id];
    if (component === undefined) continue;
    for (let index = 0; index < segment.matrix.length; index += 1) {
      islands[islandSlot(segment.id, index)] = await toHtml(
        createElement(component),
        islandPrefix(segment.id, index),
      );
    }
  }
  return await toHtml(
    <Page model={model} chrome={chrome} demos={demos} api={api} islands={islands} {...extra} />,
  );
}
