# standarmdocs

[![CI](https://github.com/miralabs-tech/standarmdocs/actions/workflows/ci.yml/badge.svg)](https://github.com/miralabs-tech/standarmdocs/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@standarx/mdocs)](https://www.npmjs.com/package/@standarx/mdocs) [![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE) [![bun](https://img.shields.io/badge/bun-%3E%3D1.4-black)](https://bun.sh)

> "Markdown documentation sites with live React demos, prerendered to static HTML."

[Quickstart](#-quickstart) · [Install](#-install) · [Features](#-features) · [Configuration](#-configuration-reference) · [CLI](#-cli-reference) · [Deploy](#-deploy-to-github-pages) · [Limits](#-limits) · [Changelog](./CHANGELOG.md)

---

## 🧠 What is @standarx/mdocs?

`@standarx/mdocs` turns a folder of Markdown files into a static documentation site. A page is a `.md` file; a fenced block can name a React demo, which is prerendered into the page and then hydrated on its own, so the prose and the chrome stay plain HTML and only the demo runs script.

The boundary between the static page and the interactive demo is **derived by the renderer**: the renderer places the demo, so it knows where the island is, and no author has to mark the right element. Each demo is rendered once per entry of a configurable matrix (theme, density, motion, glass), and the site is also published as plain Markdown, `llms.txt` and `llms-full.txt`.

The package holds the engine and its `mdocs` command line in one place, ESM only, with types. This repository is its home.

**Status: 0.1.0.**

---

## 🚀 Quickstart

```sh
bun add -d @standarx/mdocs react react-dom
```

A site is a folder with an `mdocs.config.ts`, some Markdown and the demos it names:

```ts
// mdocs.config.ts
import { defineConfig } from "@standarx/mdocs/config";

export default defineConfig({
  contentDir: "content",
  demosDir: "demos",
  apiDir: "api",
  siteName: "My Docs",
  categories: [{ slug: "guide", label: "Guide", blurb: "How to use it." }],
});
```

````md
<!-- content/guide/counter.md -->
---
title: Counter
description: A button that counts
---

A button that counts its own clicks.

```demo counter-basic
```
````

```tsx
// demos/counter-basic.tsx
import { useState } from "react";

export function CounterBasic() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}
```

```sh
bunx mdocs build   # the site, prerendered, in ./dist
bunx mdocs dev     # the same, rebuilt on every edit, served on http://127.0.0.1:4400
```

A page's route is its path under `contentDir` without the extension (`content/guide/counter.md` is `/guide/counter`), and a page whose parent folder is named like a category slug sits under that category in the sidebar.

---

## 📦 Install

Requirements: bun 1.4 or later (the CLI builds with `Bun.build`), TypeScript for the config and the demos, and React 19 with `react-dom`, which the site provides.

```sh
bun add -d @standarx/mdocs react react-dom
```

`react` and `react-dom` are optional peer dependencies: installing the package never adds a second copy beside the one a site already links. A site lists both in its own `dependencies`.

Entry points of the package:

| Entry | What it is |
| --- | --- |
| `@standarx/mdocs` | the engine: content scan, page model, prerenderer, islands |
| `@standarx/mdocs/config` | `defineConfig` and the `SiteConfig` type |
| `@standarx/mdocs/base` | the base path helpers |
| `@standarx/mdocs/search` | the search index contract |
| `@standarx/mdocs/sidebar` | the sidebar contract |
| `@standarx/mdocs/ask` | the `ask` block protocol |
| `@standarx/mdocs/react/hydrate`, `/react/registry` | the client half of the islands |
| `@standarx/mdocs/client/axes`, `/client/tabs`, `/client/toc` | the chrome's small client scripts |
| `@standarx/mdocs/styles/docs.css` | the default stylesheet |

---

## ✨ Features

- **Markdown pages.** Front matter (`title`, `description`, `related`, `sidebar.order`; pages with a `sidebar.order` come first in their category, ascending, then the others in file order), headings with stable anchors, tables, fenced code highlighted with Shiki, and relative `.md` links that are checked at build time.
- **Live React demos with prerender.** A ```` ```demo <id> ```` fence loads `demosDir/<id>.tsx`, prerenders it into the page and hydrates only that subtree. Each demo is rendered once per entry of the matrix, so a theme, a density or a reduced-motion variant is visible at a glance, and the reader can switch the axes from the page.
- **Props tables.** A ```` ```props <name> ```` fence renders `apiDir/<name>.json`, rows of `name`, `type` and `notes`. `apiDir` can be a folder of the site or a folder inside an installed package.
- **Index and home pages.** ```` ```index <group> ```` renders the pages of a group as cards; a folder without an `index.md` gets a front page listing every page.
- **Base path.** `base: "/docs/"` (or `--base=/docs/`) prefixes every emitted URL, for a host that serves the site below its root.
- **llms.txt.** The build writes `llms.txt` (following [llmstxt.org](https://llmstxt.org)), `llms-full.txt` and an `index.md` beside every page, written from the source Markdown rather than from the HTML.
- **Auto chrome.** The sidebar, the table of contents, the axis switcher and the See also list are rendered for you. `--chrome=auto` is the default and wires the interactive behaviours when the optional interactive package resolves, and stays static without a banner when it does not.
- **Tab strips.** `tabs: ["Keyboard", "Parts", "Props"]` folds the trailing `##` sections of a page into a tab strip.
- **A script hook.** `scripts` lists modules the generated entry bundles for their side effects, on every page.
- **GitHub anchors.** `headingSlugs: "github"` gives the anchors GitHub renders for the same Markdown.
- **`ask` fences, in `mdocs dev`.** A question for the author, answered in the browser and written back into the Markdown with `--write`. A public build never ships one.

---

## 🛠️ Configuration reference

`mdocs.config.ts` at the site's root default-exports a `SiteConfig`. Relative paths resolve against the config file.

| Field | Type | Meaning |
| --- | --- | --- |
| `contentDir` | `string` | Where the `.md` tree lives. |
| `demosDir` | `string` | Where the demo modules live, one file per ```` ```demo ```` id. |
| `apiDir` | `string` | The generated props tables. A relative path is a folder of the site; a bare specifier such as `my-lib/api` is a folder inside an installed package. |
| `outDir` | `string?` | The output folder. Default `dist`. `--out=<dir>` overrides it. |
| `base` | `string?` | The path the site is served under, such as `"/docs/"`. A leading and a trailing slash are added; a value with `://`, `?` or `#` is refused. Default `"/"`. `--base=<path>` overrides it, and `mdocs dev` ignores it. |
| `siteName` | `string?` | Appended to every page title as `<page> — <siteName>`. Left out, a page is titled by itself. |
| `categories` | `{ slug, label, blurb? }[]` | The sidebar groups, in order. A page belongs to the category whose `slug` is the name of its parent folder; a category with no page is drawn nowhere. |
| `matrix` | `Axes[]?` | Overrides the entries every `demo` fence is rendered over. An entry sets any of `theme` (`"light"` or `"dark"`), `density` (`"desktop"` or `"touch"`), `motion` (`"full"`, `"reduced"` or `"none"`) and `glass` (`"off"`); an axis left out is on auto. The default has four entries: all axes on auto, light, touch, and reduced motion with glass off. |
| `tabs` | `string[]?` | The `##` headings that end a page as a tab strip, when they end it in a run. Only the trailing run is folded. Left out, no page has tabs. |
| `headingSlugs` | `"standardoc" \| "github"?` | How headings get their ids. `standardoc` (default) is an ASCII slug with `-2`, `-3` on a repeat; `github` matches GitHub's anchors. `--slug=` overrides it. |
| `stylesheets` | `string[]?` | Package specifiers or paths, copied into the output and linked from every page, for example `"@standarx/mdocs/styles/docs.css"`. |
| `scripts` | `string[]?` | Modules the generated entry imports for their side effects, on every page. They are bundled, not copied, and an unresolvable entry fails the build. |

```ts
import { defineConfig } from "@standarx/mdocs/config";

export default defineConfig({
  contentDir: "content",
  demosDir: "demos",
  apiDir: "api",
  base: "/docs/",
  siteName: "My Docs",
  categories: [
    { slug: "guide", label: "Guide" },
    { slug: "reference", label: "Reference", blurb: "Every option." },
  ],
  matrix: [{}, { theme: "dark" }, { density: "touch" }],
  tabs: ["Keyboard", "Props"],
  headingSlugs: "github",
  stylesheets: ["@standarx/mdocs/styles/docs.css"],
  scripts: ["./client/boot.ts"],
});
```

---

## 💻 CLI reference

```text
mdocs build [--chrome=auto|live|static] [--slug=standardoc|github] [--mode=production|development] [--out=<dir>] [--base=<path>]
mdocs dev [--root [<prefix>=]<path>]... [--write] [--port <n>] [--chrome=auto|live|static] [--slug=standardoc|github]
```

| Flag | Meaning |
| --- | --- |
| `--chrome=auto` | The default: the static chrome plus the live behaviours when the optional interactive package resolves, the static chrome silently when it does not. |
| `--chrome=live` | The same, with a banner when the package does not resolve. |
| `--chrome=static` | Render the static chrome deliberately, with no banner. |
| `--slug=standardoc\|github` | Heading ids as the engine slugs them (default) or as GitHub renders them, overriding the config's `headingSlugs`. |
| `--mode=production` | The default: substitute `NODE_ENV` and minify, which is what a reader should download. |
| `--mode=development` | Ship React's development build, for a watch loop that wants its warnings. |
| `--out=<dir>` | Output folder, overriding the config's `outDir`. The build empties it, so it refuses a folder that holds the site's sources. |
| `--base=<path>` | Serve the site under `<path>`, such as `/docs/`: every emitted URL starts with it. Overrides the config's `base`. |

`mdocs dev` watches the content and `mdocs.config.ts`, runs a development-mode build on each change and serves the result on `127.0.0.1` with live reload. A failed build is shown over the last good site, which keeps being served. The output goes to a folder under the OS temp directory and is removed on exit.

| Flag | Meaning |
| --- | --- |
| `--root <dir>` | The content folder; the cwd's `mdocs.config.ts` is kept when there is one, and a folder of plain `.md` needs none. |
| `--root <prefix>=<path>` | Mount a folder, or one `.md` file, under `/<prefix>`. Repeat `--root` to read separate places as one site. `--root =README.md` mounts a file at the top. The prefix is split off at the first `=`; it may not hold `..`, start with `/`, repeat another prefix or be one of `assets`, `__ask`, `__reload`, `llms.txt`, `llms-full.txt`, `search-index.json`, `index.html`, `index.md`. |
| `--write` | Serve `POST /__ask`, which writes the answers of `ask` fences back into the Markdown files. |
| `--port <n>` | The port to listen on: default 4400, `0` for any free one. |

Two roots that claim the same route, or one inside another, are an error naming the files. A relative `.md` link is resolved from the real file it is written in, so a page can link to a page of another root. Only the cwd's `mdocs.config.ts` counts; the config of a root is ignored.

`mdocs` with no command prints the usage and exits 1; an unknown command or a bad flag value exits 2.

### What `mdocs build` writes

- `<route>/index.html` for every page, and `index.html` at the top.
- `<route>/index.md` for every page: the title, the description as a quote, then the body without its front matter. `ask` and `demo` fences are removed, `props` becomes tables and `index` becomes a list of links.
- `llms.txt`: the site name, then one `##` section per sidebar category linking each page's `index.md`.
- `llms-full.txt`: every page's Markdown in sidebar order, each behind a `Source:` line.
- `assets/`: the bundled client script, the chunks of the demos and the stylesheets.

Links are root-relative and prefixed by `base` when the site has one.

---

## 🌐 Deploy to GitHub Pages

A project site is served under the repository's name, `https://<owner>.github.io/<repository>/`, so its build needs that `base`:

```ts
// mdocs.config.ts
export default defineConfig({
  // …
  base: "/my-repo/",
});
```

1. List `react` and `react-dom` in the site's own `dependencies`. The package declares them as optional peers and never installs a copy of its own, so a site that links its library with `file:` keeps a single React.
2. Leave `--chrome` on its default, `auto`: without the interactive package the site gets the static chrome, with no banner.
3. Declare the matrix your demos need. A site without the axes of the default matrix renders each demo once with `matrix: [{}]`, or over its own entries, such as `matrix: [{}, { theme: "dark" }]`.
4. Copy [`examples/github-pages.yml`](./examples/github-pages.yml) to `.github/workflows/pages.yml`, set `working-directory` and the artifact `path` to the site's folder, and set **Settings > Pages > Source** to **GitHub Actions**.

The workflow runs on every published release and by hand (`workflow_dispatch`). It installs with `bun install --frozen-lockfile`, runs `mdocs build --base=/<repository>/`, uploads `dist` with `actions/upload-pages-artifact` and publishes it with `actions/deploy-pages`. It needs the `pages: write` and `id-token: write` permissions, which it declares. No `gh-pages` branch is involved.

---

## 🧩 Programmatic build

`@standarx/mdocs/build` runs the same build as `mdocs build` from a script:

```ts
import { build, loadConfig } from "@standarx/mdocs/build";

const config = await loadConfig(process.cwd());
await build(config, { chrome: "auto", mode: "production" });
```

`build` takes the options of the command line (`chrome`, `mode`, …) and `asks: "island"`, which renders `ask` fences as answerable islands the way `mdocs dev` does. `prepareGeneratedRoot(dir)` writes the `tsconfig.json` a build needs in a folder that has no config of its own.

---

## 🚧 Limits

- The CLI runs on bun, not on node: it builds with `Bun.build` and resolves modules with `Bun.resolveSync`.
- The package is ESM only.
- Front matter is a small YAML subset: `key: value` lines, one level of nesting (`sidebar:` then `  order: 2`) and one-line `[a, b]` lists. Block sequences are not read.
- Demos are React 19 modules. Another framework needs another renderer.
- A demo is bundled with the page's client script and split into its own chunk; a specifier the bundler cannot follow statically is not split.
- The static chrome has no search. Search and the other live behaviours come from an optional interactive package that is not part of this repository.
- `ask` fences render only in `mdocs dev`; a build drops them from the pages and from the Markdown.
- `mdocs dev` ignores `base` and serves at the root.

---

## 🛠️ Build & tests

```sh
bun install
bunx playwright install chromium   # once: the browser the island tests run in
bun run build            # packages/mdocs/dist
bun run typecheck
bun run check:boundary   # src/core imports neither React nor react-dom
bun run test             # unit tests on bun, island tests on chromium
bun run check:bundle     # builds a fixture site: no prerenderer reaches the browser
bun run check:package    # the packed tarball holds dist and nothing else
```

`MIRA_BROWSER=firefox bun run test` runs the island tests on another engine, after `bunx playwright install firefox`. Never set that variable to the empty string.

The code is split along one line: `src/core/` imports neither `react` nor `react-dom`, and `src/react/` is everything that does. `src/cli/` holds the `mdocs` command, and `src/client/` the scripts the browser downloads.

Releases are published to npm from a `v*` tag by `.github/workflows/publish.yml`: the tag must equal the package version, and the GitHub release carries that version's section of the changelog.

---

## 📜 License

[MIT](./LICENSE) - Copyright (c) 2026 Miralabs.
