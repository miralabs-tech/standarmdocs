import { AXIS_CONTROLS, axisStorageKey } from "../core/axes";

const AXIS = "data-mira-axis";
const VALUE = "data-mira-axis-value";

function attributeFor(axis: string): string | undefined {
  return AXIS_CONTROLS.find((control) => control.axis === axis)?.attribute;
}

function isAxis(axis: string): axis is (typeof AXIS_CONTROLS)[number]["axis"] {
  return AXIS_CONTROLS.some((control) => control.axis === axis);
}

/**
 * `aria-pressed` read back off `<html>`, never off what was clicked.
 *
 * The boot script has already applied the stored preference by the time this
 * runs, and the buttons were rendered by a server that could not know it — so the
 * only honest source for which one is on is the attribute itself. Deriving it
 * from the click instead would leave every button wrong on first load for exactly
 * the readers who chose something.
 */
function reflect(root: Element): void {
  for (const control of AXIS_CONTROLS) {
    const applied = root.getAttribute(control.attribute) ?? "";
    for (const button of root.ownerDocument.querySelectorAll<HTMLElement>(
      `[${AXIS}="${control.axis}"]`,
    )) {
      button.setAttribute("aria-pressed", String(button.getAttribute(VALUE) === applied));
    }
  }
}

/**
 * The page-level axis switch, wired by delegation and nothing else.
 *
 * One listener on the document rather than one per button: the control is
 * rendered by the chrome, which is not an island and is never re-rendered, so
 * there is no lifecycle to attach to and nothing to tear down.
 *
 * Setting an axis to `""` removes the attribute rather than writing an empty one,
 * and that is the whole auto case — `[data-mira-density="desktop"]` and
 * `[data-mira-density]` are different selectors, so an empty value is a density
 * that never follows the pointer again.
 */
export function wireAxisControls(document: Document): void {
  const root = document.documentElement;
  reflect(root);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>(`[${AXIS}]`);
    if (button === null) return;

    const axis = button.getAttribute(AXIS);
    const value = button.getAttribute(VALUE);
    if (axis === null || value === null || !isAxis(axis)) return;
    const attribute = attributeFor(axis);
    if (attribute === undefined) return;

    if (value === "") root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);

    try {
      if (value === "") localStorage.removeItem(axisStorageKey(axis));
      else localStorage.setItem(axisStorageKey(axis), value);
    } catch {
      // A browser set to block site data still gets the switch, for this page.
    }

    reflect(root);
  });
}
