import type { ReactNode } from "react";
import { type Axes, axisAttributes } from "../core/axes";

/**
 * The boundary, and the whole reason this is a component rather than a directive.
 *
 * Astro asks the author to write `client:load` on the element they meant. That
 * works until they write it on the wrapper instead of the demo, at which point
 * the wrapper hydrates, the demo arrives as slot HTML, and the focus trap inside
 * it is mounted a second time from markup — the failure `Demo.tsx` describes and
 * that nothing reports.
 *
 * Here the renderer places the demo, so the renderer places the boundary. There
 * is no attribute an author can attach to the wrong node, because there is no
 * attribute an author writes.
 */
export const ISLAND_ID = "data-mira-island";
export const ISLAND_INSTANCE = "data-mira-island-instance";

/** Keys one island's prerendered HTML. Also its React key: unique and not an index. */
export function islandSlot(id: string, instance: number): string {
  return `${id}#${instance}`;
}

/**
 * React's `identifierPrefix` for one island, and the matrix cannot do without it.
 *
 * Giving each island its own root fixes `useId` across the hydration boundary,
 * and then breaks it across the page: four copies of one demo are four identical
 * trees, so they get four identical id sets and the document ends up with
 * `dialog:_R_1_:trigger` on four elements. Every `aria-labelledby` in copies two
 * through four then resolves to copy one, because that is what an IDREF does.
 *
 * The prefix has to be derived from what the island element already carries, so
 * the browser can compute the same one the prerender used without being told.
 */
export function islandPrefix(id: string, instance: number): string {
  return `${id}-${instance}-`;
}

export interface IslandProps {
  readonly id: string;
  readonly instance: number;
  readonly axes: Axes;
  /**
   * The island's contents, rendered by their *own* React root rather than as part
   * of the page's tree — which is not a detail and not an optimisation.
   *
   * `useId` derives an id from the component's position in the tree it was
   * rendered in. An island sitting six levels down the page tree on the server
   * and hydrated as the root of its own tree on the client is at two different
   * positions, so it gets two different ids, and every `aria-labelledby` in the
   * component points at the wrong one. Rendering each island as its own root on
   * both sides is what makes the two positions the same position.
   *
   * `undefined` renders `children` in place instead — the naive shape, kept only
   * so the island suite can hold the mismatch up and show it.
   */
  readonly html?: string;
  readonly children?: ReactNode;
}

export function Island({ id, instance, axes, html, children }: IslandProps): ReactNode {
  const marks = { [ISLAND_ID]: id, [ISLAND_INSTANCE]: String(instance) };
  if (html !== undefined) {
    return (
      <div
        className="mira-island"
        {...axisAttributes(axes)}
        {...marks}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: React's own `prerender` output for this same component, never a string from outside
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <div className="mira-island" {...axisAttributes(axes)} {...marks}>
      {children}
    </div>
  );
}
