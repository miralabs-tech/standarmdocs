import type { ComponentType, ReactNode } from "react";
import type { Axes } from "../../core/axes";
import { Island, islandSlot } from "../island";

export interface DemoFenceProps {
  readonly id: string;
  readonly component: ComponentType;
  readonly matrix: readonly Axes[];
  readonly islands: Readonly<Record<string, string>> | undefined;
  /** The demo's own file, already coloured. Absent renders no disclosure at all. */
  readonly source: string | undefined;
}

/**
 * What a ```demo fence becomes. The author wrote an id; everything below —
 * where the boundary sits, how many times the demo is rendered, which axes each
 * copy carries — is derived from that id and the matrix.
 *
 * One island per matrix entry rather than one island wrapping the matrix: the
 * axes are DOM attributes the components below read through CSS, so two copies
 * under one root would share a root and could not differ. It also means a loader
 * that hydrates only the first root fails loudly instead of leaving three dead
 * copies that look right until someone presses a key in one.
 */
export function DemoFence({
  id,
  component: Component,
  matrix,
  islands,
  source,
}: DemoFenceProps): ReactNode {
  return (
    <div className="mira-demo" data-mira-demo={id}>
      <div className="mira-demo__stage">
        {matrix.map((axes, index) => {
          const slot = islandSlot(id, index);
          const html = islands?.[slot];
          return (
            <Island key={slot} id={id} instance={index} axes={axes} {...(html ? { html } : {})}>
              <Component />
            </Island>
          );
        })}
      </div>
      {source === undefined ? null : (
        // The demo's own file rather than a transcription of it, which is the
        // property the Astro site had through Vite's `?raw` and the one worth
        // carrying across: a fenced block written by hand next to an import of
        // the same component diverges at the first refactor with nothing to say
        // so. `<details>` and not a button with state, for the same reason the
        // chrome is anchors — the fold has to work on the first paint, and an
        // island per page for a disclosure is a bad trade. The summary carries
        // both captions and CSS picks one on `[open]`.
        <details className="mira-demo__code">
          <summary className="mira-demo__toggle">
            <span className="mira-demo__toggle-shown">Show code</span>
            <span className="mira-demo__toggle-open">Hide code</span>
          </summary>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: this site's own demo file, coloured at build time */}
          <div dangerouslySetInnerHTML={{ __html: source }} />
        </details>
      )}
    </div>
  );
}
