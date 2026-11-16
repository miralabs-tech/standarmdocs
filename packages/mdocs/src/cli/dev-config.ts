import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ChromeCategory, type ContentRoot, PRIVATE_DIR } from "../index";
import type { RootSpec } from "./cli-args";
import { loadConfig, type ResolvedConfig } from "./config";

export interface DevPlan {
  /** The first root's directory, which `file` in an answer is relative to when it has no prefix. */
  readonly contentDir: string;
  /** Every root watched and answered into, in the order they were given. */
  readonly roots: readonly ContentRoot[];
  /** Where the dev builds go. Under the OS temp folder, never beside the content. */
  readonly base: string;
  /** The config file to watch, or null when the config is made up for a bare folder. */
  readonly configFile: string | null;
  /** True when there is no `mdocs.config.ts` and the build runs from a made-up root. */
  readonly generated: boolean;
  /** Re-read the config; `changed` busts the module cache. */
  load(changed: boolean): Promise<ResolvedConfig>;
}

/**
 * The groups of the pages a root holds, which is what `scanContent` calls a group.
 *
 * Mirrors the scan's own walk, skipping exactly what it skips: a group the scan
 * finds and this misses is a category-less group, and that fails the build. A
 * root mounted under a prefix puts the pages at its top in the group named by the
 * prefix's last segment, labelled with the whole prefix.
 */
function groupsUnder(root: ContentRoot): ReadonlyMap<string, string> {
  const groups = new Map<string, string>();
  const parts = root.prefix === "" ? [] : root.prefix.split("/");
  if (root.file !== undefined) {
    const parent = parts[parts.length - 2];
    if (parent !== undefined) groups.set(parent, parent);
    return groups;
  }
  const walk = (dir: string, depth: number): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name !== PRIVATE_DIR) walk(join(dir, entry.name), depth + 1);
      }
      else if (entry.name.endsWith(".md") && entry.name !== "index.md") {
        if (depth > 0) groups.set(basename(dir), basename(dir));
        else if (parts.length > 0) groups.set(parts[parts.length - 1] ?? "", root.prefix);
      }
    }
  };
  walk(root.dir, 0);
  return groups;
}

function categoriesFor(
  roots: readonly ContentRoot[],
  known: readonly ChromeCategory[],
): readonly ChromeCategory[] {
  const slugs = new Set(known.map((category) => category.slug));
  const found = new Map<string, string>();
  for (const root of roots) {
    for (const [slug, label] of groupsUnder(root)) if (!found.has(slug)) found.set(slug, label);
  }
  const added = [...found.keys()]
    .sort()
    .filter((slug) => !slugs.has(slug))
    .map((slug) => ({ slug, label: found.get(slug) ?? slug }));
  return [...known, ...added];
}

/**
 * What `mdocs dev` builds, and where.
 *
 * Without `--root` it is the cwd's config, as `mdocs build` reads it. With one,
 * the folder is the content: the cwd's config is kept when there is one, with
 * its content directory swapped; otherwise the config is made up from the folder
 * alone, so a directory of notes that has never heard of this tool can be read
 * as a site. Several roots, each a directory or one `.md` file, can be mounted
 * side by side under prefixes; only the cwd's config counts, a root's own is
 * not read.
 *
 * Nothing is ever written under a content root. The temp folder is keyed by the
 * cwd and the roots together, so two dev servers on different folders do not
 * wipe each other's output.
 */
export async function planDev(
  cwd: string,
  root: string | readonly RootSpec[] | undefined,
): Promise<DevPlan> {
  const configFile = resolve(cwd, "mdocs.config.ts");
  const hasConfig = existsSync(configFile);
  const specs: readonly RootSpec[] =
    root === undefined ? [] : typeof root === "string" ? [{ prefix: "", path: root }] : root;
  const override: readonly ContentRoot[] | undefined =
    specs.length === 0 ? undefined : specs.map((spec) => mounted(cwd, spec));

  const withContent = (config: ResolvedConfig): ResolvedConfig => {
    if (override === undefined) return config;
    if (config.locales !== undefined) {
      throw new Error("--root cannot be combined with `locales` in mdocs.config.ts: remove one of them");
    }
    return {
      ...config,
      contentDir: override[0]?.dir ?? config.contentDir,
      contentRoots: override,
      categories: categoriesFor(override, config.categories),
    };
  };

  if (hasConfig) {
    let current = withContent(await loadConfig(cwd));
    const roots = current.contentRoots ?? [{ dir: current.contentDir, prefix: "" }];
    const base = baseFor(cwd, roots);
    return {
      contentDir: current.contentDir,
      roots,
      base,
      configFile,
      generated: false,
      load: async (changed) => {
        if (changed) current = withContent(await loadConfig(cwd, Date.now()));
        return current;
      },
    };
  }

  if (override === undefined) throw new Error(`no mdocs.config.ts in ${cwd}`);
  const first = override[0] as ContentRoot;
  const base = baseFor(cwd, override);
  const work = join(base, "work");
  return {
    contentDir: first.dir,
    roots: override,
    base,
    configFile: null,
    generated: true,
    load: async () => ({
      root: work,
      base: "/",
      contentDir: first.dir,
      contentRoots: override,
      demosDir: join(work, "demos"),
      apiDir: join(work, "api"),
      outDir: join(base, "out"),
      siteName: basename((override.find((entry) => entry.file === undefined) ?? first).dir),
      categories: categoriesFor(override, []),
      stylesheets: chromeStylesheets(),
    }),
  };
}

function mounted(cwd: string, spec: RootSpec): ContentRoot {
  const path = resolve(cwd, spec.path);
  if (!existsSync(path)) throw new Error(`--root ${path} does not exist`);
  if (!statSync(path).isFile()) return { dir: path, prefix: spec.prefix };
  if (!path.endsWith(".md")) throw new Error(`--root ${path} is a file but not a .md`);
  return { dir: dirname(path), prefix: spec.prefix, file: basename(path) };
}

/**
 * The kit's sheet alone, for a folder that has no config: it paints the page with
 * its own `--docs-*` tokens and a default for each, so the page is readable
 * without the library. The library's sheet and the theme's are added by
 * the build when the theme resolves from the cwd.
 */
function chromeStylesheets(): readonly string[] {
  return [createRequire(import.meta.url).resolve("@standarx/mdocs/styles/docs.css")];
}

function baseFor(cwd: string, roots: readonly ContentRoot[]): string {
  const only = roots.length === 1 ? roots[0] : undefined;
  const input =
    only !== undefined && only.prefix === "" && only.file === undefined
      ? `${cwd}\n${only.dir}`
      : `${cwd}\n${roots.map((root) => `${root.prefix}=${join(root.dir, root.file ?? "")}`).join("\n")}`;
  const key = createHash("sha256").update(input).digest("hex").slice(0, 8);
  return join(tmpdir(), `mdocs-dev-${key}`);
}

/**
 * Makes sure the dev folder is this user's own before anything is built into it.
 *
 * Its name is derived from the content directory so that a restart finds the same
 * place, which also means another account on a shared temp folder can predict it
 * and create it first. A link, a folder owned by someone else, or one others may
 * write into is refused rather than reused.
 */
export function claimBase(base: string): void {
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const stat = lstatSync(base);
  if (!stat.isDirectory()) {
    throw new Error(`refusing to use ${base}: it is not a plain directory`);
  }
  const uid = process.getuid?.();
  if (uid !== undefined && (stat.uid !== uid || (stat.mode & 0o077) !== 0)) {
    throw new Error(`refusing to use ${base}: it is not a private directory of this user`);
  }
}

/**
 * Lets the generated client entry resolve `@standarx/mdocs` from a made-up root.
 *
 * The entry sits under the temp folder, where no `node_modules` and no tsconfig
 * of the repository reaches. Bun reads `paths` from the nearest tsconfig, so one
 * written next to the entry and pointing at the kit this CLI itself resolved is
 * the whole fix — no copy, no link.
 */
export function prepareGeneratedRoot(root: string): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const entry = Bun.resolveSync("@standarx/mdocs", here);
  const src = dirname(entry);
  mkdirSync(root, { recursive: true });
  const forward = src.replaceAll("\\", "/");
  const paths = {
    "@standarx/mdocs": [entry.replaceAll("\\", "/")],
    "@standarx/mdocs/*": [`${forward}/*`],
  };
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { baseUrl: ".", paths } }, null, 2),
    "utf8",
  );
}
