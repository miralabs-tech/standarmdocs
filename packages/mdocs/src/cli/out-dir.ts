import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { parse, resolve, sep } from "node:path";

/** Written into every output directory, so the next build knows the directory is its own to empty. */
export const OUT_MARKER = ".mdocs-build";

export interface OutDirGuard {
  readonly outDir: string;
  /** Directories that must never be emptied, nor be inside the output. */
  readonly protect: readonly string[];
}

function normalize(path: string): string {
  const full = resolve(path);
  return process.platform === "win32" ? full.toLowerCase() : full;
}

function contains(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/**
 * Empties the output directory, or refuses to.
 *
 * The build removes the whole directory, and `--out` comes straight from the
 * command line: `--out=.` would otherwise delete the site's sources. So the
 * directory may not hold anything the build reads, may not be a drive root or
 * the home folder, and is emptied only when it is empty already or carries the
 * marker a previous build left in it.
 */
export function prepareOutDir({ outDir, protect }: OutDirGuard): void {
  const out = normalize(outDir);
  if (parse(out).root.toLowerCase() === out.toLowerCase()) {
    throw new Error(`refusing to build into ${outDir}: it is the root of a drive`);
  }
  for (const path of [...protect, homedir()]) {
    if (contains(out, normalize(path))) {
      throw new Error(`refusing to build into ${outDir}: it contains ${path}, which the build must not delete`);
    }
  }

  if (existsSync(outDir)) {
    if (!statSync(outDir).isDirectory()) {
      throw new Error(`refusing to build into ${outDir}: it is a file, not a directory`);
    }
    const entries = readdirSync(outDir);
    if (entries.length > 0 && !entries.includes(OUT_MARKER)) {
      throw new Error(
        `refusing to empty ${outDir}: it was not written by mdocs (no ${OUT_MARKER} inside). Delete it yourself or choose another --out.`,
      );
    }
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, OUT_MARKER), "");
}
