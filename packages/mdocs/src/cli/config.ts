import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Axes, ChromeCategory, ContentRoot } from "../index";
import { normalizeBase } from "../core/base";
import type { Labels } from "../core/labels";
import { assertLocales } from "../core/locales";

export interface SiteConfig {
  /** Where the `.md` tree lives. Relative paths resolve against the config file. */
  readonly contentDir: string;
  readonly demosDir: string;
  /**
   * The generated props tables. A relative path is a directory in this site; a
   * bare specifier is a directory *inside an installed package*, which is the
   * arrangement worth preferring — `@standarui/react/api` is the API of the
   * exact version this site embeds, and a relative path into a neighbouring
   * checkout is the API of whatever that checkout happens to be at.
   */
  readonly apiDir: string;
  readonly outDir?: string;
  /**
   * The path the built site is served under, for a host that mounts it below the
   * root: `"/standarui/"` for `https://host/standarui/`. Every URL the build emits
   * that starts with `/` — links, stylesheets, the script, the search index, the
   * pages in `llms.txt` — then starts with it, and so does a root-absolute link
   * written by hand in the Markdown. A leading and a trailing slash are added;
   * left out, `/`. `--base=<path>` on `mdocs build` overrides it, and `mdocs dev`
   * ignores it and serves at the root.
   */
  readonly base?: string;
  /**
   * Appended to every page title as `<page> — <siteName>`. Left out, a page is
   * titled by itself: the engine documents no particular library, and the one it
   * was written against had its name compiled into `build.ts` until 2026-09-09.
   */
  readonly siteName?: string;
  readonly categories: readonly ChromeCategory[];
  /** Overrides the matrix every ```demo fence is rendered over. */
  readonly matrix?: readonly Axes[];
  /**
   * The `##` headings that end a page as a tab strip, when they end it in a run.
   *
   * `["Keyboard", "Parts", "Props"]` on a component library's site: the three
   * sections every component page finishes with, which together are a third of
   * the page and are read one at a time. Left out, no page on the site has tabs
   * — the engine documents no particular library, so it knows no section names
   * of its own.
   *
   * Only the *trailing* run is folded, and it stops at the first heading not
   * named here. The author's ordering is therefore the whole of the control:
   * a section left in the middle of the page stays in the middle of the page.
   */
  readonly tabs?: readonly string[];
  /**
   * How headings get their ids, hence the anchors of the contents and of links to
   * a section. Left out, `standardoc`: an ASCII slug, `-2`, `-3` on a repeat.
   * `github` gives the anchors GitHub renders for the same Markdown — accents kept,
   * `-1`, `-2` on a repeat, `####` included — for docs also published on GitHub.
   */
  readonly headingSlugs?: "standardoc" | "github";
  /** Package specifiers or paths, copied into the output and linked from every page. */
  readonly stylesheets?: readonly string[];
  /**
   * Modules imported for their side effects by the generated entry, on every page.
   *
   * Named beside `stylesheets` but handled nothing like it: a stylesheet is
   * *copied* into the output, while a script is *bundled* — the generated entry
   * imports it, so `Bun.build` resolves it through the `paths` of the tsconfig at
   * the cwd, substitutes `process.env.NODE_ENV` inside it, minifies it in
   * production, and shares chunks between it and the demos. Copying one instead
   * would hand the reader an unresolved bare specifier.
   *
   * This is the site's only hook into the client. It exists because the chrome is
   * the engine's and a site may need to arm a behaviour across all of it — the
   * documented case is a gamepad driving the real DOM focus through a navigation
   * the engine rendered as plain anchors. Nothing here is given the chrome's
   * markup; a script gets the document, like any other module.
   */
  readonly scripts?: readonly string[];
  readonly locales?: readonly string[];
  readonly labels?: Readonly<Record<string, Partial<Labels>>>;
}

export interface ResolvedConfig extends SiteConfig {
  readonly root: string;
  /** `SiteConfig.base`, normalized. */
  readonly base: string;
  readonly contentDir: string;
  /**
   * Every place the content comes from; `contentDir` is the first one's directory.
   * Absent, the content is `contentDir` alone, unprefixed.
   */
  readonly contentRoots?: readonly ContentRoot[];
  readonly demosDir: string;
  readonly apiDir: string;
  readonly outDir: string;
}

/** Config authoring stays typed without importing the CLI: `defineConfig({…})`. */
export function defineConfig(config: SiteConfig): SiteConfig {
  return config;
}

/**
 * `version` busts the module cache, so a watcher can read an edited config
 * without restarting the process that holds the old one.
 */
export async function loadConfig(cwd: string, version?: number): Promise<ResolvedConfig> {
  const file = resolve(cwd, "mdocs.config.ts");
  if (!existsSync(file)) throw new Error(`no mdocs.config.ts in ${cwd}`);
  const href = pathToFileURL(file).href;
  const loaded = (await import(version === undefined ? href : `${href}?v=${version}`)) as {
    default?: SiteConfig;
  };
  const config = loaded.default;
  if (config === undefined) throw new Error(`${file} has no default export`);
  if (config.locales !== undefined) assertLocales(config.locales);

  const root = dirname(file);
  const against = (path: string): string => (isAbsolute(path) ? path : resolve(root, path));
  const contentDir = against(config.contentDir);
  return {
    ...config,
    root,
    base: normalizeBase(config.base),
    contentDir,
    contentRoots: [{ dir: contentDir, prefix: "" }],
    demosDir: against(config.demosDir),
    apiDir: inPackage(config.apiDir, root) ?? against(config.apiDir),
    outDir: against(config.outDir ?? "dist"),
  };
}

/**
 * `@scope/name/sub/dir` → the absolute path of that directory in the installed
 * package, or `null` when the specifier is not one.
 *
 * Resolved through the package's own `package.json` rather than through the
 * directory itself: a directory has no export entry, and node resolution answers
 * for files. `"./package.json": "./package.json"` is the one subpath a package
 * can be relied on to expose, and the library's React package does.
 *
 * Deliberately not `node_modules/...` written by hand. Bun hoists, so the path
 * that works from one workspace is wrong from the next, and the failure is a
 * silently empty `api/` — every ```props fence rendering nothing at all.
 */
function inPackage(specifier: string, root: string): string | null {
  if (specifier.startsWith(".") || isAbsolute(specifier)) return null;
  const parts = specifier.split("/");
  const depth = specifier.startsWith("@") ? 2 : 1;
  if (parts.length <= depth) return null;
  const name = parts.slice(0, depth).join("/");
  const manifest = Bun.resolveSync(`${name}/package.json`, root);
  return resolve(dirname(manifest), ...parts.slice(depth));
}
