import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Gives every relative specifier of the emitted declarations the extension node16
 * ESM resolution demands.
 *
 * The sources import each other without one, as the bundler resolves them, and tsc
 * copies the specifiers into the `.d.ts` files untouched. Under `node16` a
 * relative import needs its extension, so a consumer on that resolution would see
 * every type behind a relative import as an error. `./x` becomes `./x.js` when
 * `x.d.ts` is there and `./x/index.js` when `x/index.d.ts` is; a specifier that
 * already ends in `.js` and a bare one are left alone.
 */
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}(?:\/[^"']*)?)\2/g;

export function withExtensions(source: string, file: string, exists: (path: string) => boolean): string {
  return source.replace(SPECIFIER, (whole, lead: string, quote: string, specifier: string) => {
    if (specifier.endsWith(".js")) return whole;
    const target = resolve(dirname(file), specifier);
    if (exists(`${target}.d.ts`)) return `${lead}${quote}${specifier}.js${quote}`;
    if (exists(join(target, "index.d.ts"))) return `${lead}${quote}${specifier.replace(/\/$/, "")}/index.js${quote}`;
    return whole;
  });
}

function declarations(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) declarations(full, found);
    else if (entry.name.endsWith(".d.ts")) found.push(full);
  }
  return found;
}

if (import.meta.main) {
  const dist = join(import.meta.dirname, "..", "dist");
  let changed = 0;
  for (const file of declarations(dist, [])) {
    const before = readFileSync(file, "utf8");
    const after = withExtensions(before, file, existsSync);
    if (after !== before) {
      writeFileSync(file, after, "utf8");
      changed += 1;
    }
  }
  console.log(`${changed} declaration file(s) given their extensions`);
}
