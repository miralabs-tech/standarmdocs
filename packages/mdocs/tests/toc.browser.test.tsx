/**
 * The current-section mark, on a real engine.
 *
 * The page is the one `Page` renders and the module is the one the generated
 * entry wires. Spacers make the sections taller than the viewport, so scrolling
 * moves headings across the line the module watches; the stylesheet is not
 * loaded, which leaves both copies of the contents in the document and lets the
 * test check they are marked together.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { wireToc } from "../src/client/toc";
import { parsePage } from "../src/core/content/markdown";
import type { ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

const CHROME: ChromeProps = {
  categories: [],
  entries: [],
  current: "/c/button",
  degraded: null,
};

const SPACER = '<div style="height: 1800px"></div>';

const SOURCE = [SPACER, "", "## One", "", SPACER, "", "## Two", "", SPACER, "", "### Three", "", SPACER].join(
  "\n",
);

const hosts: HTMLElement[] = [];

function mount(source: string): HTMLElement {
  const model = parsePage(source, { route: "/c/button" });
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(Page, { model, chrome: CHROME, demos: {}, api: {} }),
  );
  document.body.append(host);
  hosts.push(host);
  return host;
}

function marked(host: HTMLElement): readonly string[] {
  return [...host.querySelectorAll<HTMLAnchorElement>('[data-mira-toc] a[aria-current="location"]')].map(
    (link) => link.getAttribute("href") ?? "",
  );
}

function scrollTo(host: HTMLElement, id: string): void {
  const heading = host.querySelector<HTMLElement>(`#${id}`);
  if (heading === null) throw new Error(`no heading ${id}`);
  window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 8);
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  window.scrollTo(0, 0);
});

describe("the current section", () => {
  it("marks nothing above the first heading", () => {
    const host = mount(SOURCE);
    wireToc(document);

    expect(host.querySelectorAll("[data-mira-toc]")).toHaveLength(2);
    expect(marked(host)).toEqual([]);
  });

  it("follows the reader down and back up, on both copies of the contents", async () => {
    const host = mount(SOURCE);
    wireToc(document);

    scrollTo(host, "one");
    await vi.waitFor(() => expect(marked(host)).toEqual(["#one", "#one"]));

    scrollTo(host, "three");
    await vi.waitFor(() => expect(marked(host)).toEqual(["#three", "#three"]));

    scrollTo(host, "two");
    await vi.waitFor(() => expect(marked(host)).toEqual(["#two", "#two"]));

    window.scrollTo(0, 0);
    await vi.waitFor(() => expect(marked(host)).toEqual([]));
  });

  it("does nothing on a page with no contents", () => {
    const host = mount("## Only\n");
    expect(() => wireToc(document)).not.toThrow();
    expect(marked(host)).toEqual([]);
  });
});
