import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The wall between the halves of the package, and the reason it can be moved
 * later without a rewrite.
 *
 * `@standardoc/core` and `@standardoc/react` are declared in the root README and
 * not built yet. What makes extracting them cheap is that the line already
 * exists: `src/core` may not import React, nor `@miralabs-ui`, whose packages
 * pull React and a design system in behind them. Left unchecked, one convenient import
 * turns a `git mv` into a rewrite, and nobody notices until the day it costs.
 *
 * A script rather than a test case, because it has to run from the first commit,
 * before this repository has a test runner.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const CORE = /^\s*(?:import|export)[\s\S]*?from\s+["'](react|react-dom|@miralabs-ui\/[^/"']+)(?:\/[^"']*)?["']/gm;
const REACT = /^\s*(?:import|export)[\s\S]*?from\s+["'](@miralabs-ui\/[^/"']+)(?:\/[^"']*)?["']/gm;

export type Scope = "core" | "react" | "cli";

const PATTERNS: Record<Scope, RegExp> = { core: CORE, react: REACT, cli: REACT };

export function forbiddenImports(source: string, scope: Scope = "core"): string[] {
  return [...source.matchAll(PATTERNS[scope])].flatMap((match) => (match[1] ? [match[1]] : []));
}

function walk(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

function walkAll(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkAll(full, found);
    else found.push(full);
  }
  return found;
}

function main(): void {
  const failures: string[] = [];
  const rules: readonly [Scope, string][] = [
    ["core", "src/core must not import React or @miralabs-ui — it is what @standardoc/core will be:"],
    ["react", "src/react must not import @miralabs-ui — the library lives in @standardoc/ui:"],
    ["cli", "src/cli must not import @miralabs-ui — a site that wants it installs it:"],
  ];
  for (const [scope, message] of rules) {
    const root = join(src, scope);
    const offenders: string[] = [];
    for (const file of walk(root, [])) {
      for (const name of forbiddenImports(readFileSync(file, "utf8"), scope)) {
        offenders.push(`${relative(root, file).split(sep).join("/")} imports "${name}"`);
      }
    }
    if (offenders.length > 0) {
      failures.push(message, ...offenders.map((offender) => `  ${scope}/${offender}`));
    }
  }

  const named = walkAll(src, []).filter((file) => readFileSync(file, "utf8").includes("@miralabs-ui"));
  if (named.length > 0) {
    failures.push(
      "src must not contain the string @miralabs-ui — a package that needs the library declares it in its own manifest:",
      ...named.map((file) => `  ${relative(src, file).split(sep).join("/")}`),
    );
  }

  if (failures.length > 0) {
    for (const line of failures) console.error(line);
    process.exit(1);
  }

  console.log("src/core imports neither React nor @miralabs-ui; src/react and src/cli import no @miralabs-ui; no file under src names it.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
