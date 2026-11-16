import { createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { ISLAND_ID, ISLAND_INSTANCE, islandPrefix } from "./island";
import { type DemoRegistry, loadDemo } from "./registry";

export interface HydratedIsland {
  readonly node: HTMLElement;
  readonly root: Root;
}

/**
 * The client half of the boundary: find what the renderer marked, hydrate that
 * subtree, and touch nothing else.
 *
 * `hydrateRoot` on the island element rather than on the page means the chrome
 * around it is never handed to React at all — not rendered and discarded, not
 * matched and kept, simply never seen. That is the difference between an island
 * and a page that happens to be server-rendered first.
 *
 * One root per island, in parallel, because each carries its own axes and its
 * own mount. Nothing here is ordered, and nothing here may be: a loader that
 * needs the first island to finish before the second is a loader whose second
 * demo is dead while the first one's chunk downloads.
 */
export async function hydrateIslands(
  within: ParentNode,
  registry: DemoRegistry,
): Promise<HydratedIsland[]> {
  const nodes = [...within.querySelectorAll<HTMLElement>(`[${ISLAND_ID}]`)];
  return await Promise.all(
    nodes.map(async (node) => {
      const id = node.getAttribute(ISLAND_ID);
      if (id === null) throw new Error("island element without an id");
      // Recomputed from the element rather than shipped in a manifest: the two
      // sides must agree on the prefix or every id mismatches, and a second
      // source of truth for it is a second thing that can drift.
      const instance = Number(node.getAttribute(ISLAND_INSTANCE) ?? "0");
      const component = await loadDemo(registry, id);
      const root = hydrateRoot(node, createElement(component), {
        identifierPrefix: islandPrefix(id, instance),
      });
      return { node, root };
    }),
  );
}
