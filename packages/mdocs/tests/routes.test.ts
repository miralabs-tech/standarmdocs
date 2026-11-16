/**
 * What a file's place in the tree makes it, and the one file shape that must not
 * be read at all.
 *
 * Three of the forty-one pages ported from the Astro site are here rather than in
 * the mechanical set, and all three failed on routing rather than on content: the
 * site root and the components landing page both routed to `…/index`, which is a
 * 404 for every link written to `/components/`, and the hero on the front page
 * pointed at exactly that. The third was a group with no category, which the
 * sidebar dropped without a word.
 *
 * The `.mdx` case is the same defect one level up: `walk` matched `.md` and said
 * nothing about anything else, so a file left unconverted was a page that simply
 * did not exist — no error, no route, no entry.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PageModel } from "../src/core/model";
import { rootFile, scanContent } from "../src/core/content/scan";

let contentDir = "";

function page(relative: string, title: string): void {
  const file = join(contentDir, relative);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, `---\ntitle: ${title}\ndescription: The ${title} page.\n---\n\nProse.\n`, "utf8");
}

function routed(pages: readonly PageModel[], route: string): PageModel {
  const found = pages.find((candidate) => candidate.route === route);
  if (found === undefined) {
    throw new Error(`no page routed to ${route}; got ${pages.map((p) => p.route).join(", ")}`);
  }
  return found;
}

beforeAll(() => {
  contentDir = mkdtempSync(join(tmpdir(), "standardoc-routes-"));
  page("index.md", "Home");
  page("components/index.md", "Components");
  page("components/overlays/dialog.md", "Dialog");
  page("start-here/installation.md", "Installation");
});

afterAll(() => {
  rmSync(contentDir, { recursive: true, force: true });
});

describe("the content tree is the route table", () => {
  it("routes a directory's index to the directory, not to a page called index", () => {
    const pages = scanContent({ contentDir });
    // `/components/index` is what a naive `.replace(/\.md$/, "")` produces, and it
    // is a 404 for the link every other page writes.
    expect(pages.map((one) => one.route)).not.toContain("/components/index");
    expect(routed(pages, "/components").title).toBe("Components");
  });

  it("routes the root index to the site root", () => {
    const pages = scanContent({ contentDir });
    expect(pages.map((one) => one.route)).not.toContain("/index");
    expect(routed(pages, "/").title).toBe("Home");
  });

  it("leaves a leaf page's route and group alone", () => {
    const pages = scanContent({ contentDir });
    const dialog = routed(pages, "/components/overlays/dialog");
    expect(dialog.group).toBe("overlays");
    expect(routed(pages, "/start-here/installation").group).toBe("start-here");
  });

  it("gives an index page no group, because it is the section rather than a page in one", () => {
    // `components/index.md` sits in `components/`, so the directory rule would put
    // it in a group named after the directory it heads — a group no category can
    // ever match, which is precisely how it vanished from the sidebar.
    const pages = scanContent({ contentDir });
    expect(routed(pages, "/components").group).toBeUndefined();
    expect(routed(pages, "/").group).toBeUndefined();
  });
});

describe("a private folder", () => {
  it("is never entered, at any depth", () => {
    const tree = mkdtempSync(join(tmpdir(), "standardoc-private-"));
    mkdirSync(join(tree, "guide", ".miralabs"), { recursive: true });
    mkdirSync(join(tree, ".miralabs"), { recursive: true });
    writeFileSync(join(tree, "index.md"), "---\ntitle: Home\n---\n", "utf8");
    writeFileSync(join(tree, "guide", "setup.md"), "---\ntitle: Setup\n---\n", "utf8");
    writeFileSync(join(tree, ".miralabs", "plan.md"), "---\ntitle: Plan\n---\n", "utf8");
    writeFileSync(join(tree, "guide", ".miralabs", "notes.md"), "---\ntitle: Notes\n---\n", "utf8");
    writeFileSync(join(tree, "guide", ".miralabs", "left.mdx"), "---\ntitle: Left\n---\n", "utf8");
    try {
      const pages = scanContent({ contentDir: tree });
      expect(pages.map((one) => one.route)).toEqual(["/guide/setup", "/"]);
      expect(pages.map((one) => one.file)).toEqual(["guide/setup.md", "index.md"]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it("is the content directory itself when that is asked for", () => {
    const tree = mkdtempSync(join(tmpdir(), "standardoc-private-"));
    const inside = join(tree, ".miralabs");
    mkdirSync(inside);
    writeFileSync(join(inside, "index.md"), "---\ntitle: Plan\n---\n", "utf8");
    try {
      expect(scanContent({ contentDir: inside }).map((one) => one.title)).toEqual(["Plan"]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});

describe("a file the engine cannot read", () => {
  it("refuses an .mdx rather than skipping it in silence", () => {
    const stray = mkdtempSync(join(tmpdir(), "standardoc-mdx-"));
    writeFileSync(join(stray, "index.md"), "---\ntitle: Home\n---\n", "utf8");
    writeFileSync(join(stray, "left-behind.mdx"), "---\ntitle: Left behind\n---\n", "utf8");
    try {
      expect(() => scanContent({ contentDir: stray })).toThrowError(/left-behind\.mdx/);
    } finally {
      rmSync(stray, { recursive: true, force: true });
    }
  });
});

describe("several content roots", () => {
  let base = "";
  const at = (...parts: string[]): string => join(base, ...parts);

  function write(path: string, title: string): void {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, `---\ntitle: ${title}\n---\n\nProse.\n`, "utf8");
  }

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), "standardoc-roots-"));
    write(at("main", "index.md"), "Main");
    write(at("main", "guide", "intro.md"), "Intro");
    write(at("notes", "index.md"), "Notes");
    write(at("notes", "plan.md"), "Plan");
    write(at("notes", "deep", "idea.md"), "Idea");
    write(at("notes", ".miralabs", "secret.md"), "Secret");
    write(at("README.md"), "Readme");
    write(at("index.md"), "Top");
    write(at("other.md"), "Other");
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it("mounts a directory under its prefix, with the virtual path as file", () => {
    const pages = scanContent({
      roots: [
        { dir: at("main"), prefix: "" },
        { dir: at("notes"), prefix: "private/notes" },
      ],
    });
    expect(pages.map((one) => [one.route, one.file, one.group])).toEqual([
      ["/guide/intro", "guide/intro.md", "guide"],
      ["/", "index.md", undefined],
      ["/private/notes/deep/idea", "private/notes/deep/idea.md", "deep"],
      ["/private/notes", "private/notes/index.md", undefined],
      ["/private/notes/plan", "private/notes/plan.md", "notes"],
    ]);
    expect(routed(pages, "/private/notes/plan").origin).toEqual({
      root: at("notes"),
      path: at("notes", "plan.md"),
    });
  });

  it("makes a file root one page, routed by its prefix or by its name", () => {
    const pages = scanContent({
      roots: [
        { dir: at("main"), prefix: "" },
        { dir: base, prefix: "", file: "README.md" },
        { dir: base, prefix: "about/readme", file: "other.md" },
      ],
    });
    expect(routed(pages, "/readme").file).toBe("README.md");
    expect(routed(pages, "/readme").group).toBeUndefined();
    const other = routed(pages, "/about/readme");
    expect(other.file).toBe("about/readme.md");
    expect(other.group).toBe("about");
    expect(other.origin).toEqual({ root: at("other.md"), path: at("other.md") });
    expect(rootFile({ dir: base, prefix: "about/readme", file: "other.md" })).toBe("about/readme.md");
  });

  it("routes an index.md file root with no prefix to the top", () => {
    const pages = scanContent({ roots: [{ dir: base, prefix: "", file: "index.md" }] });
    expect(pages.map((one) => [one.route, one.file])).toEqual([["/", "index.md"]]);
  });

  it("scans one unprefixed root exactly as contentDir does", () => {
    const sugar = scanContent({ contentDir: at("notes") });
    const roots = scanContent({ roots: [{ dir: at("notes"), prefix: "" }] });
    expect(roots).toEqual(sugar);
    expect(sugar.map((one) => one.route)).toEqual(["/deep/idea", "/", "/plan"]);
  });

  it("skips a .miralabs inside a root and reads a root that is one, junction included", () => {
    const inside = scanContent({ contentDir: at("notes") });
    expect(inside.map((one) => one.file)).not.toContain(".miralabs/secret.md");

    const private_ = scanContent({ roots: [{ dir: at("notes", ".miralabs"), prefix: "secrets" }] });
    expect(private_.map((one) => one.route)).toEqual(["/secrets/secret"]);

    symlinkSync(at("notes", ".miralabs"), at("link-miralabs"), "junction");
    const linked = scanContent({
      roots: [
        { dir: at("main"), prefix: "" },
        { dir: at("link-miralabs"), prefix: "private" },
      ],
    });
    expect(linked.map((one) => one.route)).toContain("/private/secret");
  });

  it("accepts a root that sits in the .miralabs of another, which the walk never enters", () => {
    const pages = scanContent({
      roots: [
        { dir: at("notes"), prefix: "" },
        { dir: at("notes", ".miralabs"), prefix: "secrets" },
      ],
    });
    expect(pages.map((one) => one.route)).toContain("/secrets/secret");
  });

  it("throws when two roots claim a route, naming both real files", () => {
    const roots = [
      { dir: at("main"), prefix: "" },
      { dir: base, prefix: "guide/intro", file: "other.md" },
    ];
    expect(() => scanContent({ roots })).toThrow(/route \/guide\/intro is claimed by both .*intro\.md and .*other\.md/);
  });

  it("throws when roots overlap", () => {
    expect(() =>
      scanContent({
        roots: [
          { dir: base, prefix: "" },
          { dir: at("notes"), prefix: "n" },
        ],
      }),
    ).toThrow(/content roots overlap/);
    expect(() =>
      scanContent({
        roots: [
          { dir: at("notes"), prefix: "" },
          { dir: at("notes"), prefix: "again" },
        ],
      }),
    ).toThrow(/content roots overlap/);
    expect(() =>
      scanContent({
        roots: [
          { dir: at("notes"), prefix: "" },
          { dir: at("notes"), prefix: "plan", file: "plan.md" },
        ],
      }),
    ).toThrow(/content roots overlap/);
  });

  it("refuses a file root that is not a .md", () => {
    writeFileSync(at("data.txt"), "x", "utf8");
    expect(() => scanContent({ roots: [{ dir: base, prefix: "d", file: "data.txt" }] })).toThrow(
      /is not a \.md file/,
    );
  });
});
