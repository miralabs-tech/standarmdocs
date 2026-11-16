import type { ReactNode } from "react";
import { TAB, TAB_PANEL, tabButtonId, tabsBootScript } from "../../core/content/tabs";
import type { Segment, TabPanel } from "../../core/model";

/**
 * The trailing sections of the article as a tab strip — and, with the script
 * blocked, as the trailing sections of the article.
 *
 * Every panel is rendered, none is `hidden`, and the strip itself is. That is
 * the whole no-script story and it is not a fallback bolted on: a reader without
 * JavaScript gets the stacked sections this site rendered before there were
 * tabs, in the order the author wrote them, and never a control that does
 * nothing. It is the same trade `AxisControls` makes one component over.
 *
 * The roles follow the same rule. `role="tab"` is on the buttons because the
 * buttons live inside the hidden strip and arrive with it; `role="tabpanel"` is
 * *not* on the sections, because a panel is only a panel once something can
 * switch to it — the boot script adds it in the same pass that hides the
 * inactive ones. What is rendered here is what is true here: a section, named by
 * the control that will select it.
 */
export function TabsFence({
  tabs,
  render,
}: {
  readonly tabs: readonly TabPanel[];
  readonly render: (segments: readonly Segment[]) => ReactNode;
}): ReactNode {
  return (
    <div className="mira-docs__tabs" data-mira-tabs>
      <div className="mira-docs__tablist" role="tablist" hidden>
        {tabs.map((tab) => (
          <button
            key={tab.slug}
            type="button"
            role="tab"
            id={tabButtonId(tab.slug)}
            aria-controls={tab.slug}
            {...{ [TAB]: tab.slug }}
          >
            {tab.title}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <section
          key={tab.slug}
          className="mira-docs__tabpanel"
          id={tab.slug}
          aria-labelledby={tabButtonId(tab.slug)}
          {...{ [TAB_PANEL]: tab.slug }}
        >
          {render(tab.segments)}
        </section>
      ))}
      {/* Last in the group, so every panel it hides already exists when it runs,
          and before paint, so the page is never seen stacked and then collapsed.
          See `core/content/tabs.ts`. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the kit's own boot script, a string literal built at render time from nothing outside this package */}
      <script dangerouslySetInnerHTML={{ __html: tabsBootScript() }} />
    </div>
  );
}
