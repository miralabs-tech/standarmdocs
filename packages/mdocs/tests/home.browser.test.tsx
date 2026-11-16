import "../src/styles/docs.css";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { PageModel } from "../src/core/model";
import type { ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

const CHROME: ChromeProps = {
  categories: [
    { slug: "forms", label: "Forms" },
    { slug: "overlays", label: "Overlays" },
  ],
  entries: [
    { route: "/start", title: "Start", group: undefined, description: "Begin here" },
    { route: "/forms/button", title: "Button", group: "forms", description: "Press it" },
    { route: "/forms/input", title: "Input", group: "forms", description: undefined },
    { route: "/overlays/dialog", title: "Dialog", group: "overlays", description: "A surface" },
  ],
  current: "/",
  degraded: null,
  siteName: "Docs",
};

const MODEL: PageModel = {
  route: "/",
  title: "Docs",
  description: undefined,
  group: undefined,
  segments: [{ kind: "home" }],
  toc: [],
  related: [],
};

const hosts: HTMLElement[] = [];

async function mount(width: number): Promise<HTMLElement> {
  await page.viewport(width, 800);
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(Page, { model: MODEL, chrome: CHROME, demos: {}, api: {} }),
  );
  document.body.append(host);
  hosts.push(host);
  return host;
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

describe("the generated front page", () => {
  it("lays the cards out in a grid beside the sidebar at a wide width", async () => {
    const host = await mount(1280);
    const sidebar = host.querySelector<HTMLElement>(".mira-docs__sidebar");
    expect(sidebar).not.toBeNull();
    expect(getComputedStyle(sidebar as HTMLElement).display).not.toBe("none");

    const lists = host.querySelectorAll<HTMLElement>(".mira-docs__cards");
    expect(lists).toHaveLength(3);
    for (const list of lists) expect(getComputedStyle(list).display).toBe("grid");

    const forms = host.querySelectorAll<HTMLElement>(".mira-docs__home-group")[0];
    const cards = forms?.querySelectorAll<HTMLElement>(".mira-docs__card") ?? [];
    expect(cards).toHaveLength(2);
    const first = (cards[0] as HTMLElement).getBoundingClientRect();
    const second = (cards[1] as HTMLElement).getBoundingClientRect();
    expect(first.top).toBe(second.top);
    expect(first.right).toBeLessThanOrEqual(second.left);
  });

  it("draws no default list or link styling", async () => {
    const host = await mount(1280);
    const list = host.querySelector<HTMLElement>(".mira-docs__cards") as HTMLElement;
    expect(getComputedStyle(list).listStyleType).toBe("none");
    const card = host.querySelector<HTMLElement>(".mira-docs__card") as HTMLElement;
    expect(getComputedStyle(card).textDecorationLine).toBe("none");
    expect(getComputedStyle(card).borderTopWidth).not.toBe("0px");
  });

  it("puts the root pages before the first group", async () => {
    const host = await mount(1280);
    const titles = [...host.querySelectorAll<HTMLElement>(".mira-docs__card-title")].map(
      (node) => node.textContent,
    );
    expect(titles).toEqual(["Start", "Button", "Input", "Dialog"]);
  });
});
