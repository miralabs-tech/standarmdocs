import { describe, expect, it } from "vitest";
import { forbiddenImports } from "../scripts/check-core-boundary";

describe("core boundary", () => {
  it("flags React and @miralabs-ui imports", () => {
    const source = [
      'import { useState } from "react";',
      'import { hydrateRoot } from "react-dom/client";',
      'import { Drawer } from "@miralabs-ui/react";',
      "export { tokens } from '@miralabs-ui/styles/tokens';",
    ].join("\n");
    expect(forbiddenImports(source)).toEqual([
      "react",
      "react-dom",
      "@miralabs-ui/react",
      "@miralabs-ui/styles",
    ]);
  });

  it("lets other packages through", () => {
    const source = [
      'import MarkdownIt from "markdown-it";',
      'import { nav } from "@standarx/nav";',
      'import { reactive } from "./reactive";',
    ].join("\n");
    expect(forbiddenImports(source)).toEqual([]);
  });

  it("lets src/react use React and rejects @miralabs-ui", () => {
    const source = [
      'import { useState } from "react";',
      'import { flushSync } from "react-dom";',
      'import { DialogRoot } from "@miralabs-ui/react/dialog";',
      "export { tokens } from '@miralabs-ui/styles/tokens';",
    ].join("\n");
    expect(forbiddenImports(source, "react")).toEqual(["@miralabs-ui/react", "@miralabs-ui/styles"]);
    expect(forbiddenImports('import { useState } from "react";', "react")).toEqual([]);
  });
});
