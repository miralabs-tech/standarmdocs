import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeBase, rootedHref, stripBase, withBase } from "../src/core/base";
import { llmsFull, llmsTxt, pageHref, pageMarkdown } from "../src/core/content/llms";
import { scanContent } from "../src/core/content/scan";
import type { PageModel } from "../src/core/model";
import { shell } from "../src/core/shell";

describe("normalizeBase", () => {
  it("gives a leading and a trailing slash", () => {
    expect(normalizeBase("standarui")).toBe("/standarui/");
    expect(normalizeBase("/standarui")).toBe("/standarui/");
    expect(normalizeBase("standarui/")).toBe("/standarui/");
    expect(normalizeBase("/a/b/")).toBe("/a/b/");
  });

  it("takes nothing, an empty string and a slash as the root", () => {
    expect(normalizeBase()).toBe("/");
    expect(normalizeBase(undefined)).toBe("/");
    expect(normalizeBase("")).toBe("/");
    expect(normalizeBase("/")).toBe("/");
  });

  it("refuses a URL, a query and a fragment", () => {
    for (const bad of ["https://host/x/", "/x/?a=1", "/x/#top", "//host://x"]) {
      expect(() => normalizeBase(bad), bad).toThrow(/base must be a path/);
    }
  });
});

describe("withBase", () => {
  it("leaves the path alone under the root", () => {
    expect(withBase("/", "/a/b")).toBe("/a/b");
    expect(withBase("/", "/")).toBe("/");
  });

  it("puts the base in front", () => {
    expect(withBase("/x/", "/a/b")).toBe("/x/a/b");
    expect(withBase("/x/", "/")).toBe("/x/");
    expect(withBase("/x/y/", "/a#top")).toBe("/x/y/a#top");
  });
});

describe("stripBase", () => {
  it("is the inverse of withBase on a pathname", () => {
    expect(stripBase("/x/", "/x/a/b")).toBe("/a/b");
    expect(stripBase("/x/", "/x/")).toBe("/");
    expect(stripBase("/x/", "/x")).toBe("/");
    expect(stripBase("/x/", "/other")).toBe("/other");
    expect(stripBase("/", "/a")).toBe("/a");
  });
});

describe("rootedHref", () => {
  it("prefixes a root-absolute link", () => {
    expect(rootedHref("/x/", "/guide/")).toBe("/x/guide/");
    expect(rootedHref("/x/", "/guide#a")).toBe("/x/guide#a");
  });

  it("leaves protocol-relative, base-prefixed, relative and external links alone", () => {
    for (const href of ["//cdn.example/a", "/x/guide/", "/x", "#a", "a/b", "https://e.com/a", "mailto:a@b.c"]) {
      expect(rootedHref("/x/", href), href).toBe(href);
    }
  });

  it("changes nothing under the root", () => {
    expect(rootedHref("/", "/guide/")).toBe("/guide/");
  });
});

describe("pageHref, llmsTxt and llmsFull", () => {
  const placement = {
    lead: [{ route: "/", title: "Home", description: undefined }],
    sections: [
      {
        category: { label: "Guide" },
        items: [{ route: "/guide/setup", title: "Setup", description: "Getting set up" }],
      },
    ],
  };

  it("prefix the pages' Markdown with the base", () => {
    expect(pageHref("/", "/x/")).toBe("/x/index.md");
    expect(pageHref("/guide/setup", "/x/")).toBe("/x/guide/setup/index.md");
    expect(pageHref("/guide/setup")).toBe("/guide/setup/index.md");
    expect(llmsTxt({ name: "N", base: "/x/" }, placement)).toBe(
      "# N\n\n- [Home](/x/index.md)\n\n## Guide\n\n- [Setup](/x/guide/setup/index.md): Getting set up\n",
    );
    const pages = new Map([
      ["/", "# Home\n"],
      ["/guide/setup", "# Setup\n"],
    ]);
    expect(llmsFull(placement, pages, "/x/")).toContain("Source: /x/guide/setup/index.md");
    expect(llmsFull(placement, pages)).toBe(llmsFull(placement, pages, "/"));
  });
});

describe("shell", () => {
  const options = { title: "T", description: undefined, script: "/a.js", stylesheets: [] };

  it("writes the base on <html> unless it is the root", () => {
    expect(shell("", { ...options, base: "/x/" })).toContain('<html lang="en" data-mdocs-base="/x/">');
    expect(shell("", { ...options, base: "/" })).toBe(shell("", options));
    expect(shell("", options)).not.toContain("data-mdocs-base");
  });
});

let contentDir = "";

function write(relative: string, body: string): void {
  const file = join(contentDir, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `---\ntitle: T\n---\n\n${body}\n`, "utf8");
}

function html(page: PageModel | undefined): string {
  const out: string[] = [];
  for (const segment of page?.segments ?? []) {
    if (segment.kind === "html") out.push(segment.html);
  }
  return out.join("\n");
}

beforeEach(() => {
  contentDir = mkdtempSync(join(tmpdir(), "base-links-"));
});

afterEach(() => {
  rmSync(contentDir, { recursive: true, force: true });
});

const LINKS = "[g](/guide/) [cdn](//cdn.example/a) [own](/x/guide/) [rel](r.md#top) [ext](https://e.com/a)";

describe("scanContent with a base", () => {
  it("prefixes root-absolute links and the routes of .md links, and nothing else", () => {
    write("r.md", "Target.");
    write("p.md", LINKS);
    const page = scanContent({ contentDir, base: "/x/" }).find((candidate) => candidate.route === "/p");
    const out = html(page);
    expect(out).toContain('href="/x/guide/"');
    expect(out).toContain('href="//cdn.example/a"');
    expect(out).not.toContain('href="/x/x/');
    expect(out).toContain('href="/x/r#top"');
    expect(out).toContain('href="https://e.com/a"');
  });

  it("is the same as no base under the root", () => {
    write("r.md", "Target.");
    write("p.md", LINKS);
    const pick = (pages: readonly PageModel[]): PageModel | undefined =>
      pages.find((candidate) => candidate.route === "/p");
    expect(html(pick(scanContent({ contentDir, base: "/" })))).toBe(html(pick(scanContent({ contentDir }))));
    expect(html(pick(scanContent({ contentDir })))).toContain('href="/guide/"');
  });
});

describe("pageMarkdown with a base", () => {
  it("relinks .md links and root-absolute links, and lists an index fence, under the base", () => {
    const files = new Map([
      ["a.md", "/a"],
      ["b.md", "/b"],
    ]);
    const entries = [{ route: "/b", title: "B", description: undefined, group: "g" }];
    const source = "[b](b.md#s) [g](/guide/) [cdn](//cdn.example/a)\n\n```index g\n```\n";
    const text = pageMarkdown(
      source,
      { title: "A", description: undefined, file: "a.md" },
      { api: {}, entries, files, base: "/x/" },
    );
    expect(text).toContain("[b](/x/b/index.md#s)");
    expect(text).toContain("[g](/x/guide/)");
    expect(text).toContain("[cdn](//cdn.example/a)");
    expect(text).toContain("- [B](/x/b/index.md)");
  });
});
