import { describe, expect, it } from "vitest";
import { chromeState } from "../../src/cli/build";
import { labelsFor } from "../../src/index";

const ui = { search: "search.css" } as unknown as Parameters<typeof chromeState>[1];

describe("chromeState", () => {
  it("says nothing under auto, whether ui resolves or not", () => {
    expect(chromeState("auto", null)).toBeNull();
    expect(chromeState("auto", ui)).toBeNull();
  });

  it("names the missing package only under an explicit live", () => {
    expect(chromeState("live", null)).toMatch(/^Rendered with the static chrome: .+ is not installed\.$/);
    expect(chromeState("live", ui)).toBeNull();
  });

  it("says it in the labels it is given", () => {
    expect(chromeState("live", null, labelsFor("fr"))).toBe(
      "Rendu avec le chrome statique : @standardoc/ui n'est pas installé.",
    );
  });

  it("says nothing under static", () => {
    expect(chromeState("static", null)).toBeNull();
  });
});
