/**
 * The block as a document: a named region that is not in the contents, whose
 * links are plain anchors.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { parsePage } from "../src/core/content/markdown";
import type { ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

const CHROME: ChromeProps = { categories: [], entries: [], current: "/a", degraded: null };

const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

describe("See also", () => {
  it("is a region named by its heading, after the article and outside the contents", () => {
    const model = {
      ...parsePage("## One\n\nText.\n\n## Two\n\nText.\n", { route: "/a" }),
      seeAlso: [{ route: "/b", title: "B", description: "The b page" }],
    };
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      createElement(Page, { model, chrome: CHROME, demos: {}, api: {} }),
    );
    document.body.append(host);
    hosts.push(host);

    const region = host.querySelector<HTMLElement>('section[aria-labelledby="mira-see-also"]');
    expect(region).not.toBeNull();
    expect(host.querySelector("#mira-see-also")?.textContent).toBe("See also");
    expect(region?.querySelector("a")?.getAttribute("href")).toBe("/b");
    expect(region?.textContent).toContain("The b page");
    expect(host.querySelector('[data-mira-toc]')?.textContent).not.toContain("See also");
    const main = host.querySelector("main");
    expect(main?.lastElementChild).toBe(region);
  });
});
