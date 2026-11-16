import { describe, expect, it } from "vitest";
import { parse, parseBase, parseRoots, parseRootSpec } from "../../src/cli/cli-args";

describe("parse", () => {
  it("collects every --root in order, in both spellings, and keeps the last in flags", () => {
    const { command, flags, repeated } = parse([
      "dev",
      "--root",
      "docs",
      "--root=private=notes",
      "--root",
      "=README.md",
      "--port",
      "0",
      "--write",
    ]);
    expect(command).toBe("dev");
    expect(repeated.get("root")).toEqual(["docs", "private=notes", "=README.md"]);
    expect(flags.get("root")).toBe("=README.md");
    expect(flags.get("port")).toBe("0");
    expect(flags.get("write")).toBe("true");
  });

  it("keeps a single --root as it always was", () => {
    const { flags, repeated } = parse(["dev", "--root", "notes"]);
    expect(flags.get("root")).toBe("notes");
    expect(repeated.get("root")).toEqual(["notes"]);
  });

  it("still needs a value for --root and refuses a stray argument", () => {
    expect(() => parse(["dev", "--root"])).toThrow("--root needs a value");
    expect(() => parse(["dev", "--root", "--write"])).toThrow("--root needs a value");
    expect(() => parse(["dev", "notes"])).toThrow("unexpected argument: notes");
  });
});

describe("parseRootSpec", () => {
  it("mounts a bare path at the top", () => {
    expect(parseRootSpec("notes")).toEqual({ prefix: "", path: "notes" });
    expect(parseRootSpec("C:\\Users\\me\\notes")).toEqual({ prefix: "", path: "C:\\Users\\me\\notes" });
  });

  it("splits on the first = only", () => {
    expect(parseRootSpec("private/notes=../notes")).toEqual({ prefix: "private/notes", path: "../notes" });
    expect(parseRootSpec("docs=C:\\x\\a=b")).toEqual({ prefix: "docs", path: "C:\\x\\a=b" });
    expect(parseRootSpec("=README.md")).toEqual({ prefix: "", path: "README.md" });
    expect(parseRootSpec("=./a=b")).toEqual({ prefix: "", path: "./a=b" });
  });

  it("normalizes the prefix to posix", () => {
    expect(parseRootSpec("private\\notes=n").prefix).toBe("private/notes");
  });

  it("rejects what cannot be a prefix", () => {
    for (const bad of [
      "../x=n",
      "a/../b=n",
      "a/./b=n",
      "/abs=n",
      "\\abs=n",
      "a//b=n",
      "a/=n",
      "a?b=n",
      "a#b=n",
      "a%b=n",
      "c:x=n",
    ]) {
      expect(() => parseRootSpec(bad), bad).toThrow(/--root/);
    }
  });

  it("rejects the names the site and the server own, whatever their case", () => {
    for (const name of ["__ask", "__reload", "assets", "Assets/x", "llms.txt", "llms-full.txt", "search-index.json", "index.html", "index.md"]) {
      expect(() => parseRootSpec(`${name}=n`), name).toThrow(/reserved/);
    }
    expect(parseRootSpec("docs/assets=n").prefix).toBe("docs/assets");
  });

  it("rejects an empty path", () => {
    expect(() => parseRootSpec("docs=")).toThrow(/path is empty/);
    expect(() => parseRootSpec("")).toThrow(/path is empty/);
  });
});

describe("parseRoots", () => {
  it("rejects a duplicated prefix, case aside", () => {
    expect(() => parseRoots(["a/b=x", "A/B=y"])).toThrow(/already used/);
    expect(() => parseRoots(["a=x", "a=y"])).toThrow(/already used/);
  });

  it("lets several roots share the top", () => {
    expect(parseRoots(["docs", "=README.md", "n=notes"]).map((root) => root.prefix)).toEqual(["", "", "n"]);
  });
});

describe("--base", () => {
  it("takes its value after an = or as the next argument", () => {
    expect(parse(["build", "--base=/standarui/"]).flags.get("base")).toBe("/standarui/");
    expect(parse(["build", "--base", "/standarui/"]).flags.get("base")).toBe("/standarui/");
    expect(() => parse(["build", "--base"])).toThrow("--base needs a value");
  });

  it("is normalized by parseBase, and absent stays absent", () => {
    expect(parseBase(undefined)).toBeUndefined();
    expect(parseBase("standarui")).toBe("/standarui/");
    expect(parseBase("/standarui")).toBe("/standarui/");
    expect(parseBase("")).toBe("/");
  });

  it("refuses a URL, a query and a fragment, naming the flag", () => {
    for (const bad of ["https://host/x/", "/x/?a=1", "/x/#top"]) {
      expect(() => parseBase(bad), bad).toThrow(/^--base: base must be a path/);
    }
  });
});
