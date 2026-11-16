import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Lints the artefact npm would receive, not the folder it is built from.
 *
 * The tarball is packed with `bun pm pack` and then read back: it must hold the
 * manifest, the README, the licence and `dist/` and nothing else, every `exports`
 * target and the `bin` must exist in it, no file in it may name `@miralabs-ui`,
 * and `@arethetypeswrong/cli` must resolve every entry as ESM-only. The stylesheet
 * export has nothing for TypeScript to resolve and is left out of that last pass.
 *
 * `@miralabs-ui` is checked where it would reach a consumer: the built files and the
 * runtime dependency fields. The manifest's `devDependencies` and the README name it
 * on purpose.
 */
const rootDir = path.resolve(import.meta.dirname, "..");
const packageDir = path.join(rootDir, "packages", "mdocs");
const shell = process.platform === "win32";
const ALLOWED_ROOT = new Set(["package.json", "README.md", "LICENSE"]);

interface Manifest {
  name: string;
  version: string;
  bin?: Record<string, string>;
  exports?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function targets(value: unknown, found: string[]): string[] {
  if (typeof value === "string") found.push(value);
  else if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) targets(entry, found);
  }
  return found;
}

function files(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files(full, found);
    else found.push(full);
  }
  return found;
}

const manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")) as Manifest;
const failures: string[] = [];
const work = mkdtempSync(path.join(tmpdir(), "mdocs-package-"));

try {
  const packed = spawnSync("bun", ["pm", "pack", "--destination", work], {
    cwd: packageDir,
    stdio: "inherit",
    shell,
  });
  if (packed.status !== 0) throw new Error("bun pm pack failed");

  const tarballName = readdirSync(work).find((file) => file.endsWith(".tgz"));
  if (tarballName === undefined) throw new Error(`no tarball in ${work}`);
  const tarball = path.join(work, tarballName);

  const listing = spawnSync("tar", ["-tzf", tarballName], { cwd: work, encoding: "utf8", shell });
  if (listing.status !== 0) throw new Error(`${tarballName}: could not be read back`);
  const entries = listing.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "" && !entry.endsWith("/"))
    .map((entry) => entry.replace(/^package\//, ""));

  for (const required of ALLOWED_ROOT) {
    if (!entries.includes(required)) failures.push(`(a) the tarball lacks ${required}`);
  }
  if (!entries.some((entry) => entry.startsWith("dist/"))) failures.push("(a) the tarball holds no dist/");
  const stray = entries.filter((entry) => !ALLOWED_ROOT.has(entry) && !entry.startsWith("dist/"));
  if (stray.length > 0) failures.push(`(a) the tarball holds ${stray.length} file(s) beyond dist/, e.g. ${stray[0]}`);

  const wanted = [...targets(manifest.exports, []), ...Object.values(manifest.bin ?? {})];
  for (const target of wanted) {
    const entry = target.replace(/^\.\//, "");
    if (!entries.includes(entry)) failures.push(`(b) ${target} is named by package.json and absent from the tarball`);
  }

  const extracted = path.join(work, "extracted");
  mkdirSync(extracted);
  const unpacked = spawnSync("tar", ["-xzf", `../${tarballName}`], { cwd: extracted, encoding: "utf8", shell });
  if (unpacked.status !== 0) throw new Error(`${tarballName}: could not be extracted`);
  for (const file of files(path.join(extracted, "package", "dist"), [])) {
    if (readFileSync(file, "utf8").includes("@miralabs-ui")) {
      failures.push(`(c) ${path.relative(extracted, file).split(path.sep).join("/")} contains "@miralabs-ui"`);
    }
  }
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"] as const) {
    const runtime = Object.keys(manifest[field] ?? {}).filter((name) => name.startsWith("@miralabs-ui/"));
    if (runtime.length > 0) failures.push(`(c) package.json ${field} names ${runtime.join(", ")}`);
  }

  const attw = spawnSync("bunx", ["--bun", "@arethetypeswrong/cli", "--pack", tarball, "--profile", "esm-only", "--exclude-entrypoints", "./styles/docs.css"], {
    cwd: rootDir,
    stdio: "inherit",
    shell,
  });
  if (attw.status !== 0) failures.push(`(d) @arethetypeswrong/cli exited ${attw.status ?? "without a status"}`);

} catch (error) {
  failures.push((error as Error).message);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\npackage check failed for ${manifest.name}@${manifest.version}:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`\npackage check passed for ${manifest.name}@${manifest.version}`);
