/**
 * Every tracked text file must be valid UTF-8.
 *
 * Three em dashes saved as Windows-1252 (byte 0x97) made Vite's dependency scan
 * reject `model.ts` and `page.tsx`. The scan then skipped pre-bundling, and on a
 * cold cache the browser tests discovered a library import mid-run, reloaded
 * against a second React and failed twelve tests in `islands.browser` — a stack
 * that pointed at hooks, nowhere near the byte. Nothing else reports it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const decoder = new TextDecoder("utf-8", { fatal: true });

test("every tracked source file is valid UTF-8", () => {
  const files = execFileSync(
    "git",
    ["ls-files", "--", "*.ts", "*.tsx", "*.css", "*.md", "*.json"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  expect(files.length).toBeGreaterThan(0);

  const invalid = files.filter((file) => {
    try {
      decoder.decode(readFileSync(path.join(root, file)));
      return false;
    } catch {
      return true;
    }
  });
  expect(invalid).toEqual([]);
});
