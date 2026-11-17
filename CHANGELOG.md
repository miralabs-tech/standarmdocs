# Changelog

All notable changes to `@standarx/mdocs` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0]

- Categories follow the locale: `labels` and `blurbs` on a `categories` entry map a locale to its label and blurb, and `label` and `blurb` stay the fallback. The sidebar, the home, the placement and `llms.txt` of each locale use them.
- The generated Markdown follows the page's locale: the `## See also` heading and the props table headings (`Name`, `Type`, `Notes`) come from the locale's dictionary. `PageMarkdownContext` gains `labels` and `apiTableMarkdown` takes the labels as a second argument; both default to English.
- The static-chrome banner of `--chrome=live` is in the locale's language (new `Labels` entries `propsName` and `staticChrome`), and `chromeState` takes the labels as a third argument.
- Locales: `locales: ["en", "fr"]` in the config builds one site per language from `contentDir/<locale>/`, served under `/<locale>/`. The root redirects to the first locale, `<html lang>` follows the page, a language switcher links the same page in the other locales (the locale's home when it has no such page) and each translated page carries `hreflang` alternates. `llms.txt`, `llms-full.txt` and, when the interactive package resolves, `search-index.<locale>.json` are written per locale; the top-level files are the first locale's. `mdocs dev` reads `locales` too and refuses `--root` together with it.
- `labels` in the config overrides the chrome's strings per locale; the package ships the English and French dictionaries (`LABELS`, `labelsFor`).
- New exports: `searchIndexFile`, `redirectPage`, `labelsFor`, `LABELS`, `assertLocales`, `localeRoute`, `localeName`, `LabelsContext`; `ShellOptions` gains `lang` and `alternates`, `ChromeProps` gains `languages`, `PageProps` and `RenderPageOptions` gain `labels`.

## [0.3.0]

- Pages are ordered inside a category by front matter `sidebar.order`.
- Breaking: the default matrix is one render per demo (`[{}]`). A site that relied on the four MiraLabs variants declares `matrix: MIRALABS_MATRIX` (exported from `@standarx/mdocs`).
- The axis switcher shows Theme, and Density only when the site's matrix sets it.

## [0.2.0]

- `@standarx/mdocs/build`: the programmatic API behind `mdocs build`, for scripts and tests that build a site in-process: `loadConfig(cwd)`, `build(config, options)` (the same options as the CLI, plus `asks: "island"`, which only `mdocs dev` sets from the command line) and `prepareGeneratedRoot(dir)` for a site with no config of its own.

## [0.1.0]

- One package, `@standarx/mdocs`, replaces `@standardoc/kit` and `@standardoc/cli`: the engine, the `mdocs` binary and the `mdocs.config.ts` helper (`@standarx/mdocs/config`) ship together from `dist`, with types.
- A base path for builds served under a subfolder: `base` in the config or `--base=<path>` on `mdocs build`, and every emitted URL starts with it.
- Chrome is automatic by default: `--chrome=auto` wires the interactive behaviours when `@standardoc/ui` resolves and stays static, without a banner, when it does not.
- React and React DOM are optional peer dependencies: the site provides them.

Earlier history was published as the `@standardoc/kit` and `@standardoc/cli` alphas.
