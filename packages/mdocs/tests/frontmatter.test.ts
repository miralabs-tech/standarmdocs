import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/core/content/frontmatter";

describe("front matter nesting", () => {
  it("reads an indented child under an empty parent as parent.child", () => {
    const { data, body } = parseFrontmatter("---\ntitle: Installation\nsidebar:\n  order: 2\n---\n\nProse.\n");
    expect(data["sidebar.order"]).toBe("2");
    expect(data["sidebar"]).toBeUndefined();
    expect(data["title"]).toBe("Installation");
    expect(body).toBe("\nProse.\n");
  });

  it("reads a non-indented key after the parent as top-level again", () => {
    const { data } = parseFrontmatter("---\nsidebar:\n  order: 2\ndescription: After\n---\n");
    expect(data["sidebar.order"]).toBe("2");
    expect(data["description"]).toBe("After");
    expect(data["sidebar.description"]).toBeUndefined();
  });

  it("unquotes a quoted nested value", () => {
    const { data } = parseFrontmatter("---\nsidebar:\n  label: \"Get started\"\n  badge: 'new'\n---\n");
    expect(data["sidebar.label"]).toBe("Get started");
    expect(data["sidebar.badge"]).toBe("new");
  });

  it("reads a nested flow list into lists", () => {
    const { data, lists } = parseFrontmatter("---\nsidebar:\n  tags: [a, b]\n---\n");
    expect(lists["sidebar.tags"]).toEqual(["a", "b"]);
    expect(data["sidebar.tags"]).toBeUndefined();
  });

  it("leaves flat keys and flow lists as they were", () => {
    const { data, lists } = parseFrontmatter(
      '---\ntitle: Dialog\ndescription: A surface: modal\nrelated: [/a, "/b"]\n---\n',
    );
    expect(data).toEqual({ title: "Dialog", description: "A surface: modal" });
    expect(lists).toEqual({ related: ["/a", "/b"] });
  });
});
