/**
 * What the tab strip does to a real page, on a real engine.
 *
 * Two pieces run, and they are the two a static-markup test cannot vouch for:
 * the inline boot script, which is what turns stacked sections into a strip
 * before the reader sees either, and the delegated module, which is what answers
 * a press. Both are run against markup the `Page` component rendered — never a
 * hand-built tree, or the test would pass on markup the engine does not produce.
 *
 * The first assertion of the file is the one that matters most: before the boot
 * script runs, every panel is visible. That state is not a transient — it is the
 * whole page for a reader with JavaScript blocked, and it is the page this site
 * rendered before tabs existed.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { parsePage } from "../src/core/content/markdown";
import { TABS_BOOT_BODY, TABS_READY, TABS_STORAGE_KEY } from "../src/core/content/tabs";
import { wireTabs } from "../src/client/tabs";
import type { ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

const CHROME: ChromeProps = {
  categories: [{ slug: "forms", label: "Forms" }],
  entries: [{ route: "/c/button", title: "Button", group: "forms", description: undefined }],
  current: "/c/button",
  degraded: null,
};

const SOURCE = [
  "---",
  "title: Button",
  "---",
  "",
  "The root infers what it renders.",
  "",
  "## Keyboard",
  "",
  "Enter activates on keydown.",
  "",
  "## Parts",
  "",
  "The tree below is what it renders.",
  "",
  "## Props",
  "",
  "The tables are read from the source.",
].join("\n");

const hosts: HTMLElement[] = [];

function mount(): HTMLElement {
  const model = parsePage(SOURCE, { route: "/c/button", tabs: ["Keyboard", "Parts", "Props"] });
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(Page, { model, chrome: CHROME, demos: {}, api: {} }),
  );
  document.body.append(host);
  hosts.push(host);
  const group = host.querySelector<HTMLElement>("[data-mira-tabs]");
  if (group === null) throw new Error("the page rendered no tab strip");
  return group;
}

/** The script as the page runs it, handed the group it was rendered in. */
function boot(group: HTMLElement): void {
  new Function("g", TABS_BOOT_BODY)(group);
}

function tabs(group: HTMLElement): readonly HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>("[data-mira-tab]")];
}

function panels(group: HTMLElement): readonly HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>("[data-mira-tabpanel]")];
}

function shown(group: HTMLElement): readonly string[] {
  return panels(group)
    .filter((panel) => !panel.hasAttribute("hidden"))
    .map((panel) => panel.id);
}

function selected(group: HTMLElement): readonly string[] {
  return tabs(group)
    .filter((tab) => tab.getAttribute("aria-selected") === "true")
    .map((tab) => tab.getAttribute("data-mira-tab") ?? "");
}

beforeAll(() => {
  wireTabs(document);
});

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  localStorage.removeItem(TABS_STORAGE_KEY);
  location.hash = "";
});

describe("with the script blocked", () => {
  it("is the article the author wrote — every panel, and no control", () => {
    const group = mount();

    expect(shown(group)).toEqual(["keyboard", "parts", "props"]);
    const list = group.querySelector("[role=tablist]");
    expect(list?.hasAttribute("hidden")).toBe(true);
    expect(group.hasAttribute(TABS_READY)).toBe(false);
    // Each panel still carries its own heading, which is what a reader sees and
    // what a screen reader navigates by when no tab says the word.
    expect(group.querySelectorAll("h2")).toHaveLength(3);
  });
});

describe("the boot script", () => {
  it("shows the first panel, reveals the strip, and makes the sections panels", () => {
    const group = mount();

    boot(group);

    expect(shown(group)).toEqual(["keyboard"]);
    expect(selected(group)).toEqual(["keyboard"]);
    expect(group.querySelector("[role=tablist]")?.hasAttribute("hidden")).toBe(false);
    expect(group.hasAttribute(TABS_READY)).toBe(true);
    expect(panels(group).map((panel) => panel.getAttribute("role"))).toEqual([
      "tabpanel",
      "tabpanel",
      "tabpanel",
    ]);
    // Exactly one tab is in the tab order; the arrows reach the rest.
    expect(tabs(group).map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("opens the panel a link asked for", () => {
    location.hash = "#props";
    const group = mount();

    boot(group);

    expect(shown(group)).toEqual(["props"]);
    expect(selected(group)).toEqual(["props"]);
  });

  it("opens the panel the reader last chose, on a page they have not opened before", () => {
    localStorage.setItem(TABS_STORAGE_KEY, "parts");
    const group = mount();

    boot(group);

    expect(shown(group)).toEqual(["parts"]);
  });

  it("lets the link win over the memory", () => {
    localStorage.setItem(TABS_STORAGE_KEY, "parts");
    location.hash = "#props";
    const group = mount();

    boot(group);

    expect(shown(group)).toEqual(["props"]);
  });

  it("falls back to the first panel when the remembered tab is not on this page", () => {
    // The key is shared across the site on purpose, so a page whose sections
    // differ has to answer for a slug it does not have.
    localStorage.setItem(TABS_STORAGE_KEY, "accessibility");
    const group = mount();

    boot(group);

    expect(shown(group)).toEqual(["keyboard"]);
  });
});

describe("the delegated module", () => {
  it("switches panels on a press, and remembers the choice", () => {
    const group = mount();
    boot(group);

    tabs(group)[2]?.click();

    expect(shown(group)).toEqual(["props"]);
    expect(selected(group)).toEqual(["props"]);
    expect(localStorage.getItem(TABS_STORAGE_KEY)).toBe("props");
  });

  it("moves with the arrows, wraps, and takes the focus with it", () => {
    const group = mount();
    boot(group);
    const [first, , third] = tabs(group);
    first?.focus();

    first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));

    expect(shown(group)).toEqual(["props"]);
    expect(document.activeElement).toBe(third);
    expect(third?.getAttribute("tabindex")).toBe("0");
    expect(first?.getAttribute("tabindex")).toBe("-1");
  });

  it("answers Home and End", () => {
    const group = mount();
    boot(group);
    const all = tabs(group);
    all[1]?.focus();

    all[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(shown(group)).toEqual(["props"]);

    all[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(shown(group)).toEqual(["keyboard"]);
  });

  it("leaves a key that is not its own alone", () => {
    // Tab has to keep leaving the strip, and a page whose focus is in the strip
    // has to keep answering PageDown. The handler only ever preventDefaults a
    // key it acted on.
    const group = mount();
    boot(group);
    const first = tabs(group)[0];
    first?.focus();

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    first?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(shown(group)).toEqual(["keyboard"]);
  });
});
