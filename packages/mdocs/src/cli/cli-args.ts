import { normalizeBase } from "../core/base";

export interface RootSpec {
  /** Posix, no leading or trailing slash; empty mounts the root at `/`. */
  readonly prefix: string;
  /** A directory or a `.md` file, as typed. */
  readonly path: string;
}

/** Flags that take their value as the next argument as well as after an `=`. */
const VALUE_FLAGS: ReadonlySet<string> = new Set(["root", "port", "base"]);

/** `--root` may be given more than once; every other flag keeps its last value. */
const REPEATABLE: ReadonlySet<string> = new Set(["root"]);

/**
 * The first path segment of everything the build writes at the top of the site, and
 * of the two routes the dev server answers itself. A prefix that starts with one of
 * these would put pages where a file or a server route already is.
 */
const RESERVED: ReadonlySet<string> = new Set([
  "assets",
  "__ask",
  "__reload",
  "llms.txt",
  "llms-full.txt",
  "search-index.json",
  "index.html",
  "index.md",
]);

const FORBIDDEN = /[\u0000-\u001f<>:"|?*#%]/;

export function parse(argv: readonly string[]): {
  command: string;
  flags: Map<string, string>;
  repeated: Map<string, string[]>;
} {
  const [command = "", ...rest] = argv;
  const flags = new Map<string, string>();
  const repeated = new Map<string, string[]>();
  const set = (name: string, value: string): void => {
    flags.set(name, value);
    if (REPEATABLE.has(name)) repeated.set(name, [...(repeated.get(name) ?? []), value]);
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] ?? "";
    const match = /^--([^=]+)(?:=(.*))?$/.exec(argument);
    if (match?.[1] === undefined) throw new Error(`unexpected argument: ${argument}`);
    const name = match[1];
    if (match[2] === undefined && VALUE_FLAGS.has(name)) {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
      set(name, value);
      index += 1;
    } else {
      set(name, match[2] ?? "true");
    }
  }
  return { command, flags, repeated };
}

/** The `--base` flag as a normalized base path, or undefined when it was not given. */
export function parseBase(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return normalizeBase(value);
  } catch (error) {
    throw new Error(`--base: ${(error as Error).message}`);
  }
}

function normalizePrefix(raw: string, spec: string): string {
  const prefix = raw.replaceAll("\\", "/");
  if (prefix === "") return "";
  if (prefix.startsWith("/")) throw new Error(`--root ${spec}: the prefix must not start with a slash`);
  const segments = prefix.split("/");
  for (const segment of segments) {
    if (segment === "") throw new Error(`--root ${spec}: the prefix has an empty segment`);
    if (segment === "." || segment === "..") {
      throw new Error(`--root ${spec}: the prefix must not contain "${segment}"`);
    }
    if (FORBIDDEN.test(segment)) {
      throw new Error(`--root ${spec}: "${segment}" cannot be part of a route`);
    }
  }
  const first = (segments[0] ?? "").toLowerCase();
  if (RESERVED.has(first)) {
    throw new Error(`--root ${spec}: "${segments[0]}" is reserved by the site, choose another prefix`);
  }
  return segments.join("/");
}

/**
 * `<dir>` mounts at the top, `<prefix>=<path>` under `/<prefix>`, `=<path>` a file
 * at the top. The split is on the first `=` only, and a Windows path has none.
 */
export function parseRootSpec(spec: string): RootSpec {
  const at = spec.indexOf("=");
  const rawPrefix = at === -1 ? "" : spec.slice(0, at);
  const path = at === -1 ? spec : spec.slice(at + 1);
  if (path === "") throw new Error(`--root ${spec}: the path is empty`);
  return { prefix: normalizePrefix(rawPrefix, spec), path };
}

/** Every `--root`, validated together: two roots may not share a prefix, case aside. */
export function parseRoots(specs: readonly string[]): readonly RootSpec[] {
  const roots = specs.map(parseRootSpec);
  const seen = new Map<string, string>();
  for (const [index, root] of roots.entries()) {
    if (root.prefix === "") continue;
    const folded = root.prefix.toLowerCase();
    const earlier = seen.get(folded);
    if (earlier !== undefined) {
      throw new Error(
        `--root ${specs[index]}: the prefix "${root.prefix}" is already used by --root ${earlier}`,
      );
    }
    seen.set(folded, specs[index] ?? "");
  }
  return roots;
}
