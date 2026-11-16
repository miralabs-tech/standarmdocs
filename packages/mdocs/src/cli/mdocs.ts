#!/usr/bin/env bun
import { assertPublicContent, build, type BuildOptions } from "./build";
import { parse, parseBase, parseRoots } from "./cli-args";
import { loadConfig } from "./config";
import { startDev } from "./dev";

const USAGE = `mdocs build [--chrome=auto|live|static] [--slug=standardoc|github] [--mode=production|development] [--out=<dir>] [--base=<path>]
mdocs dev [--root [<prefix>=]<path>]... [--write] [--port <n>] [--chrome=auto|live|static] [--slug=standardoc|github]

  --chrome=auto    (default) the static chrome plus the live behaviours
                   when the ui package resolves, the static chrome silently when it does not
  --chrome=live    the same, with a banner when the ui package does not resolve
  --chrome=static  render the static chrome deliberately, with no banner
  --slug=standardoc
                   heading ids as the engine slugs them (default, unless the
                   config's headingSlugs says otherwise)
  --slug=github    heading ids as GitHub renders them, overriding the config's
                   headingSlugs
  --mode=production
                   (default) substitute NODE_ENV and minify — what a reader
                   should ever download
  --mode=development
                   ship React's development build, for a watch loop that wants
                   its warnings and component stacks
  --out=<dir>      output directory, overriding the config's
  --base=<path>    serve the site under <path>, such as /standarui/: every emitted
                   URL starts with it. Overrides the config's base; dev ignores it

  dev              watch the content, rebuild in development mode into the OS
                   temp folder and serve it on 127.0.0.1 with live reload
  --root <dir>     the content directory; the cwd's mdocs.config.ts is kept when
                   there is one, and a folder of plain .md needs none
  --root <prefix>=<path>
                   mount a directory, or one .md file, under /<prefix>; repeat
                   --root for several. \`--root =README.md\` mounts a file at the
                   top. The prefix is split off at the first \`=\`; it may not
                   hold \`..\`, start with \`/\`, repeat another prefix or be one of
                   assets, __ask, __reload, llms.txt, llms-full.txt,
                   search-index.json, index.html, index.md. A root's own
                   mdocs.config.ts is ignored: only the cwd's counts.
  --write          serve POST /__ask, which writes the answers of \`ask\` fences
                   back into the markdown files
  --port <n>       port to listen on (default 4400, 0 for any free one)
`;

const { command, flags, repeated } = parse(process.argv.slice(2));

if (command !== "build" && command !== "dev") {
  console.error(USAGE);
  process.exit(command === "" ? 1 : 2);
}

const chrome = flags.get("chrome") ?? "auto";
if (chrome !== "auto" && chrome !== "live" && chrome !== "static") {
  console.error(`--chrome must be "auto", "live" or "static", got "${chrome}"`);
  process.exit(2);
}

const slugFlag = flags.get("slug");
if (slugFlag !== undefined && slugFlag !== "standardoc" && slugFlag !== "github") {
  console.error(`--slug must be "standardoc" or "github", got "${slugFlag}"`);
  process.exit(2);
}
const slug: "standardoc" | "github" | undefined = slugFlag;

if (command === "dev") {
  const port = Number(flags.get("port") ?? 4400);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`--port must be an integer from 0 to 65535, got "${flags.get("port")}"`);
    process.exit(2);
  }
  const write = flags.has("write") && flags.get("write") !== "false";
  let roots: ReturnType<typeof parseRoots>;
  try {
    roots = parseRoots(repeated.get("root") ?? []);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  const server = await startDev({
    cwd: process.cwd(),
    ...(roots.length === 0 ? {} : { roots }),
    write,
    port,
    chrome,
    headingSlugs: slug,
  });
  const stop = (): void => {
    void server.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} else {
  const mode = flags.get("mode") ?? "production";
  if (mode !== "production" && mode !== "development") {
    console.error(`--mode must be "production" or "development", got "${mode}"`);
    process.exit(2);
  }

  let baseFlag: string | undefined;
  try {
    baseFlag = parseBase(flags.get("base"));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }

  const loaded = await loadConfig(process.cwd());
  const out = flags.get("out");
  const withOut = out === undefined ? loaded : { ...loaded, outDir: out };
  const withBase = baseFlag === undefined ? withOut : { ...withOut, base: baseFlag };
  const config = slug === undefined ? withBase : { ...withBase, headingSlugs: slug };
  const options: BuildOptions = { chrome, mode };

  try {
    assertPublicContent(config.contentDir);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  const pages = await build(config, options);
  console.log(`${pages} page(s) → ${config.outDir}`);
}
