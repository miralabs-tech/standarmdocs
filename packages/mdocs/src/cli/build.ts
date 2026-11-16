import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type ApiTable,
  type ApiTables,
  axisBootScript,
  type ChromeEntry,
  createHighlight,
  type DemoRegistry,
  demoIds,
  type Highlight,
  llmsFull,
  llmsTxt,
  normalizeBase,
  type PageModel,
  pageMarkdown,
  placeEntries,
  PRIVATE_DIR,
  renderPage,
  resolveRelated,
  scanContent,
  SEARCH_INDEX_FILE,
  searchIndex,
  shell,
  withBase,
  withoutAsks,
} from "../index";
import type { ResolvedConfig } from "./config";
import { generate } from "./generate";
import { prepareOutDir } from "./out-dir";

export interface BuildOptions {
  /**
   * `auto` wires @standardoc/ui when it resolves and is silently static otherwise;
   * `live` asks for it and says so when it is missing; `static` never reaches for it.
   */
  readonly chrome: "auto" | "static" | "live";
  /**
   * What the reader downloads.
   *
   * `production` is the default and the only mode a shipped site should be built
   * in. `development` exists for a watch loop: React's development build is the
   * one with the warnings and the component stacks, and it is worth having while
   * a demo is being written.
   *
   * This is not a preference. React and react-dom branch on
   * `process.env.NODE_ENV` inside their `exports` map, so a bundler that
   * substitutes nothing resolves the development side and the site ships every
   * warning path, an `Object.freeze` over every props object and the scheduler's
   * unminified source. It fails no build and prints no warning; the only symptom
   * is a payload nobody was measuring.
   */
  readonly mode: "production" | "development";
  /**
   * What becomes of the `ask` fences.
   *
   * `drop` is the default and the only value a public build uses: a question is
   * for the author, so no segment of it reaches the HTML, tab panels included.
   * `static` keeps the read-only block. `island` is what `mdocs dev` sets: the
   * block carries its `file` and `hash`, the client entry imports the UI package
   * and a reader can answer in the page. It needs a chrome other than `static` and a
   * `@standardoc/ui` that resolves; without either the static block stays,
   * silently, like the rest of the live chrome.
   */
  readonly asks?: "drop" | "static" | "island";
  /** A highlighter the caller owns and disposes. Absent, the build makes its own and disposes it. */
  readonly highlight?: Highlight;
}

/**
 * Refuses a content directory that sits inside a `.miralabs` folder.
 *
 * That folder holds private notes and nothing in it is meant to be published.
 * Checked on the path as given and on the one it resolves to, so a link out of a
 * `.miralabs` does not get past. Only `mdocs build` asks for it: `mdocs dev` reads
 * such a folder on purpose and ships nothing.
 */
export function assertPublicContent(contentDir: string): void {
  const paths = [contentDir, existsSync(contentDir) ? realpathSync(contentDir) : contentDir];
  if (paths.some((path) => path.split(/[\\/]/).includes(PRIVATE_DIR))) {
    throw new Error(
      `refusing to build ${contentDir}: it is inside a ${PRIVATE_DIR} folder, which holds private notes. Use \`mdocs dev --root\` to read it.`,
    );
  }
}

function loadApi(apiDir: string): ApiTables {
  if (!existsSync(apiDir)) return {};
  const tables: Record<string, readonly ApiTable[]> = {};
  for (const file of readdirSync(apiDir)) {
    if (!file.endsWith(".json")) continue;
    const parsed = JSON.parse(readFileSync(join(apiDir, file), "utf8")) as readonly ApiTable[];
    tables[basename(file, ".json")] = parsed;
  }
  return tables;
}

/**
 * What the banner says, or null when there is nothing to say.
 *
 * Only an explicit `--chrome=live` without @standardoc/ui gets a banner: the
 * default `auto` falls back to the static chrome silently, so a site built from
 * the public package, where ui never resolves, carries no banner.
 */
export function chromeState(
  chrome: BuildOptions["chrome"],
  ui: UiPackage | null,
): string | null {
  if (chrome === "live" && ui === null) {
    return "Rendered with the static chrome: @standardoc/ui is not installed.";
  }
  return null;
}

const DEMO_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

/**
 * Every demo's own file, coloured, keyed by the id the fence wrote.
 *
 * Read from disk here rather than bundled in, and that is the point: the listing
 * under a demo has to *be* the demo. The Astro site got this from Vite's `?raw`
 * and it is the one property worth carrying across — a fenced block written by
 * hand beside an import of the same component diverges at the first refactor,
 * silently, and a documentation site whose code samples are wrong is worse than
 * one with none.
 *
 * A missing file is not an error here: the same id is about to be handed to
 * `Bun.build` as a literal specifier, which is where a demo that does not exist
 * is reported, with the resolver's own message.
 */
function loadSources(
  demosDir: string,
  ids: readonly string[],
  highlight: (code: string, lang: string) => string,
): Readonly<Record<string, string>> {
  const sources: Record<string, string> = {};
  for (const id of ids) {
    for (const extension of DEMO_EXTENSIONS) {
      const file = join(demosDir, `${id}${extension}`);
      if (!existsSync(file)) continue;
      const lang = extension.slice(1);
      const coloured = highlight(readFileSync(file, "utf8").trimEnd(), lang);
      if (coloured !== "") sources[id] = coloured;
      break;
    }
  }
  return sources;
}

interface UiPackage {
  /** The UI package's entry, which exports `wireNavDrawer`, `wireSearch` and `hydrateAsks`. */
  readonly entry: string;
  /** The library's sheet, which the drawer needs, when the package declares one. */
  readonly library?: string | undefined;
  /** The ask blocks' sheet, needed only when the questions are islands. */
  readonly ask: string;
  /** The search palette's sheet, which the palette needs on every page. */
  readonly search: string;
}

function manifestName(manifest: string): unknown {
  try {
    return (JSON.parse(readFileSync(manifest, "utf8")) as { name?: unknown }).name;
  } catch {
    return undefined;
  }
}

/**
 * The directory of the package called `name` that holds `file`: the nearest
 * `package.json` above it whose name is that one.
 */
function packageDir(file: string, name: string): string | null {
  let dir = dirname(file);
  for (;;) {
    if (manifestName(join(dir, "package.json")) === name) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The library sheet a package declares it needs, resolved from that package, or
 * undefined when it declares none.
 *
 * The package says so in its own manifest, `"mdocs": { "library": "<specifier>" }`,
 * so this engine never names the design system it is dressed with: the package that
 * depends on it is the one that knows where its sheet is.
 */
function declaredLibrary(file: string, name: string): string | undefined {
  const dir = packageDir(file, name);
  if (dir === null) return undefined;
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    mdocs?: { library?: unknown };
  };
  const specifier = manifest.mdocs?.library;
  return typeof specifier === "string" ? Bun.resolveSync(specifier, dir) : undefined;
}

/**
 * `@standardoc/ui` as the site sees it, or null when it cannot be resolved.
 *
 * Looked up from the site's root and then from the cwd, because a folder of plain
 * `.md` is built from a made-up root under the temp folder where no
 * `node_modules` reaches. The kit and this CLI never name the package as a
 * dependency: it is private, and the site that wants the island installs it.
 */
function resolveUi(root: string): UiPackage | null {
  for (const from of [root, process.cwd()]) {
    try {
      const entry = Bun.resolveSync("@standardoc/ui", from);
      const here = dirname(entry);
      return {
        entry,
        library: declaredLibrary(entry, "@standardoc/ui"),
        ask: join(here, "styles", "ask.css"),
        search: join(here, "styles", "search.css"),
      };
    } catch {
      continue;
    }
  }
  return null;
}

interface ThemePackage {
  /** The theme's sheet, which maps the kit's `--docs-*` tokens onto the library's. */
  readonly theme: string;
  /** The library's sheet, when the theme package declares one. */
  readonly library?: string | undefined;
}

/**
 * `@standardoc/theme` as the site sees it, or null when it cannot be resolved.
 *
 * Looked up like `resolveUi`: from the site's root and then from the cwd. The
 * package is private and nothing here depends on it; a build that finds it links
 * the library's sheet before the site's own and the theme after them, one that
 * does not leaves the site's sheets as they are.
 */
function resolveTheme(root: string): ThemePackage | null {
  for (const from of [root, process.cwd()]) {
    try {
      const theme = Bun.resolveSync("@standardoc/theme/theme.css", from);
      return {
        theme,
        library: declaredLibrary(theme, "@standardoc/theme"),
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The order is the cascade: `before`, then the config's sheets, then `after`.
 * A sheet whose name was already copied is skipped wherever it comes from, so a
 * config that lists the library or the theme itself is left as it wrote it.
 */
function copyStylesheets(
  config: ResolvedConfig,
  base: string,
  before: readonly string[],
  after: readonly string[],
): readonly string[] {
  const hrefs: string[] = [];
  const copied = new Set<string>();
  // Keyed by name, not path: two installs of one sheet land on the same
  // `/assets/` file, and the second would only add a duplicate link.
  const copy = (source: string): void => {
    const name = basename(source);
    if (copied.has(name)) return;
    copied.add(name);
    mkdirSync(join(config.outDir, "assets"), { recursive: true });
    copyFileSync(source, join(config.outDir, "assets", name));
    hrefs.push(withBase(base, `/assets/${name}`));
  };
  for (const source of before) copy(source);
  for (const specifier of config.stylesheets ?? []) {
    try {
      copy(
        specifier.startsWith(".")
          ? join(config.root, specifier)
          : Bun.resolveSync(specifier, config.root),
      );
    } catch {
      console.warn(`stylesheet not resolved, skipped: ${specifier}`);
    }
  }
  for (const source of after) copy(source);
  return hrefs;
}

export async function build(config: ResolvedConfig, options: BuildOptions): Promise<number> {
  if (options.highlight !== undefined) return buildWith(config, options, options.highlight);
  const own = await createHighlight();
  try {
    return await buildWith(config, options, own);
  } finally {
    own.dispose();
  }
}

async function buildWith(
  config: ResolvedConfig,
  options: BuildOptions,
  highlight: Highlight,
): Promise<number> {
  // Removed rather than overwritten: `Bun.build` does not clean, and a stale
  // chunk from a previous shape of the registry would let a chunk-count
  // assertion pass on evidence that is no longer true.
  prepareOutDir({
    outDir: config.outDir,
    protect: [
      config.root,
      config.contentDir,
      ...(config.contentRoots ?? []).map((root) => root.dir),
      config.demosDir,
      config.apiDir,
      process.cwd(),
    ],
  });

  const base = normalizeBase(config.base);
  const asks = options.asks ?? "drop";
  const ui = options.chrome === "static" ? null : resolveUi(config.root);
  const asksLive = ui !== null && asks === "island";

  const scanned = scanContent({
    ...(config.contentRoots === undefined
      ? { contentDir: config.contentDir }
      : { roots: config.contentRoots }),
    matrix: config.matrix,
    highlight,
    tabs: config.tabs,
    headingSlugs: config.headingSlugs,
    base,
    askPositions: asksLive,
    links: options.mode === "development" ? "warn" : "error",
  });
  const related = resolveRelated(scanned, options.mode === "development" ? "warn" : "error");
  const pages = asks === "drop" ? related.map(withoutAsks) : related;
  if (pages.length === 0) throw new Error(`no .md pages under ${config.contentDir}`);

  const ids = [...new Set(pages.flatMap((page) => demoIds(page)))];
  const generated = generate(config.root, config.demosDir, ids, config.scripts ?? [], {
    ...(ui === null ? {} : { ui: ui.entry }),
    asks: asksLive,
  });
  const sources = loadSources(config.demosDir, ids, highlight);

  const built = await Bun.build({
    // Bun throws a bare "Bundle failed" by default; the logs below say why.
    throw: false,
    entrypoints: [generated.entry],
    outdir: config.outDir,
    target: "browser",
    format: "esm",
    // The whole point: one chunk per dynamically imported demo, so a reader
    // downloads the demos on the page and not the demos on the site.
    splitting: true,
    // The substitution has to be the literal, quotes included: it is a source
    // replacement, not an environment variable, so `"production"` is what has to
    // appear where `process.env.NODE_ENV` stood. Passing `production` bare would
    // splice an undefined identifier into every branch that reads it.
    define: { "process.env.NODE_ENV": JSON.stringify(options.mode) },
    // Only in production, and only because it costs time a watch loop feels.
    // `define` is what removes the development build; this removes what is left.
    minify: options.mode === "production",
    naming: {
      entry: "assets/[name]-[hash].[ext]",
      chunk: "assets/[name]-[hash].[ext]",
      asset: "assets/[name]-[hash].[ext]",
    },
  });

  if (!built.success) {
    const detail = built.logs.map((log) => String(log)).join("\n");
    throw new Error(`the client bundle failed to build\n${detail}`);
  }
  const entry = built.outputs.find((output) => output.kind === "entry-point");
  if (entry === undefined) throw new Error("Bun.build produced no entry point");
  const script = withBase(base, `/${relative(config.outDir, entry.path).split(sep).join("/")}`);

  const registry = (await import(pathToFileURL(generated.registry).href)) as {
    readonly DEMOS: DemoRegistry;
  };
  const api = loadApi(config.apiDir);
  const theme = resolveTheme(config.root);
  const library = ui?.library ?? theme?.library;
  const stylesheets = copyStylesheets(
    config,
    base,
    library === undefined ? [] : [library],
    [
      ...(ui === null ? [] : [ui.search]),
      ...(asksLive && ui !== null ? [ui.ask] : []),
      ...(theme === null ? [] : [theme.theme]),
    ],
  );
  const degraded = chromeState(options.chrome, ui);
  const entries: readonly ChromeEntry[] = pages.map((page) => ({
    route: page.route,
    title: page.title,
    group: page.group,
    description: page.description,
    order: page.order,
  }));

  // Once, before anything is written: a group with no category is a config that
  // is missing an entry, and every page of that group would render with a sidebar
  // that does not list it. Called here as well as from the chrome so the build
  // fails before it has emitted forty pages that are each individually wrong.
  const placement = placeEntries(config.categories, entries);
  const files = new Map(
    pages.flatMap((page): [string, string][] =>
      page.origin === undefined
        ? []
        : [
            [posixPath(page.origin.path), page.route],
            [posixPath(realpathOf(page.origin.path)), page.route],
          ],
    ),
  );

  const head = `<script>${axisBootScript()}</script>`;
  const markdown = new Map<string, string>();

  for (const page of pages) {
    const body = await renderPage({
      model: page,
      chrome: {
        categories: config.categories,
        entries,
        current: page.route,
        degraded,
        base,
        ...(config.siteName === undefined ? {} : { siteName: config.siteName }),
      },
      registry: registry.DEMOS,
      api,
      sources,
    });
    const html = shell(body, {
      title: config.siteName === undefined ? page.title : `${page.title} — ${config.siteName}`,
      description: page.description,
      script,
      stylesheets,
      head,
      base,
    });
    const file = join(config.outDir, page.route.replace(/^\//, ""), "index.html");
    mkdirSync(dirname(file), { recursive: true });
    await Bun.write(file, html);

    const text = pageMarkdown(
      readSource(config, page),
      page.origin === undefined ? page : { ...page, file: posixPath(realpathOf(page.origin.path)) },
      { api, entries, files, base },
    );
    markdown.set(page.route, text);
    await Bun.write(join(dirname(file), "index.md"), text);
  }

  const site = { name: config.siteName ?? "Documentation", base };
  if (!pages.some((page) => page.route === "/")) {
    const home: PageModel = {
      route: "/",
      title: site.name,
      description: undefined,
      group: undefined,
      segments: [{ kind: "home" }],
      toc: [],
      related: [],
    };
    const body = await renderPage({
      model: home,
      chrome: {
        categories: config.categories,
        entries,
        current: "/",
        degraded,
        base,
        ...(config.siteName === undefined ? {} : { siteName: config.siteName }),
      },
      registry: registry.DEMOS,
      api,
      sources,
    });
    await Bun.write(
      join(config.outDir, "index.html"),
      shell(body, { title: site.name, description: undefined, script, stylesheets, head, base }),
    );
  }
  await Bun.write(join(config.outDir, "llms.txt"), llmsTxt(site, placement));
  await Bun.write(join(config.outDir, "llms-full.txt"), llmsFull(placement, markdown, base));
  if (ui !== null) {
    await Bun.write(join(config.outDir, SEARCH_INDEX_FILE), JSON.stringify(searchIndex(pages, { api })));
  }

  return pages.length;
}

function posixPath(path: string): string {
  return path.split(sep).join("/");
}

function realpathOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function readSource(config: ResolvedConfig, page: PageModel): string {
  if (page.origin !== undefined) return readFileSync(page.origin.path, "utf8");
  if (page.file === undefined) throw new Error(`${page.route} has no source file`);
  return readFileSync(join(config.contentDir, page.file), "utf8");
}
