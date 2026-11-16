import "../src/styles/docs.css";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { type ChromeEntry, StaticChrome } from "../src/react/chrome";

const CATEGORIES = [
  { slug: "a", label: "Archive" },
  { slug: "b", label: "Cadrage" },
  { slug: "c", label: "Research" },
];

const ROOT: readonly ChromeEntry[] = ["Checklist", "Reprise", "Roadmap"].map((title) => ({
  route: `/${title.toLowerCase()}`,
  title,
  group: undefined,
  description: undefined,
}));

const GROUPED: readonly ChromeEntry[] = CATEGORIES.flatMap((category) =>
  [0, 1].map((index) => ({
    route: `/${category.slug}/p${index}`,
    title: `Page ${index}`,
    group: category.slug,
    description: undefined,
  })),
);

const hosts: HTMLElement[] = [];

function mount(entries: readonly ChromeEntry[], dir: "ltr" | "rtl" = "ltr"): HTMLElement {
  const host = document.createElement("div");
  host.dir = dir;
  host.style.inlineSize = "280px";
  host.innerHTML = renderToStaticMarkup(
    createElement(StaticChrome, { categories: CATEGORIES, entries, current: "/zzz", degraded: null }),
  );
  document.body.append(host);
  hosts.push(host);
  const sidebar = host.querySelector<HTMLElement>(".mira-docs__sidebar");
  if (sidebar === null) throw new Error("the chrome rendered no sidebar");
  sidebar.style.height = "auto";
  return sidebar;
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

function summaries(sidebar: HTMLElement): HTMLElement[] {
  return [...sidebar.querySelectorAll<HTMLElement>("summary")];
}

function gapAbove(summary: HTMLElement): number {
  const previous = summary.closest("section")?.previousElementSibling;
  if (previous === null || previous === undefined) throw new Error("nothing above the group");
  const above = previous.querySelector("details") ? previous.querySelector("ul") : previous;
  if (above === null) throw new Error("nothing above the group");
  return summary.getBoundingClientRect().top - above.getBoundingClientRect().bottom;
}

describe("the sidebar's layout", () => {
  it("spaces every group header that follows content the same", () => {
    const sidebar = mount([...ROOT, ...GROUPED]);
    const [, second, third] = summaries(sidebar);
    const first = summaries(sidebar)[0];
    if (first === undefined || second === undefined || third === undefined) throw new Error("groups missing");
    const lead = sidebar.querySelector<HTMLElement>(".mira-docs__lead");
    if (lead === null) throw new Error("no lead list");

    const afterRoot = first.getBoundingClientRect().top - lead.getBoundingClientRect().bottom;
    expect(afterRoot).toBeGreaterThan(8);
    expect(gapAbove(second)).toBeCloseTo(afterRoot, 0);
    expect(gapAbove(third)).toBeCloseTo(afterRoot, 0);
  });

  it("gives no top margin to a group that opens the list", () => {
    const sidebar = mount(GROUPED);
    const [first, second] = summaries(sidebar);
    if (first === undefined || second === undefined) throw new Error("groups missing");
    expect(getComputedStyle(first).marginBlockStart).toBe("0px");
    expect(getComputedStyle(second).marginBlockStart).not.toBe("0px");
  });

  it("indents group entries under a hairline, and leaves root pages flush", () => {
    const sidebar = mount([...ROOT, ...GROUPED]);
    const root = sidebar.querySelector<HTMLElement>(".mira-docs__lead a");
    const grouped = sidebar.querySelector<HTMLElement>("details a");
    const list = sidebar.querySelector<HTMLElement>("details > ul");
    if (root === null || grouped === null || list === null) throw new Error("links missing");

    expect(grouped.getBoundingClientRect().left).toBeGreaterThan(root.getBoundingClientRect().left + 8);
    expect(parseFloat(getComputedStyle(list).borderInlineStartWidth)).toBeGreaterThan(0);
  });

  for (const dir of ["ltr", "rtl"] as const) {
    it(`puts the chevron at the inline end of the summary (${dir})`, () => {
      const sidebar = mount([...ROOT, ...GROUPED], dir);
      const summary = summaries(sidebar)[0];
      if (summary === undefined) throw new Error("no summary");
      const box = summary.getBoundingClientRect();
      const label = summary.querySelector("h2")?.getBoundingClientRect();
      if (label === undefined) throw new Error("no heading");
      const chevron = getComputedStyle(summary, "::after");
      expect(chevron.content).not.toBe("none");
      expect(parseFloat(chevron.width)).toBeGreaterThan(0);
      const pushed = parseFloat(chevron.marginInlineStart);
      expect(pushed).toBeGreaterThan(40);
      const labelStart = dir === "ltr" ? label.left - box.left : box.right - label.right;
      expect(labelStart).toBeLessThan(box.width / 4);
    });
  }
});
