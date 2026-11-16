/**
 * The bet, on three engines.
 *
 * Everything this engine is rests on one behaviour: a demo that was prerendered
 * as part of a page, and then hydrated as an island on its own, still behaves.
 * A demo with state, a demo that portals out of its island and a matrix of four
 * identical trees are the shapes that survive least well through a second
 * mounting, and all three are here, written with plain elements so that nothing
 * but the engine is under test.
 *
 * The failure being hunted is quiet. An island loader that hydrates almost
 * correctly throws nothing: the button renders, and the click does nothing, or
 * lands in the wrong copy. So every assertion here is about what a real key or a
 * real click did, and the interaction is exercised in the *second* island of the
 * matrix — a loader that hydrates only one root passes every first-island
 * assertion there is.
 */

import { act } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MIRALABS_MATRIX } from "../src/core/axes";
import { type HydratedIsland, hydrateIslands } from "../src/react/hydrate";
import { ISLAND_ID } from "../src/react/island";
import { type RenderPageOptions, renderPage } from "../src/react/prerender";
import { API, CHROME, DEMOS, ISLAND_COUNT, MODEL } from "./fixtures/page";

const SURFACE = '[data-surface="note"]';

function actEnvironment(on: boolean): void {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = on;
}

actEnvironment(true);

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Polls while React is allowed to commit on its own — the focus moves this waits
 * on are scheduled by the browser, not by the test, and `act` would hold them
 * back until it exited.
 */
async function waitFor(assertion: () => void): Promise<void> {
  actEnvironment(false);
  try {
    await vi.waitFor(assertion);
  } finally {
    actEnvironment(true);
  }
  await settle();
}

function press(key: string, shiftKey = false): void {
  const target: EventTarget = document.activeElement ?? document;
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });
}

/** Focused before it is clicked, because `click()` does not focus and a real pointer does. */
function open(trigger: HTMLElement): void {
  act(() => {
    trigger.focus();
    trigger.click();
  });
}

let container: HTMLElement | null = null;
let islands: HydratedIsland[] = [];

async function mountPage(options?: Pick<RenderPageOptions, "perIslandRoot">): Promise<string> {
  const html = await renderPage({
    model: MODEL,
    chrome: CHROME,
    registry: DEMOS,
    api: API,
    ...options,
  });
  const node = document.createElement("div");
  node.innerHTML = html;
  document.body.append(node);
  container = node;
  return html;
}

function page(): HTMLElement {
  if (container === null) throw new Error("the page was never mounted");
  return container;
}

function islandsOf(id: string): HTMLElement[] {
  return [...page().querySelectorAll<HTMLElement>(`[${ISLAND_ID}="${id}"]`)];
}

function only(id: string): HTMLElement {
  const found = islandsOf(id)[0];
  if (found === undefined) throw new Error(`no island rendered for "${id}"`);
  return found;
}

function within<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`no \`${selector}\` under the node given`);
  return found;
}

async function hydrate(): Promise<HydratedIsland[]> {
  await act(async () => {
    islands = await hydrateIslands(page(), DEMOS);
  });
  await settle();
  return islands;
}

/** Swallows React's own logging so a hydration mismatch can be asserted on rather than printed. */
async function withConsoleErrors(run: () => Promise<void>): Promise<string[]> {
  const seen: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    seen.push(args.map((arg) => String(arg)).join(" "));
  });
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
  return seen;
}

// This suite prerenders with react-dom/static and hydrates with react-dom/client
// in the same realm, so the two renderers share context objects and React warns
// on every provider. Production never runs both in one realm.
const MULTIPLE_RENDERERS = "Detected multiple renderers concurrently rendering the same context provider";
const consoleError = console.error;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes(MULTIPLE_RENDERERS)) return;
    consoleError(...args);
  };
});

afterAll(() => {
  console.error = consoleError;
});

afterEach(() => {
  act(() => {
    for (const island of islands) island.root.unmount();
  });
  islands = [];
  container?.remove();
  container = null;
});

describe("the page before any script", () => {
  it("is whole — chrome, prose and props table, with every region closed and no island hydrated", async () => {
    const html = await mountPage();

    expect(page().querySelectorAll(`[${ISLAND_ID}]`)).toHaveLength(ISLAND_COUNT);
    expect(islandsOf("disclosure-basic")).toHaveLength(MIRALABS_MATRIX.length);
    expect(page().querySelector(".mira-docs__sidebar")).not.toBeNull();
    expect(page().querySelectorAll(".mira-docs__sidebar section")).toHaveLength(3);
    // Five, not four: the fixture's two tables are an interface with four members
    // and an alias, and the alias states its definition in one body row.
    expect(page().querySelectorAll(".mira-docs__props tbody tr")).toHaveLength(5);
    expect(html).toContain("Show details");
    expect(html).toContain("A button and the region");

    // Three disclosures in the demo, every button already in the markup — and not
    // one region anywhere, because none is open.
    const buttons = [...only("disclosure-basic").querySelectorAll("button")];
    expect(buttons).toHaveLength(3);
    expect(buttons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false", "false"]);
    expect(only("disclosure-basic").querySelector("p")).toBeNull();
    expect(document.querySelector(SURFACE)).toBeNull();
  });

  it("writes an axis left on auto as an absent attribute, never an empty one", async () => {
    await mountPage();
    const nodes = islandsOf("disclosure-basic");

    expect(nodes[0]?.hasAttribute("data-mira-theme")).toBe(false);
    expect(nodes[0]?.hasAttribute("data-mira-density")).toBe(false);
    expect(nodes[1]?.getAttribute("data-mira-theme")).toBe("light");
    expect(nodes[2]?.getAttribute("data-mira-density")).toBe("touch");
    expect(nodes[3]?.getAttribute("data-motion")).toBe("reduced");
    expect(nodes[3]?.getAttribute("data-mira-glass")).toBe("off");
  });

  it("gives every island its own id space, so a matrix does not collide", async () => {
    await mountPage();
    const ids = [...page().querySelectorAll<HTMLElement>("[id]")].map((node) => node.id);

    // Four copies of one demo are four identical trees. Without a per-island
    // `identifierPrefix` they get four identical id sets, and every
    // `aria-controls` in copies two through four resolves to copy one.
    const controlled = islandsOf("disclosure-basic").flatMap((node) =>
      [...node.querySelectorAll("[aria-controls]")].map((control) => control.getAttribute("aria-controls")),
    );
    expect(controlled).toHaveLength(12);
    expect(new Set(controlled).size).toBe(controlled.length);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });
});

describe("hydration", () => {
  it("hands React the demo subtrees and nothing else", async () => {
    await mountPage();
    const sidebar = page().querySelector(".mira-docs__sidebar");
    const table = page().querySelector(".mira-docs__props");

    const hydrated = await hydrate();

    expect(hydrated).toHaveLength(ISLAND_COUNT);
    // Same nodes, not equal ones: React never saw the chrome, so it cannot have
    // replaced it.
    expect(page().querySelector(".mira-docs__sidebar")).toBe(sidebar);
    expect(page().querySelector(".mira-docs__props")).toBe(table);
  });

  it("reports no mismatch when each island was prerendered by its own root", async () => {
    const errors = await withConsoleErrors(async () => {
      await mountPage();
      await hydrate();
    });

    // Hydration messages only, and the exclusion is not a convenience. Prerendering
    // and hydrating in one page makes React see two renderers on the same context
    // objects and say so, dozens of times. The built site cannot reach that
    // state: `prerender` runs in Bun at build time and never ships, which
    // `check:bundle` asserts against the actual chunks.
    expect(errors.filter((message) => /hydrat/i.test(message))).toEqual([]);
  });

  it("does mismatch when the islands were prerendered inside the page tree", async () => {
    // The measurement behind `Island.html`. `useId` derives an id from a
    // component's position in the tree it was rendered in, so an island six
    // levels down the page on the server and at the root of its own tree in the
    // browser is at two positions and gets two ids. If React ever stops
    // disagreeing here, this test fails and the per-island root becomes dead
    // weight that should come out.
    const errors = await withConsoleErrors(async () => {
      await mountPage({ perIslandRoot: false });
      await hydrate();
    });
    expect(errors.join("\n")).toMatch(/hydrat/i);
  });
});

describe("state, after a second mounting", () => {
  it("opens the region of the second island only, and leaves focus on its button", async () => {
    await mountPage();
    const hydrated = await hydrate();

    const second = hydrated[1];
    if (second === undefined) throw new Error("the matrix produced no second island");
    const button = within<HTMLButtonElement>(second.node, "button");

    open(button);
    await settle();

    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panel = second.node.querySelector("p");
    expect(panel?.id).toBe(button.getAttribute("aria-controls"));
    expect(panel?.textContent).toBe("The details are here.");
    expect(document.activeElement).toBe(button);

    for (const node of islandsOf("disclosure-basic")) {
      if (node === second.node) continue;
      expect(node.querySelector("p")).toBeNull();
    }

    open(button);
    await settle();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(second.node.querySelector("p")).toBeNull();
  });

  it("keeps the count of a stateful button across clicks", async () => {
    await mountPage();
    await hydrate();

    const button = within<HTMLButtonElement>(only("counter-basic"), "button");
    expect(button.textContent).toBe("Clicked 0 times");
    open(button);
    open(button);
    await settle();
    expect(button.textContent).toBe("Clicked 2 times");
  });
});

describe("the portal, after a second mounting", () => {
  it("opens a surface out of an island, moves focus inside it, and gives focus back on Escape", async () => {
    await mountPage();
    await hydrate();

    const trigger = within<HTMLButtonElement>(only("portal-basic"), "button");
    open(trigger);

    await waitFor(() => {
      expect(document.querySelector(SURFACE)).not.toBeNull();
    });
    const surface = document.querySelector<HTMLElement>(SURFACE);
    if (surface === null) throw new Error("the note opened without a surface");
    expect(only("portal-basic").contains(surface)).toBe(false);

    await waitFor(() => {
      expect(surface.contains(document.activeElement)).toBe(true);
    });

    press("Escape");
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
    expect(document.querySelector(SURFACE)).toBeNull();
  });
});
