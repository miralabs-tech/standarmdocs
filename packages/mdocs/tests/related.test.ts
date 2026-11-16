/**
 * "See also": the flow sequence the front matter reads, the routes matched against
 * the scanned pages, the block the page draws and the list in its Markdown.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFrontmatter } from "../src/core/content/frontmatter";
import { pageMarkdown } from "../src/core/content/llms";
import { parsePage } from "../src/core/content/markdown";
import { resolveRelated } from "../src/core/content/related";
import { scanContent } from "../src/core/content/scan";
import type { PageModel } from "../src/core/model";
import type { ChromeProps } from "../src/react/chrome";
import { Page } from "../src/react/page";

const CHROME: ChromeProps = {
  categories: [],
  entries: [],
  current: "/a",
  degraded: null,
};

function front(lines: string): ReturnType<typeof parseFrontmatter> {
  return parseFrontmatter(`---\n${lines}\n---\n\nBody.\n`);
}

function page(route: string, related: readonly string[], extra: Partial<PageModel> = {}): PageModel {
  return {
    route,
    title: route.slice(1).toUpperCase() || "Home",
    description: undefined,
    group: undefined,
    segments: [],
    toc: [],
    related,
    file: `${route.slice(1)}.md`,
    ...extra,
  };
}

function render(model: PageModel): string {
  return renderToStaticMarkup(createElement(Page, { model, chrome: CHROME, demos: {}, api: {} }));
}

describe("parseFrontmatter flow sequences", () => {
  it("reads a one-line sequence into lists and keeps it out of data", () => {
    const parsed = front("title: A\nrelated: [/x/y, /z]");
    expect(parsed.lists["related"]).toEqual(["/x/y", "/z"]);
    expect(parsed.data["related"]).toBeUndefined();
    expect(parsed.data["title"]).toBe("A");
  });

  it("reads quoted items, commas inside quotes included", () => {
    expect(front(`related: ["/a", '/b', "/c,d"]`).lists["related"]).toEqual(["/a", "/b", "/c,d"]);
  });

  it("reads an empty sequence as an empty list", () => {
    expect(front("related: []").lists["related"]).toEqual([]);
    expect(front("related: [ ]").lists["related"]).toEqual([]);
  });

  it("leaves a source with no front matter with empty lists", () => {
    expect(parseFrontmatter("Prose.\n").lists).toEqual({});
  });
});

describe("parsePage", () => {
  it("carries the related routes, and none when there is no related key", () => {
    expect(parsePage("---\nrelated: [/a, /b]\n---\n\nProse.\n", { route: "/c" }).related).toEqual([
      "/a",
      "/b",
    ]);
    expect(parsePage("Prose.\n", { route: "/c" }).related).toEqual([]);
  });
});

describe("resolveRelated", () => {
  const pages = [
    page("/a", ["/b", "/c"]),
    page("/b", [], { description: "The b page" }),
    page("/c", []),
  ];

  it("turns each route into the target's route, title and description", () => {
    const [first] = resolveRelated(pages, "error");
    expect(first?.seeAlso).toEqual([
      { route: "/b", title: "B", description: "The b page" },
      { route: "/c", title: "C", description: undefined },
    ]);
  });

  it("returns a page with no related untouched", () => {
    const resolved = resolveRelated(pages, "error");
    expect(resolved[1]).toBe(pages[1]);
  });

  it("fails a build naming the source file and the missing route", () => {
    const broken = [page("/a", ["/missing"]), page("/b", [])];
    expect(() => resolveRelated(broken, "error")).toThrow(/a\.md.*\/missing/);
  });

  it("warns in dev, omits the link and does not throw", () => {
    const warn = vi.fn();
    const resolved = resolveRelated([page("/a", ["/missing", "/b"]), page("/b", [])], "warn", warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/a\.md.*\/missing/);
    expect(resolved[0]?.seeAlso?.map((link) => link.route)).toEqual(["/b"]);
  });
});

describe("scanContent with related", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("names the file of the page that holds the unknown route", () => {
    const dir = mkdtempSync(join(tmpdir(), "see-also-"));
    dirs.push(dir);
    mkdirSync(join(dir, "guide"));
    writeFileSync(join(dir, "guide", "one.md"), "---\ntitle: One\nrelated: [/nowhere]\n---\n\nProse.\n");
    const scanned = scanContent({ contentDir: dir });
    expect(() => resolveRelated(scanned, "error")).toThrow("guide/one.md: related route /nowhere");
  });
});

describe("the See also block", () => {
  const resolved = resolveRelated(
    [page("/a", ["/b"]), page("/b", [], { description: "The b page" })],
    "error",
  );

  it("renders a labelled section of links with the description when there is one", () => {
    const html = render(resolved[0] as PageModel);
    expect(html).toContain('<section class="mira-docs__see-also" aria-labelledby="mira-see-also">');
    expect(html).toContain('<h2 id="mira-see-also">See also</h2>');
    expect(html).toContain('<a href="/b">B</a><p>The b page</p>');
  });

  it("comes after the content", () => {
    const html = render({
      ...(resolved[0] as PageModel),
      segments: [{ kind: "html", html: "<p>Prose.</p>" }],
    });
    expect(html.indexOf("Prose.")).toBeLessThan(html.indexOf("See also"));
  });

  it("is not part of the table of contents", () => {
    const model = parsePage("## One\n\n## Two\n", { route: "/a" });
    const html = render({ ...model, seeAlso: resolved[0]?.seeAlso });
    const rail = html.slice(html.indexOf('class="docs-toc docs-toc--rail"'));
    expect(rail).not.toContain("See also");
    expect(html.match(/href="#mira-see-also"/)).toBeNull();
  });

  it("renders nothing for a page with no related", () => {
    expect(render(page("/a", []))).not.toContain("See also");
    expect(render(page("/a", [], { seeAlso: [] }))).not.toContain("See also");
  });
});

describe("the See also list in the Markdown", () => {
  const seeAlso = [
    { route: "/b", title: "B", description: "The b page" },
    { route: "/c", title: "C", description: undefined },
  ];

  it("ends the page with the links to the targets' Markdown", () => {
    const text = pageMarkdown("Prose.\n", { title: "A", description: undefined, seeAlso }, { api: {}, entries: [] });
    expect(text).toBe("# A\n\nProse.\n\n## See also\n\n- [B](/b/index.md): The b page\n- [C](/c/index.md)\n");
  });

  it("adds nothing without related", () => {
    const text = pageMarkdown("Prose.\n", { title: "A", description: undefined }, { api: {}, entries: [] });
    expect(text).toBe("# A\n\nProse.\n");
  });
});
