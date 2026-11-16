import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { axisControlsFor, MIRALABS_MATRIX } from "../src/core/axes";
import { LABELS, labelsFor, localeName } from "../src/core/labels";
import { assertLocales, localeRoute } from "../src/core/locales";
import { SEARCH_INDEX_FILE, searchIndexFile } from "../src/core/search";
import { redirectPage, shell } from "../src/core/shell";
import { StaticChrome } from "../src/react/chrome";
import { LabelsContext } from "../src/react/labels-context";
import { PropsTable } from "../src/react/fences/props-table";
import { SeeAlso } from "../src/react/fences/see-also";

describe("labelsFor", () => {
  it("reads the dictionary of the locale", () => {
    expect(labelsFor("fr")).toEqual(LABELS.fr);
    expect(labelsFor("en").onThisPage).toBe("On this page");
    expect(labelsFor("fr").onThisPage).toBe("Sur cette page");
  });

  it("falls back to English for a locale it has no dictionary for", () => {
    expect(labelsFor("de")).toEqual(LABELS.en);
    expect(labelsFor("constructor")).toEqual(LABELS.en);
  });

  it("reads the dictionary of the language of a regional locale", () => {
    expect(labelsFor("fr-CA").seeAlso).toBe("Voir aussi");
  });

  it("puts the overrides on top", () => {
    const labels = labelsFor("fr", { seeAlso: "À lire aussi" });
    expect(labels.seeAlso).toBe("À lire aussi");
    expect(labels.onThisPage).toBe("Sur cette page");
    expect(labelsFor("de", { localeName: "Deutsch" }).localeName).toBe("Deutsch");
  });

  it("has an entry of every label in every dictionary", () => {
    expect(Object.keys(LABELS.fr).toSorted()).toEqual(Object.keys(LABELS.en).toSorted());
    for (const value of Object.values(LABELS.fr)) expect(value).not.toBe("");
  });
});

describe("localeName", () => {
  it("is the locale's own name, then the code", () => {
    expect(localeName("en")).toBe("English");
    expect(localeName("fr")).toBe("Français");
    expect(localeName("de")).toBe("de");
    expect(localeName("de", { localeName: "Deutsch" })).toBe("Deutsch");
  });
});

describe("assertLocales", () => {
  it("accepts languages with an optional region", () => {
    expect(() => assertLocales(["en", "fr", "pt-BR", "fil"])).not.toThrow();
  });

  it("refuses an empty list", () => {
    expect(() => assertLocales([])).toThrow("locales is empty");
  });

  it("refuses a code that is not a language code, naming it", () => {
    for (const bad of ["EN", "e", "english", "en_US", "en-us", "en/fr", "../en", ""]) {
      expect(() => assertLocales([bad]), bad).toThrow(`locale "${bad}"`);
    }
  });

  it("refuses a repeated locale, naming it", () => {
    expect(() => assertLocales(["en", "fr", "en"])).toThrow('locale "en" is listed twice');
  });
});

describe("localeRoute", () => {
  it("swaps the locale prefix of a route", () => {
    expect(localeRoute("/en/guide/a", "en", "fr")).toBe("/fr/guide/a");
    expect(localeRoute("/en", "en", "fr")).toBe("/fr");
  });
});

describe("searchIndexFile", () => {
  it("is the unlocalised file without a locale and one per locale with it", () => {
    expect(searchIndexFile()).toBe(SEARCH_INDEX_FILE);
    expect(searchIndexFile()).toBe("search-index.json");
    expect(searchIndexFile("fr")).toBe("search-index.fr.json");
  });
});

describe("the shell", () => {
  const options = { title: "T", description: undefined, script: "/s.js", stylesheets: [] };

  it("writes lang en by default, as it always has", () => {
    expect(shell("", options)).toContain('<html lang="en">');
    expect(shell("", options)).not.toContain("alternate");
  });

  it("writes the language and escapes the alternates", () => {
    const html = shell("", {
      ...options,
      lang: "fr",
      alternates: [{ hreflang: "en", href: '/en/a"b&c' }],
    });
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<link rel="alternate" hreflang="en" href="/en/a&quot;b&amp;c" />');
  });

  it("writes a redirect page that is a refresh, a canonical link and a plain link", () => {
    const html = redirectPage({ title: "T", lang: "fr", href: "/docs/fr/", text: "Continuer" });
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/docs/fr/" />');
    expect(html).toContain('<link rel="canonical" href="/docs/fr/" />');
    expect(html).toContain('<a href="/docs/fr/">Continuer</a>');
  });
});

describe("the axis controls", () => {
  it("keep their English text, which is the labels' English", () => {
    const [theme, density] = axisControlsFor(MIRALABS_MATRIX);
    expect(theme?.label).toBe(LABELS.en.theme);
    expect(density?.label).toBe(LABELS.en.density);
    expect(theme?.values.map((value) => value.label)).toEqual([
      LABELS.en.auto,
      LABELS.en.light,
      LABELS.en.dark,
    ]);
    expect(density?.values.map((value) => value.label)).toEqual([
      LABELS.en.auto,
      LABELS.en.desktop,
      LABELS.en.touch,
    ]);
  });
});

describe("the chrome in French", () => {
  const props = {
    categories: [],
    entries: [],
    current: "/fr",
    degraded: null,
    matrix: MIRALABS_MATRIX,
    languages: [
      { locale: "en", label: "English", href: "/en/", current: false },
      { locale: "fr", label: "Français", href: "/fr/", current: true },
    ],
  };

  function render(labels = LABELS.fr): string {
    return renderToStaticMarkup(
      createElement(LabelsContext, { value: labels }, createElement(StaticChrome, props)),
    );
  }

  it("labels the axes, the navigation and the switcher from the dictionary", () => {
    const html = render();
    for (const text of ["Thème", "Densité", "Clair", "Sombre", "Bureau", "Tactile", "Langue"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('<nav aria-label="Documentation">');
  });

  it("renders the switcher with one link per locale and marks the current one", () => {
    const html = render();
    expect(html).toContain('<a href="/en/" hrefLang="en" lang="en">English</a>');
    expect(html).toContain('<a href="/fr/" hrefLang="fr" lang="fr" aria-current="page">Français</a>');
  });

  it("renders the switcher only for several languages", () => {
    const { languages, ...bare } = props;
    const one = renderToStaticMarkup(
      createElement(StaticChrome, { ...bare, languages: languages.slice(0, 1) }),
    );
    const none = renderToStaticMarkup(createElement(StaticChrome, bare));
    expect(one).not.toContain("mira-docs__languages");
    expect(none).not.toContain("mira-docs__languages");
  });

  it("applies the overrides of the site", () => {
    expect(render(labelsFor("fr", { language: "Choisir la langue" }))).toContain(
      'aria-label="Choisir la langue"',
    );
  });

  it("defaults to English with no provider", () => {
    const { languages: _languages, ...bare } = props;
    const html = renderToStaticMarkup(createElement(StaticChrome, bare));
    expect(html).toContain('aria-label="Theme"');
    expect(html).toContain('<nav aria-label="Documentation">');
  });
});

describe("the fences in French", () => {
  function inFrench(node: ReturnType<typeof createElement>): string {
    return renderToStaticMarkup(createElement(LabelsContext, { value: LABELS.fr }, node));
  }

  it("titles the see-also list and the props table from the dictionary", () => {
    const seeAlso = inFrench(
      createElement(SeeAlso, { links: [{ route: "/fr/a", title: "A", description: undefined }] }),
    );
    expect(seeAlso).toContain("Voir aussi");
    const table = inFrench(
      createElement(PropsTable, {
        table: {
          name: "Props",
          extends: null,
          definition: null,
          rows: [{ name: "open", type: "boolean", notes: null, source: null }],
        },
      }),
    );
    expect(table).toContain(">Prop</th>");
    expect(table).toContain(">Notes</th>");
  });
});
