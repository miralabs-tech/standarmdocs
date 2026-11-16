import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Built once for the whole unit project: two test files building the same site in
// parallel workers empty each other's `dist` and rewrite each other's `.mdocs`.
export default function setup(): void {
  const site = fileURLToPath(new URL("../fixtures/site", import.meta.url));
  const cli = fileURLToPath(new URL("../../src/cli/mdocs.ts", import.meta.url));
  execFileSync("bun", [cli, "build", "--chrome=static"], { cwd: site, stdio: "pipe" });
}
