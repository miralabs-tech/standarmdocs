# Changelog

All notable changes to `@standarx/mdocs` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

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
