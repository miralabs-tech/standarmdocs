/**
 * Relative links to `.md` files: resolved against the source file, mapped to the
 * route the scan gives the target, fragment kept, everything else left alone.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageMarkdown } from "../src/core/content/llms";
import { resolveLink } from "../src/core/content/links";
import { scanContent } from "../src/core/content/scan";
import type { PageModel, Segment } from "../src/core/model";

const ROUTES = new Map([
  ["index.md", "/"],
  ["a/b.md", "/a/b"],
  ["a/c.md", "/a/c"],
  ["x/index.md", "/x"],
  ["research/r.md", "/research/r"],
]);

describe("resolveLink", () => {
  it("resolves a sibling", () => {
    expect(resolveLink("a/b.md", "./c.md", ROUTES)).toEqual({
      kind: "route",
      route: "/a/c",
      fragment: "",
    });
    expect(resolveLink("a/b.md", "c.md", ROUTES)).toMatchObject({ route: "/a/c" });
  });

  it("resolves a parent directory", () => {
    expect(resolveLink("a/b.md", "../research/r.md", ROUTES)).toMatchObject({
      route: "/research/r",
    });
  });

  it("maps an index file to its directory and the root index to the root", () => {
    expect(resolveLink("a/b.md", "../x/index.md", ROUTES)).toMatchObject({ route: "/x" });
    expect(resolveLink("a/b.md", "../index.md", ROUTES)).toMatchObject({ route: "/" });
  });

  it("keeps the fragment", () => {
    expect(resolveLink("a/b.md", "./c.md#jalon-2", ROUTES)).toEqual({
      kind: "route",
      route: "/a/c",
      fragment: "#jalon-2",
    });
  });

  it("leaves absolute URLs, mailto, fragments and other files alone", () => {
    for (const href of [
      "https://example.com/x.md",
      "//example.com/x.md",
      "mailto:a@b.c",
      "#c.md",
      "/a/c.md",
      "./c.png",
      "./c",
    ]) {
      expect(resolveLink("a/b.md", href, ROUTES)).toBeNull();
    }
  });

  it("reports an unknown target with the resolved path", () => {
    expect(resolveLink("a/b.md", "../nope.md", ROUTES)).toEqual({
      kind: "unknown",
      resolved: "nope.md",
    });
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
  const collect = (segments: readonly Segment[]): void => {
    for (const segment of segments) {
      if (segment.kind === "html") out.push(segment.html);
      if (segment.kind === "tabs") for (const tab of segment.tabs) collect(tab.segments);
    }
  };
  collect(page?.segments ?? []);
  return out.join("\n");
}

beforeEach(() => {
  contentDir = mkdtempSync(join(tmpdir(), "md-links-"));
});

afterEach(() => {
  rmSync(contentDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("scanContent rewrites links", () => {
  it("rewrites prose links, keeps fragments, leaves code and absolute links", () => {
    write("research/r.md", "Target.");
    write(
      "cadrage/d.md",
      [
        "[a](../research/r.md#top) [b](https://e.com/r.md) [c](#frag)",
        "",
        "`[x](../research/r.md)`",
        "",
        "```md",
        "[y](../research/r.md)",
        "```",
      ].join("\n"),
    );
    const out = html(scanContent({ contentDir }).find((p) => p.route === "/cadrage/d"));
    expect(out).toContain('href="/research/r#top"');
    expect(out).toContain('href="https://e.com/r.md"');
    expect(out).toContain('href="#frag"');
    expect(out).toContain("[x](../research/r.md)");
    expect(out).toContain("[y](../research/r.md)");
  });

  it("rewrites links inside tab panels", () => {
    write("research/r.md", "Target.");
    write("a/p.md", "Intro.\n\n## Usage\n\n[r](../research/r.md)\n\n## API\n\nText.");
    const page = scanContent({ contentDir, tabs: ["Usage", "API"] }).find(
      (p) => p.route === "/a/p",
    );
    expect(html(page)).toContain('href="/research/r"');
  });

  it("throws on an unknown target, naming file, link and resolved path", () => {
    write("a/p.md", "[n](../nope.md)");
    expect(() => scanContent({ contentDir })).toThrow(
      /a\/p\.md: link \.\.\/nope\.md resolves to nope\.md/,
    );
  });

  it("warns and keeps the link in warn mode", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    write("a/p.md", "[n](../nope.md)");
    const out = html(scanContent({ contentDir, links: "warn" })[0]);
    expect(out).toContain('href="../nope.md"');
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("pageMarkdown", () => {
  it("points a link at the published index.md of the route, outside code", () => {
    const text = pageMarkdown(
      "[a](../research/r.md#top) and `[x](../research/r.md)` and [e](https://e.com/r.md)\n",
      { title: "T", description: undefined, file: "a/b.md" },
      { api: {}, entries: [], files: ROUTES },
    );
    expect(text).toContain("[a](/research/r/index.md#top)");
    expect(text).toContain("`[x](../research/r.md)`");
    expect(text).toContain("[e](https://e.com/r.md)");
  });
});

describe("scanContent links across roots", () => {
  const put = (file: string, body: string): void => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `---\ntitle: T\n---\n\n${body}\n`, "utf8");
  };

  it("resolves a link by real path into another root, whatever the prefixes", () => {
    const docs = join(contentDir, "docs");
    const notes = join(contentDir, "notes");
    put(join(docs, "guide", "intro.md"), "[n](../../notes/plan.md#top) [s](./next.md)");
    put(join(docs, "guide", "next.md"), "Next.");
    put(join(notes, "plan.md"), "[back](../docs/guide/intro.md) [side](./sub/deep.md)");
    put(join(notes, "sub", "deep.md"), "Deep.");
    put(join(contentDir, "README.md"), "[docs](docs/guide/intro.md)");

    const pages = scanContent({
      roots: [
        { dir: docs, prefix: "" },
        { dir: notes, prefix: "private/notes" },
        { dir: contentDir, prefix: "", file: "README.md" },
      ],
    });
    const route = (value: string): PageModel | undefined => pages.find((p) => p.route === value);
    expect(html(route("/guide/intro"))).toContain('href="/private/notes/plan#top"');
    expect(html(route("/guide/intro"))).toContain('href="/guide/next"');
    expect(html(route("/private/notes/plan"))).toContain('href="/guide/intro"');
    expect(html(route("/private/notes/plan"))).toContain('href="/private/notes/sub/deep"');
    expect(html(route("/readme"))).toContain('href="/guide/intro"');
  });

  it("does not take a link for the page that merely has the same virtual path", () => {
    const left = join(contentDir, "left");
    const right = join(contentDir, "right");
    put(join(left, "a.md"), "[b](./b.md)");
    put(join(left, "b.md"), "Left b.");
    put(join(right, "b.md"), "Right b.");
    const pages = scanContent({
      roots: [
        { dir: left, prefix: "l" },
        { dir: right, prefix: "r" },
      ],
    });
    expect(html(pages.find((p) => p.route === "/l/a"))).toContain('href="/l/b"');
  });

  it("names the virtual file and the resolved path of an unknown target", () => {
    const docs = join(contentDir, "docs");
    put(join(docs, "p.md"), "[n](../nope.md)");
    const roots = [{ dir: docs, prefix: "d" }];
    expect(() => scanContent({ roots })).toThrow(
      /d\/p\.md: link \.\.\/nope\.md resolves to \S+\/nope\.md, which is not a page/,
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pages = scanContent({ roots, links: "warn" });
    expect(warn).toHaveBeenCalledOnce();
    expect(html(pages[0])).toContain('href="../nope.md"');
  });
});
