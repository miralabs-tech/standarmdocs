/**
 * What the content scan attaches to an `ask` segment, and what the renderer does
 * with it. Run against real files in a temp folder, because the point of the
 * attachment is that `file` is the path under the content root and `hash` is the
 * one the answer endpoint will recompute from the same file.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { askIndex } from "../src/core/content/ask";
import { scanContent } from "../src/core/content/scan";
import type { AskSegment, PageModel, Segment } from "../src/core/model";
import { ASK_ISLAND, readAskIsland } from "../src/core/ask-protocol";
import { Page } from "../src/react/page";

const ASK = ["```ask id=store", "kind: choice", "question: Which?", "options:", "  - a", "  - b", "```"];

let content = "";

beforeEach(() => {
  content = mkdtempSync(join(tmpdir(), "mdocs-ask-scan-"));
  mkdirSync(join(content, "notes"));
  writeFileSync(join(content, "notes", "plan.md"), ["# Plan", "", ...ASK, "", "## Props", "", "text"].join("\n"));
  writeFileSync(
    join(content, "notes", "tabbed.md"),
    ["# Tabbed", "", "## Keyboard", "", "text", "", "## Props", "", ...ASK].join("\n"),
  );
});

afterEach(() => {
  rmSync(content, { recursive: true, force: true });
});

function asks(segments: readonly Segment[]): AskSegment[] {
  return segments.flatMap((segment): AskSegment[] => {
    if (segment.kind === "ask") return [segment];
    if (segment.kind === "tabs") return segment.tabs.flatMap((tab) => asks(tab.segments));
    return [];
  });
}

function page(model: PageModel): string {
  return renderToStaticMarkup(
    createElement(Page, {
      model,
      chrome: { categories: [], entries: [], current: model.route, degraded: null },
      demos: {},
      api: {},
    }),
  );
}

describe("scanContent with askPositions", () => {
  it("leaves the file and the hash off by default", () => {
    const [segment] = asks(scanContent({ contentDir: content }).flatMap((model) => model.segments));
    expect(segment).toBeDefined();
    expect(segment?.file).toBeUndefined();
    expect(segment?.hash).toBeUndefined();
  });

  it("gives each ask its file under the content root, with forward slashes, and its fence hash", () => {
    const models = scanContent({ contentDir: content, askPositions: true });
    const plan = models.find((model) => model.route === "/notes/plan");
    const [segment] = asks(plan?.segments ?? []);

    const source = ["# Plan", "", ...ASK, "", "## Props", "", "text"].join("\n");
    expect(segment?.file).toBe("notes/plan.md");
    expect(segment?.hash).toBe(askIndex(source)[0]?.hash);
  });

  it("finds an ask that sits inside a tab panel", () => {
    const models = scanContent({ contentDir: content, askPositions: true, tabs: ["Keyboard", "Props"] });
    const tabbed = models.find((model) => model.route === "/notes/tabbed");

    expect(tabbed?.segments.some((segment) => segment.kind === "tabs")).toBe(true);
    expect(asks(tabbed?.segments ?? []).map((segment) => segment.file)).toEqual(["notes/tabbed.md"]);
  });
});

describe("the static ask section", () => {
  it("carries its props for an island only when the scan located it", () => {
    const [located] = scanContent({ contentDir: content, askPositions: true }).filter(
      (model) => model.route === "/notes/plan",
    );
    const [plain] = scanContent({ contentDir: content }).filter((model) => model.route === "/notes/plan");
    if (located === undefined || plain === undefined) throw new Error("no page");

    expect(page(plain)).not.toContain(ASK_ISLAND);

    const holder = page(located);
    expect(holder).toContain(ASK_ISLAND);
    const marker = /data-mira-ask="([^"]*)"/.exec(holder)?.[1] ?? "";
    const node = { getAttribute: () => marker.replaceAll("&quot;", '"') } as unknown as Element;
    expect(readAskIsland(node)).toMatchObject({
      file: "notes/plan.md",
      block: { id: "store", kind: "choice" },
    });
  });

  it("reads a damaged marker as nothing rather than throwing", () => {
    const node = (value: string | null) => ({ getAttribute: () => value }) as unknown as Element;
    expect(readAskIsland(node(null))).toBeNull();
    expect(readAskIsland(node("{"))).toBeNull();
    expect(readAskIsland(node("{}"))).toBeNull();
  });
});

describe("ask positions with several roots", () => {
  it("carries the virtual file of a prefixed root and of a file root", () => {
    writeFileSync(join(content, "single.md"), ["# Single", "", ...ASK].join("\n"));
    const pages = scanContent({
      askPositions: true,
      roots: [
        { dir: join(content, "notes"), prefix: "private/notes" },
        { dir: content, prefix: "one", file: "single.md" },
      ],
    });
    const files = pages.flatMap((one) => asks(one.segments).map((segment) => segment.file));
    expect(files).toEqual(["private/notes/plan.md", "private/notes/tabbed.md", "one.md"]);

    const plan = pages.find((one) => one.route === "/private/notes/plan");
    const [segment] = asks(plan?.segments ?? []);
    const source = readFileSync(join(content, "notes", "plan.md"), "utf8");
    expect(segment?.hash).toBe(askIndex(source)[0]?.hash);
    expect(plan?.file).toBe("private/notes/plan.md");
    expect(plan?.origin?.path).toBe(join(content, "notes", "plan.md"));
  });
});
