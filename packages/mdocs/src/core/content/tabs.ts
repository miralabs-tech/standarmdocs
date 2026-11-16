import type { Segment, TabPanel } from "../model";

/**
 * The trailing sections of an article, folded into one tab strip.
 *
 * A component page ends the same way every time — the prose that explains the
 * component, then the reference: how it answers the keyboard, what parts it is
 * made of, what props it takes. Measured on the site this engine was written
 * against, that reference is a third of the page and the reader scrolls past all
 * of it to reach any one part of it: thirty-nine pages, two hundred and
 * ninety-one tables, and ten of those tables are longer than twenty rows.
 *
 * So the *trailing* run and never a set gathered from the whole article. A rule
 * that hoisted matching sections out of the middle of a page would reorder the
 * document — the engine would be rendering something other than what the author
 * wrote, and the author would have no way to say otherwise. The run stops at the
 * first section the vocabulary does not name, which makes the author's ordering
 * the whole of the control: move a heading, and the strip follows.
 *
 * The vocabulary itself is the site's, never the engine's. This kit documents no
 * particular library, and `Keyboard` / `Parts` / `Props` are three headings a
 * component library happens to use.
 */

/** On the group, once its boot script has run. Nothing is styled as a tab until. */
export const TABS_READY = "data-mira-tabs-ready";

/** On each tab button, the slug it selects. */
export const TAB = "data-mira-tab";

/** On each panel, the slug that selects it. */
export const TAB_PANEL = "data-mira-tabpanel";

/**
 * The tab a reader last chose, by slug, across the whole site.
 *
 * One key and not one per route: a reader who came for the props tables comes
 * for them on the next component too, and a per-route memory makes them choose
 * again on every page. A slug this page has no tab for falls back to the first,
 * which is also what makes the key safe to share between pages whose sections
 * differ.
 */
export const TABS_STORAGE_KEY = "standardoc:tabs";

/** `Keyboard` → `keyboard`, and it is the panel's `id`, so it is a link target. */
export function tabSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `keyboard` → the id of the button that selects it. */
export function tabButtonId(slug: string): string {
  return `tab-${slug}`;
}

/** One run of segments under one `##`, before any grouping. */
export interface Section {
  /** Absent for the prose above the first `##`, which can never be a tab. */
  readonly title: string | undefined;
  readonly segments: readonly Segment[];
}

/**
 * How many of the trailing sections fold into the strip, by their titles.
 *
 * Zero when fewer than two do. Kept apart from `groupTabs` because the page needs
 * the answer before its sections are rendered: the headings that will sit inside
 * a panel get no entry in the contents.
 */
export function tabRun(
  titles: readonly (string | undefined)[],
  vocabulary: readonly string[],
): number {
  const named = new Set(vocabulary);
  let start = titles.length;
  while (start > 0) {
    const title = titles[start - 1];
    if (title === undefined || !named.has(title)) break;
    start -= 1;
  }
  const run = titles.length - start;
  return run < 2 ? 0 : run;
}

/**
 * Sections in, segments out — with the trailing run of named ones folded into a
 * single `tabs` segment.
 *
 * Two sections minimum, because one tab is not a choice: a page with only
 * `## Props` at the end reads better as the heading it was written as than as a
 * strip with nothing to switch to.
 */
export function groupTabs(
  sections: readonly Section[],
  vocabulary: readonly string[],
): readonly Segment[] {
  const flat = (from: readonly Section[]): readonly Segment[] =>
    coalesce(from.flatMap((section) => section.segments));
  if (vocabulary.length === 0) return flat(sections);

  const start = sections.length - tabRun(
    sections.map((section) => section.title),
    vocabulary,
  );
  const run = sections.slice(start);
  if (run.length === 0) return flat(sections);

  const tabs: TabPanel[] = run.map((section) => {
    // Non-null by construction: the walk above stops at the first `undefined`.
    const title = section.title as string;
    return { slug: tabSlug(title), title, segments: coalesce(section.segments) };
  });

  // Refused rather than deduplicated. Two panels sharing a slug share an `id`,
  // which makes one of them unreachable by link and makes `aria-controls` point
  // at whichever the browser found first — a page that looks built and is wrong
  // in a way no count can see.
  const slugs = new Set(tabs.map((tab) => tab.slug));
  if (slugs.size !== tabs.length) {
    throw new Error(
      `two tab sections share a slug: ${tabs.map((tab) => `${tab.title} → ${tab.slug}`).join(", ")}`,
    );
  }

  return [...flat(sections.slice(0, start)), { kind: "tabs", tabs }];
}

/**
 * Adjacent prose back into one blob, which is what it was before the split.
 *
 * Sections are cut at every `##`, whether or not any of them becomes a tab — one
 * code path, taken by every site. That cut is invisible in the model and loud in
 * the stylesheet: each run of prose is rendered as its own element, and
 * `.mira-docs__prose > :first-child { margin-block-start: 0 }` then zeroes the
 * space above every heading on the site, because every heading has just become a
 * first child. Merging back is what keeps a page that folds nothing byte-identical
 * to the page this engine rendered before tabs existed.
 *
 * Adjacent, and never across a fence: a section that reads prose, ```props,
 * prose is three segments and has to stay three, or the fence would be rendered
 * out of the order it was written in.
 */
function coalesce(segments: readonly Segment[]): readonly Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (segment.kind === "html" && last?.kind === "html") {
      merged[merged.length - 1] = { kind: "html", html: last.html + segment.html };
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

/**
 * The script's body, taking the group element as `g`.
 *
 * Inline and rendered inside the group, for the reason the sidebar's is: this is
 * the half that has to run *before paint*. Every panel is rendered by the server
 * and every panel is visible, so that a reader with no script gets the article
 * the author wrote — the stacked sections, in order, exactly as this site read
 * before there were tabs. A module would hide the extra panels one frame late,
 * and every page on the site would flash its whole reference and then collapse.
 *
 * It does the ARIA too, and that is the same argument rather than a second one:
 * `role="tab"` on a control nothing has wired is a promise the page cannot keep,
 * so the roles arrive with the behaviour or they do not arrive. What is left for
 * the module is only what a reader has to act to reach — the click and the arrow
 * keys, which can afford to land with the rest of the bundle.
 *
 * Plain ES5, shipped verbatim and minified by nothing.
 */
export const TABS_BOOT_BODY = [
  `var K=${JSON.stringify(TABS_STORAGE_KEY)},T=${JSON.stringify(TAB)},R=${JSON.stringify(TABS_READY)};`,
  'var list=g.querySelector(\'[role="tablist"]\');if(!list)return;',
  "var tabs=[].slice.call(g.querySelectorAll(\"[\"+T+\"]\"));if(tabs.length<2)return;",
  // Paired through `aria-controls` and never by index: the pairing is already
  // written in the markup, and a second one derived here could disagree with it.
  'var panels=[];for(var i=0;i<tabs.length;i++){var p=document.getElementById(tabs[i].getAttribute("aria-controls")||"");if(!p)return;panels.push(p)}',
  "var want=null;",
  'var h=(location.hash||"").replace(/^#/,"");',
  "if(h){for(var i=0;i<panels.length;i++){if(panels[i].id===h)want=tabs[i].getAttribute(T)}}",
  "if(want===null){try{want=localStorage.getItem(K)}catch(e){}}",
  "var found=false;for(var i=0;i<tabs.length;i++){if(tabs[i].getAttribute(T)===want)found=true}",
  "if(!found)want=tabs[0].getAttribute(T);",
  "for(var i=0;i<tabs.length;i++){var on=tabs[i].getAttribute(T)===want;",
  'tabs[i].setAttribute("aria-selected",on?"true":"false");tabs[i].setAttribute("tabindex",on?"0":"-1");',
  'panels[i].setAttribute("role","tabpanel");panels[i].setAttribute("tabindex","0");',
  'if(on)panels[i].removeAttribute("hidden");else panels[i].setAttribute("hidden","")}',
  'list.removeAttribute("hidden");',
  'g.setAttribute(R,"");',
].join("");

/** The inline script, as rendered inside the group. */
export function tabsBootScript(): string {
  return `(function(g){if(!g)return;${TABS_BOOT_BODY}})(document.currentScript&&document.currentScript.parentElement)`;
}
