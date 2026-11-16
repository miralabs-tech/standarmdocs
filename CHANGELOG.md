# Changelog

All notable changes to `@standarx/mdocs` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - unreleased

- One package, `@standarx/mdocs`, replaces `@standardoc/kit` and `@standardoc/cli`: the engine, the `mdocs` binary and the `mdocs.config.ts` helper (`@standarx/mdocs/config`) ship together from `dist`, with types.
- A base path for builds served under a subfolder: `base` in the config or `--base=<path>` on `mdocs build`, and every emitted URL starts with it.
- Chrome is automatic by default: `--chrome=auto` wires the interactive behaviours when `@standardoc/ui` resolves and stays static, without a banner, when it does not.
- React and React DOM are optional peer dependencies: the site provides them.

Earlier history was published as the `@standardoc/kit` and `@standardoc/cli` alphas.
