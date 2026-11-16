/**
 * The four axes of the CSS contract, as `apps/storybook/.storybook/preview.tsx`
 * actually drove them — not as the plan described them. That file left the
 * miralabs-ui tree on 2026-09-09 with the rest of Storybook and has no successor
 * there; it is frozen at
 * `.mira-captures/miralabs-ui/storybook-frozen/src/.storybook/preview.tsx`, which
 * is where the two rules below can still be read against their source.
 *
 * Two things the plan got wrong and the format has to get right:
 *
 *  - motion is `data-motion`, not `data-mira-motion`. It is the one axis that
 *    predates the prefix, and writing the prefixed name would style nothing.
 *  - an empty value is not a value. The toolbar removed the attribute for "auto"
 *    rather than setting it to `""`, because `[data-mira-density="desktop"]` and
 *    `[data-mira-density]` are different selectors and the auto case is the
 *    absence. A renderer that writes `density=""` produces a page whose density
 *    never follows the pointer, and nothing in the CSS says so.
 *
 * So an axis left out of an `Axes` is the auto case, and `axisAttributes` emits
 * no attribute for it.
 */
export interface Axes {
  readonly theme?: "light" | "dark";
  readonly density?: "desktop" | "touch";
  readonly motion?: "full" | "reduced" | "none";
  readonly glass?: "off";
}

const ATTRIBUTE = {
  theme: "data-mira-theme",
  density: "data-mira-density",
  motion: "data-motion",
  glass: "data-mira-glass",
} as const satisfies Record<keyof Axes, string>;

const AXIS_NAMES = Object.keys(ATTRIBUTE) as (keyof Axes)[];

export function axisAttributes(axes: Axes): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const name of AXIS_NAMES) {
    const value = axes[name];
    if (value !== undefined) attributes[ATTRIBUTE[name]] = value;
  }
  return attributes;
}

/** Stable across renders and unique within a matrix — a React key that is not an index. */
export function axisKey(axes: Axes): string {
  const parts = AXIS_NAMES.map((name) => `${name}:${axes[name] ?? "auto"}`);
  return parts.join("/");
}

/**
 * The matrix one demo is rendered over when a site names none. Four entries so
 * all four axes are exercised, and the first is every axis on auto — the case a
 * format that modelled "auto" as a value could not express at all.
 */
export const DEFAULT_MATRIX: readonly Axes[] = [
  {},
  { theme: "light" },
  { density: "touch" },
  { motion: "reduced", glass: "off" },
];

/* ------------------------------------------------------------------------- */
/* The page-level switch                                                      */
/* ------------------------------------------------------------------------- */

/**
 * The two axes a reader switches, and the two that stay a property of a demo.
 *
 * Theme and density are what the Astro site's `DensitySwitch` existed for, and a
 * reader changes them to answer "what does this look like on my machine". Motion
 * and glass are not that question: they are the degradations a component has to
 * survive, and a page proves them by rendering a copy that carries them, not by
 * offering a button nobody presses.
 *
 * `""` is the auto entry, and it is the absence of the attribute rather than an
 * empty one — `[data-mira-density="desktop"]` and `[data-mira-density]` are
 * different selectors, and a page that writes `density=""` is a page whose
 * density never follows the pointer.
 */
export interface AxisControl {
  readonly axis: "theme" | "density";
  readonly attribute: string;
  readonly label: string;
  readonly values: readonly { readonly value: string; readonly label: string }[];
}

export const AXIS_CONTROLS: readonly AxisControl[] = [
  {
    axis: "theme",
    attribute: ATTRIBUTE.theme,
    label: "Theme",
    values: [
      { value: "", label: "Auto" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
  },
  {
    axis: "density",
    attribute: ATTRIBUTE.density,
    label: "Density",
    values: [
      { value: "", label: "Auto" },
      { value: "desktop", label: "Desktop" },
      { value: "touch", label: "Touch" },
    ],
  },
];

/** One reader's choice for one axis, in their browser and nowhere else. */
export function axisStorageKey(axis: AxisControl["axis"]): string {
  return `standardoc:axis:${axis}`;
}

/** Set on `<html>` by the boot script; the stylesheet reveals the control on it. */
export const AXIS_READY = "data-mira-axes-ready";

/**
 * The inline `<head>` script, as source, and it has to be inline.
 *
 * An external module is deferred by definition, so it runs after first paint: a
 * reader who chose dark would get a white page first, every page, every visit.
 * The whole point of this script is to run before anything is painted, which
 * costs an inline `<script>` in the head and buys the absence of a flash.
 *
 * It also raises `AXIS_READY`, which is what makes the control visible. Doing it
 * here rather than in the deferred module means the sidebar is laid out once —
 * a control revealed after paint would push the navigation down under the cursor
 * of anyone who moved it there first.
 *
 * Wrapped in try/catch because `localStorage` throws outright in a browser set to
 * block site data, and a page whose theme boot throws is a page with no theme and
 * no islands: this script runs before the module that hydrates them.
 */
export function axisBootScript(): string {
  const pairs = AXIS_CONTROLS.map(
    (control) => `[${JSON.stringify(axisStorageKey(control.axis))},${JSON.stringify(control.attribute)}]`,
  ).join(",");
  return `(function(){var r=document.documentElement;try{var a=[${pairs}];for(var i=0;i<a.length;i++){var v=localStorage.getItem(a[i][0]);if(v)r.setAttribute(a[i][1],v)}}catch(e){}r.setAttribute(${JSON.stringify(AXIS_READY)},"")})()`;
}
