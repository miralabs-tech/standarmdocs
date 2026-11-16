import type { ComponentType } from "react";

export type DemoModule = Readonly<Record<string, unknown>>;

/**
 * Demo id → the module behind it, as a dynamic import and never a static one.
 *
 * The dynamic form is what makes `Bun.build({ splitting: true })` cut one chunk
 * per demo instead of one bundle for the page; a static import would put every
 * demo on the site into the first script the reader downloads.
 *
 * The map itself is written by `mdocs`, from the fences it found — never by
 * hand, and never assembled at runtime from a directory listing, because a
 * specifier a bundler cannot see as a literal is a specifier it cannot split.
 */
export type DemoRegistry = Readonly<Record<string, () => Promise<DemoModule>>>;

/** `dialog-basic` → `DialogBasic`, the convention `scripts/api-reference.ts` already relies on. */
export function pascalCase(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * The id names the export as well as the module, so a demo needs no default and
 * no registration beyond existing at the right path.
 */
export async function loadDemo(registry: DemoRegistry, id: string): Promise<ComponentType> {
  const load = registry[id];
  if (load === undefined) throw new Error(`no demo registered as "${id}"`);
  const name = pascalCase(id);
  const exported = (await load())[name];
  if (typeof exported !== "function") throw new Error(`demo "${id}" exports no \`${name}\``);
  return exported as ComponentType;
}

export async function loadDemos(
  registry: DemoRegistry,
  ids: readonly string[],
): Promise<Readonly<Record<string, ComponentType>>> {
  const loaded = await Promise.all(
    ids.map(async (id) => [id, await loadDemo(registry, id)] as const),
  );
  return Object.fromEntries(loaded);
}
