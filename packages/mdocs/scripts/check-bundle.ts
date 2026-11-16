import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What must not reach a reader's browser, asserted against the real chunks.
 *
 * Prerendering and hydrating in the same page makes React see two renderers on
 * the library's context objects and warn, 48 times. The browser suite is allowed
 * to discount that warning only because it cannot happen in the built site —
 * which is a claim about the bundle, and therefore has to be checked against the
 * bundle rather than reasoned about.
 *
 * It regressed once already, on this repository's first build: the generated
 * client entry imported the kit's barrel, the barrel re-exports `renderPage`,
 * and `react-dom/static` followed it into the entry chunk. Nothing else noticed.
 *
 * The second claim is the same shape one resolution condition further out. React
 * and react-dom branch on `process.env.NODE_ENV` inside their `exports`, so a
 * `Bun.build` that substitutes nothing takes the development side and the site
 * ships every warning path, an `Object.freeze` over every props object, and the
 * scheduler's unminified source. That is exactly what happened until 2026-09-10:
 * this fixture went out at 1 071 947 B of JavaScript and came back at 227 084 B
 * once `define` was passed. No build failed, nothing warned, and the whole
 * difference lived in a number no gate was printing — which is why the number is
 * printed below now.
 */
// Every site, not the first one: the claim is about what any reader downloads,
// and a check that covers one build is a check the next site is exempt from.
const outdirs = process.argv.slice(2);
if (outdirs.length === 0) outdirs.push(join(process.cwd(), "dist"));

const PRERENDERER = ["prerenderToNodeStream", "react-dom/static", "resumeAndPrerender"];
const DEVELOPMENT = ["react-dom.development", "react.development", "scheduler.development"];
const SERVER_ONLY = ["node:crypto", "markdown-it"];
const failures: string[] = [];
let payload = 0;

for (const outdir of outdirs) {
  const assets = join(outdir, "assets");
  if (!existsSync(assets)) {
    console.error(`no assets in ${outdir} — run the build first`);
    process.exit(1);
  }

  for (const file of readdirSync(assets)) {
    if (!file.endsWith(".js")) continue;
    const source = readFileSync(join(assets, file), "utf8");
    payload += source.length;
    for (const needle of [...PRERENDERER, ...DEVELOPMENT, ...SERVER_ONLY]) {
      if (source.includes(needle)) failures.push(`${outdir}/assets/${file} contains "${needle}"`);
    }
  }
}

if (failures.length > 0) {
  console.error("the client bundle ships something no reader should download:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `no prerenderer and no development build in the client bundle of ${outdirs.length} site(s) ` +
    `— ${(payload / 1024).toFixed(0)} kB of JavaScript.`,
);
