import { describe, expect, it } from "vitest";
import { withExtensions } from "../scripts/fix-dts";

const present = new Set(["/d/cli/config.d.ts", "/d/index.d.ts", "/d/core/content/index.d.ts"]);
const exists = (path: string): boolean => present.has(path.replaceAll("\\", "/").replace(/^[A-Za-z]:/, ""));

describe("withExtensions", () => {
  it("adds .js to a file and /index.js to a folder, in every import form", () => {
    const source = [
      'import type { A } from "./config";',
      'export * from "../index";',
      'type B = import("../core/content").B;',
      'import "./config";',
    ].join("\n");
    expect(withExtensions(source, "/d/cli/build.d.ts", exists)).toBe(
      [
        'import type { A } from "./config.js";',
        'export * from "../index.js";',
        'type B = import("../core/content/index.js").B;',
        'import "./config.js";',
      ].join("\n"),
    );
  });

  it("leaves a .js specifier, a bare one and an unknown file alone", () => {
    const source = 'import a from "./config.js";\nimport b from "markdown-it";\nimport c from "./missing";';
    expect(withExtensions(source, "/d/cli/build.d.ts", exists)).toBe(source);
  });
});
