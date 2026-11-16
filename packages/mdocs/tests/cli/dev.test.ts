/**
 * `mdocs dev`: the server, the answer endpoint and the guards around it.
 *
 * The server runs in-process on port 0 with a build that writes one page, because
 * vitest's node project is not Bun and `Bun.build` exists only there. The one
 * thing that needs the real build — a folder of plain `.md` with no config — is
 * spawned under Bun at the end, with its temp folder pointed into this test's.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { request } from "node:http";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { askIndex, scanContent } from "../../src/index";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BuildOptions } from "../../src/cli/build";
import type { ResolvedConfig } from "../../src/cli/config";
import { type DevServer, startDev } from "../../src/cli/dev";
import { claimBase, planDev } from "../../src/cli/dev-config";

const ASK = [
  "# Notes",
  "",
  "```ask id=go",
  "kind: choice",
  "question: Which?",
  "options:",
  "  - a",
  "  - b",
  "```",
  "",
].join("\n");

let scratch = "";
let content = "";
let server: DevServer | undefined;
let builds: ResolvedConfig[] = [];
let buildOptions: BuildOptions[] = [];
let failNext = false;

async function start(write: boolean): Promise<DevServer> {
  server = await startDev({
    cwd: scratch,
    root: content,
    write,
    port: 0,
    chrome: "static",
    build: async (config, options) => {
      builds.push(config);
      buildOptions.push(options);
      if (failNext) {
        failNext = false;
        throw new Error("boom");
      }
      mkdirSync(config.outDir, { recursive: true });
      writeFileSync(
        join(config.outDir, "index.html"),
        `<html><body><p>${readFileSync(join(content, "notes.md"), "utf8").length}</p></body></html>`,
      );
      return 1;
    },
  });
  return server;
}

function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${url}/__ask`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function hashOf(): string {
  const entry = askIndex(readFileSync(join(content, "notes.md"), "utf8"))[0];
  if (entry === undefined) throw new Error("no ask in the fixture");
  return entry.hash;
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((done) => setTimeout(done, 25));
  expect(check()).toBe(true);
}

interface Events {
  readonly seen: { type: string; [key: string]: unknown }[];
  close(): Promise<void>;
}

async function listen(url: string): Promise<Events> {
  const response = await fetch(`${url}/__reload`);
  const reader = response.body?.getReader();
  const seen: Events["seen"] = [];
  const decoder = new TextDecoder();
  let pending = "";
  void (async () => {
    try {
      for (;;) {
        const chunk = await reader?.read();
        if (chunk === undefined || chunk.done) return;
        pending += decoder.decode(chunk.value, { stream: true });
        for (let end = pending.indexOf("\n\n"); end !== -1; end = pending.indexOf("\n\n")) {
          const line = pending.slice(0, end).split("\n").find((item) => item.startsWith("data: "));
          pending = pending.slice(end + 2);
          if (line !== undefined) seen.push(JSON.parse(line.slice(6)));
        }
      }
    } catch {
      return;
    }
  })();
  return { seen, close: async () => void (await reader?.cancel().catch(() => undefined)) };
}

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "mdocs-dev-test-"));
  content = join(scratch, "content");
  mkdirSync(content);
  writeFileSync(join(content, "notes.md"), ASK);
  builds = [];
  buildOptions = [];
  failNext = false;
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(scratch, { recursive: true, force: true });
});

describe("mdocs dev", () => {
  it("serves the build with the reload script, and writes nothing under the content", async () => {
    const dev = await start(false);
    const before = readdirSync(content);

    const response = await fetch(`${dev.url}/`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('new EventSource("/__reload")');
    expect(html.indexOf("EventSource")).toBeLessThan(html.indexOf("</body>"));

    const out = builds[0]?.outDir ?? "";
    expect(builds[0]?.contentDir).toBe(content);
    for (const dir of [out, dev.outDir]) {
      expect(dir.startsWith(resolve(tmpdir()))).toBe(true);
      expect(relative(content, dir).startsWith("..")).toBe(true);
    }
    expect(readdirSync(content)).toEqual(before);
    expect(new URL(dev.url).hostname).toBe("127.0.0.1");
  });

  it("rebuilds when a file changes, and keeps the last good site when a build fails", async () => {
    const dev = await start(false);
    expect(builds).toHaveLength(1);

    writeFileSync(join(content, "notes.md"), `${ASK}\nmore\n`);
    await until(() => builds.length === 2);
    expect(await (await fetch(`${dev.url}/`)).text()).toContain(`<p>${ASK.length + 6}</p>`);

    failNext = true;
    writeFileSync(join(content, "notes.md"), `${ASK}\nmore and more\n`);
    await until(() => builds.length === 3);
    const response = await fetch(`${dev.url}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`<p>${ASK.length + 6}</p>`);

    const events = await fetch(`${dev.url}/__reload`);
    const reader = events.body?.getReader();
    const chunk = new TextDecoder().decode((await reader?.read())?.value);
    await reader?.cancel();
    expect(chunk).toContain('"type":"error"');
    expect(chunk).toContain("boom");
  });

  it("does not announce that it takes answers without --write", async () => {
    const dev = await start(false);
    const html = await (await fetch(`${dev.url}/`)).text();
    expect(html).not.toContain("__MDOCS_WRITE__");
  });

  it("asks the build for the question island, whether or not it writes", async () => {
    await start(false);
    expect(buildOptions[0]).toMatchObject({ mode: "development", asks: "island" });
  });

  it("answers 404 on /__ask without --write", async () => {
    const dev = await start(false);
    const before = readFileSync(join(content, "notes.md"), "utf8");
    const response = await post(dev.url, { file: "notes.md", id: "go", answer: "a", hash: hashOf() });
    expect(response.status).toBe(404);
    expect(readFileSync(join(content, "notes.md"), "utf8")).toBe(before);
  });
});

describe("mdocs dev --write", () => {
  it("announces that it takes answers when it serves a page, and writes that nowhere", async () => {
    const dev = await start(true);
    const html = await (await fetch(`${dev.url}/`)).text();
    expect(html).toContain("<script>window.__MDOCS_WRITE__=true</script>");
    expect(html.indexOf("__MDOCS_WRITE__")).toBeLessThan(html.indexOf("</body>"));
    expect(html.indexOf("__MDOCS_WRITE__")).toBeLessThan(html.indexOf("EventSource"));

    const onDisk = readFileSync(join(builds[0]?.outDir ?? "", "index.html"), "utf8");
    expect(onDisk).not.toContain("__MDOCS_WRITE__");
  });

  it("writes the answer, returns the new hash, and refuses the old one afterwards", async () => {
    const dev = await start(true);
    const hash = hashOf();
    const body = { file: "notes.md", id: "go", answer: "b", comment: "because", hash };

    const response = await post(dev.url, body);
    expect(response.status).toBe(200);
    const written = readFileSync(join(content, "notes.md"), "utf8");
    expect(written).toContain("answer: b\ncomment: because\nanswered: true\n```");
    expect(((await response.json()) as { hash: string }).hash).toBe(hashOf());
    expect(readdirSync(content).filter((name) => name.endsWith(".tmp"))).toEqual([]);

    const again = await post(dev.url, body);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { hash: string }).hash).toBe(hashOf());
    expect(readFileSync(join(content, "notes.md"), "utf8")).toBe(written);
  });

  it("pushes the answer to the open pages and does not reload them for its own write", async () => {
    const dev = await start(true);
    const events = await listen(dev.url);
    const hash = hashOf();

    const response = await post(dev.url, { file: "notes.md", id: "go", answer: "b", comment: "why", hash });
    expect(response.status).toBe(200);
    await until(() => builds.length === 2);
    await pause(400);
    await events.close();

    expect(events.seen.filter((event) => event.type === "answer")).toEqual([
      { type: "answer", file: "notes.md", id: "go", hash: hashOf(), answer: "b", comment: "why" },
    ]);
    expect(events.seen.filter((event) => event.type === "reload")).toEqual([]);
  });

  it("still reloads the pages when a content file is edited by anything else", async () => {
    const dev = await start(true);
    const events = await listen(dev.url);

    writeFileSync(join(content, "notes.md"), `${ASK}\nedited\n`);
    await until(() => builds.length === 2);
    await until(() => events.seen.some((event) => event.type === "reload"));
    await events.close();
  });

  it("reloads once a failed build has been fixed, so the banner clears", async () => {
    const dev = await start(true);
    const events = await listen(dev.url);

    failNext = true;
    writeFileSync(join(content, "notes.md"), `${ASK}\nbroken\n`);
    await until(() => events.seen.some((event) => event.type === "error"));

    const response = await post(dev.url, { file: "notes.md", id: "go", answer: "a", hash: hashOf() });
    expect(response.status).toBe(200);
    await until(() => events.seen.some((event) => event.type === "reload"));
    await events.close();
  });

  it("accepts the server's own origins and refuses any other", async () => {
    const dev = await start(true);
    const body = { file: "notes.md", id: "go", answer: "a", hash: hashOf() };
    const before = readFileSync(join(content, "notes.md"), "utf8");

    for (const origin of ["http://evil.example", "null", `http://127.0.0.1:${dev.port + 1}`]) {
      expect((await post(dev.url, body, { origin })).status, origin).toBe(403);
    }
    expect(readFileSync(join(content, "notes.md"), "utf8")).toBe(before);

    expect((await post(dev.url, body, { origin: `http://localhost:${dev.port}` })).status).toBe(200);
  });

  it("serves only requests addressed to its own host", async () => {
    const dev = await start(false);
    const status = (host: string): Promise<number> =>
      new Promise((done, fail) => {
        request({ host: "127.0.0.1", port: dev.port, path: "/", headers: { host } }, (response) => {
          response.resume();
          done(response.statusCode ?? 0);
        })
          .on("error", fail)
          .end();
      });

    for (const host of ["evil.example", `evil.example:${dev.port}`, `127.0.0.1:${dev.port + 1}`]) {
      expect(await status(host), host).toBe(403);
    }
    expect(await status(`localhost:${dev.port}`)).toBe(200);
    expect(await status(`127.0.0.1:${dev.port}`)).toBe(200);
  });

  it("refuses a file outside the content directory", async () => {
    const dev = await start(true);
    writeFileSync(join(scratch, "outside.md"), ASK);
    const hash = hashOf();
    const attempts = ["../outside.md", "..\\outside.md", join(scratch, "outside.md"), "/etc/passwd.md"];
    for (const file of attempts) {
      const response = await post(dev.url, { file, id: "go", answer: "a", hash });
      expect(response.status, file).toBe(403);
    }
    expect(readFileSync(join(scratch, "outside.md"), "utf8")).toBe(ASK);
  });

  it("refuses what is not a well-formed request", async () => {
    const dev = await start(true);
    const hash = hashOf();
    const ok = { file: "notes.md", id: "go", answer: "a", hash };

    expect((await fetch(`${dev.url}/__ask`)).status).toBe(405);
    const form = await fetch(`${dev.url}/__ask`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(ok),
    });
    expect(form.status).toBe(415);
    expect((await post(dev.url, "{nope")).status).toBe(400);
    expect((await post(dev.url, { ...ok, file: "notes.txt" })).status).toBe(400);
    expect((await post(dev.url, { ...ok, file: "missing.md" })).status).toBe(404);
    expect((await post(dev.url, { ...ok, id: "nope" })).status).toBe(404);
    expect((await post(dev.url, { ...ok, answer: "z" })).status).toBe(422);
    expect((await post(dev.url, { ...ok, answer: "a".repeat(70 * 1024) })).status).toBe(413);
    expect(readFileSync(join(content, "notes.md"), "utf8")).toBe(ASK);
  });
});

describe("mdocs dev on a folder of plain markdown", () => {
  let child: ChildProcess | undefined;

  afterEach(async () => {
    const running = child;
    child = undefined;
    if (running === undefined || running.exitCode !== null) return;
    const exited = new Promise((done) => running.once("exit", done));
    running.kill();
    await exited;
  });

  it("builds with no config and puts nothing next to the notes", async () => {
    const notes = join(scratch, "notes");
    mkdirSync(join(notes, "sub"), { recursive: true });
    writeFileSync(join(notes, "index.md"), `# Home\n\n${ASK.replace("# Notes\n\n", "")}`);
    writeFileSync(join(notes, "sub", "page.md"), "# Sub\n\nText.\n");
    const temp = join(scratch, "tmp");
    mkdirSync(temp);

    const cli = fileURLToPath(new URL("../../src/cli/mdocs.ts", import.meta.url));
    child = spawn("bun", [cli, "dev", "--root", notes, "--port", "0"], {
      cwd: scratch,
      env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    const url = await new Promise<string>((done, fail) => {
      child?.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
        const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
        if (match !== null) done(match[0]);
      });
      child?.on("exit", () => fail(new Error(`mdocs dev exited early:\n${output}`)));
    });

    const response = await fetch(`${url}/`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Home</h1>");
    expect(html).toContain('data-ask-id="go"');
    expect(html).toContain('new EventSource("/__reload")');
    const sheets = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map((match) => match[1]);
    expect(sheets).toEqual(["/assets/docs.css"]);
    expect(new Set(sheets).size).toBe(sheets.length);
    expect((await fetch(`${url}/assets/docs.css`)).status).toBe(200);
    expect((await fetch(`${url}/sub/page`)).status).toBe(200);

    expect(readdirSync(notes).sort()).toEqual(["index.md", "sub"]);
    expect(existsSync(join(temp, readdirSync(temp)[0] ?? "missing"))).toBe(true);
    expect(readdirSync(temp)[0]).toMatch(/^mdocs-dev-/);
  }, 60_000);
});

describe("the config made up for a folder with no mdocs.config.ts", () => {
  it("lists the kit's sheet alone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mdocs-plan-"));
    try {
      mkdirSync(join(dir, "notes"));
      const plan = await planDev(dir, "notes");
      const config = await plan.load(false);
      expect(plan.generated).toBe(true);
      expect(config.stylesheets?.map((sheet) => sheet.replaceAll("\\", "/"))).toEqual([
        expect.stringMatching(/\/styles\/docs\.css$/),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the dev folder", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mdocs-claim-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the folder and reuses one it owns", () => {
    const base = join(dir, "base");
    claimBase(base);
    expect(existsSync(base)).toBe(true);
    expect(() => claimBase(base)).not.toThrow();
  });

  it("refuses a link planted where the folder goes", () => {
    const target = join(dir, "target");
    mkdirSync(target);
    const base = join(dir, "base");
    symlinkSync(target, base, "junction");
    expect(() => claimBase(base)).toThrow(/not a plain directory/);
  });

  it.skipIf(process.platform === "win32")("refuses a folder others may write into", () => {
    const base = join(dir, "base");
    mkdirSync(base, { mode: 0o777 });
    chmodSync(base, 0o777);
    expect(() => claimBase(base)).toThrow(/not a private directory/);
  });
});

describe("mdocs dev with several roots", () => {
  let docs = "";
  let notes = "";
  let readme = "";
  let todo = "";
  let rootsSeen: ResolvedConfig[] = [];

  const mounts = (): { prefix: string; path: string }[] => [
    { prefix: "", path: docs },
    { prefix: "private/notes", path: notes },
    { prefix: "", path: readme },
    { prefix: "private/todo", path: todo },
  ];

  const hashIn = (file: string): string => {
    const entry = askIndex(readFileSync(file, "utf8"))[0];
    if (entry === undefined) throw new Error(`no ask in ${file}`);
    return entry.hash;
  };

  const answer = (url: string, file: string, real: string, answerText = "b"): Promise<Response> =>
    post(url, { file, id: "go", answer: answerText, hash: hashIn(real) });

  async function startRoots(write: boolean): Promise<DevServer> {
    server = await startDev({
      cwd: scratch,
      roots: mounts(),
      write,
      port: 0,
      chrome: "static",
      build: async (config, options) => {
        rootsSeen.push(config);
        buildOptions.push(options);
        const pages = scanContent({ roots: config.contentRoots ?? [], links: "warn" });
        mkdirSync(config.outDir, { recursive: true });
        for (const one of pages) {
          const dir = join(config.outDir, one.route.replace(/^\//, ""));
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, "index.html"), `<html><body><p>${one.file}</p></body></html>`);
        }
        return pages.length;
      },
    });
    return server;
  }

  const tree = (dir: string): string[] =>
    readdirSync(dir, { recursive: true, encoding: "utf8" }).map((name) => name.split(sep).join("/")).sort();

  beforeEach(() => {
    docs = join(scratch, "docs");
    notes = join(scratch, "notes");
    readme = join(scratch, "README.md");
    todo = join(scratch, "todo.md");
    rootsSeen = [];
    mkdirSync(join(docs, "guide"), { recursive: true });
    mkdirSync(join(notes, "deep"), { recursive: true });
    writeFileSync(join(docs, "index.md"), "# Home\n");
    writeFileSync(join(docs, "guide", "intro.md"), ASK);
    writeFileSync(join(notes, "plan.md"), ASK);
    writeFileSync(join(notes, "deep", "idea.md"), "# Idea\n");
    writeFileSync(readme, ASK);
    writeFileSync(todo, ASK);
  });

  it("serves each root under its prefix, a file root as one page", async () => {
    const dev = await startRoots(false);
    const served = async (path: string): Promise<string> => (await fetch(`${dev.url}${path}`)).text();

    expect(await served("/")).toContain("<p>index.md</p>");
    expect(await served("/guide/intro")).toContain("<p>guide/intro.md</p>");
    expect(await served("/private/notes/plan")).toContain("<p>private/notes/plan.md</p>");
    expect(await served("/private/notes/deep/idea")).toContain("<p>private/notes/deep/idea.md</p>");
    expect(await served("/readme")).toContain("<p>README.md</p>");
    expect(await served("/private/todo")).toContain("<p>private/todo.md</p>");

    const config = rootsSeen[0];
    expect(config?.contentDir).toBe(docs);
    expect(config?.contentRoots).toEqual([
      { dir: docs, prefix: "" },
      { dir: notes, prefix: "private/notes" },
      { dir: scratch, prefix: "", file: "README.md" },
      { dir: scratch, prefix: "private/todo", file: "todo.md" },
    ]);
    expect(config?.siteName).toBe("docs");
    expect(config?.categories).toEqual([
      { slug: "deep", label: "deep" },
      { slug: "guide", label: "guide" },
      { slug: "notes", label: "private/notes" },
      { slug: "private", label: "private" },
    ]);
  });

  it("writes an answer into the real file of each root, a file root included, and nothing else", async () => {
    const dev = await startRoots(true);
    const before = tree(scratch);

    const targets: [string, string][] = [
      ["guide/intro.md", join(docs, "guide", "intro.md")],
      ["private/notes/plan.md", join(notes, "plan.md")],
      ["README.md", readme],
      ["private/todo.md", todo],
    ];
    for (const [file, real] of targets) {
      expect((await answer(dev.url, file, real)).status, file).toBe(200);
      expect(askIndex(readFileSync(real, "utf8"))[0]?.block.answer, file).toBe("b");
    }

    expect(tree(scratch)).toEqual(before);
    for (const dir of [dev.outDir, ...rootsSeen.map((config) => config.outDir)]) {
      expect(dir.startsWith(resolve(tmpdir()))).toBe(true);
      expect(relative(scratch, dir).startsWith("..")).toBe(true);
    }
  });

  it("refuses a way out through a prefix, and finds nothing under a prefix that is no root's", async () => {
    const dev = await startRoots(true);
    writeFileSync(join(scratch, "outside.md"), ASK);
    const hash = hashIn(join(scratch, "outside.md"));
    for (const file of ["private/notes/../../outside.md", "../outside.md"]) {
      const response = await post(dev.url, { file, id: "go", answer: "a", hash });
      expect(response.status, file).toBe(403);
    }
    for (const file of ["nowhere/plan.md", "private/todo/x.md"]) {
      const response = await post(dev.url, { file, id: "go", answer: "a", hash });
      expect(response.status, file).toBe(404);
    }
    expect(readFileSync(join(scratch, "outside.md"), "utf8")).toBe(ASK);
  });

  it("does not reload for its own write, and reloads for any other edit, in every root", async () => {
    const dev = await startRoots(true);
    await pause(500);
    const events = await listen(dev.url);

    expect((await answer(dev.url, "private/notes/plan.md", join(notes, "plan.md"))).status).toBe(200);
    expect((await answer(dev.url, "private/todo.md", todo)).status).toBe(200);
    await until(() => rootsSeen.length >= 2);
    await pause(400);
    expect(events.seen.filter((event) => event.type === "reload")).toEqual([]);
    expect(
      events.seen.filter((event) => event.type === "answer").map((event) => event["file"]),
    ).toEqual(["private/notes/plan.md", "private/todo.md"]);

    const built = rootsSeen.length;
    writeFileSync(join(notes, "deep", "idea.md"), "# Idea\n\nedited\n");
    await until(() => rootsSeen.length > built);
    await until(() => events.seen.some((event) => event.type === "reload"));

    const afterNotes = rootsSeen.length;
    writeFileSync(readme, `${ASK}\nedited\n`);
    await until(() => rootsSeen.length > afterNotes);

    const afterReadme = rootsSeen.length;
    writeFileSync(join(scratch, "unrelated.txt"), "not a root");
    await pause(500);
    expect(rootsSeen.length).toBe(afterReadme);
    await events.close();
  });

  it("keeps the dev folder and the plan of a lone unprefixed root exactly as before", async () => {
    const key = createHash("sha256").update(`${scratch}\n${docs}`).digest("hex").slice(0, 8);
    const expected = join(tmpdir(), `mdocs-dev-${key}`);

    const bare = await planDev(scratch, docs);
    const listed = await planDev(scratch, [{ prefix: "", path: docs }]);
    expect(bare.base).toBe(expected);
    expect(listed.base).toBe(expected);
    expect(listed.contentDir).toBe(docs);
    expect(listed.roots).toEqual([{ dir: docs, prefix: "" }]);
    expect(await listed.load(false)).toEqual(await bare.load(false));
    expect((await bare.load(false)).siteName).toBe("docs");
  });

  it("derives the dev folder from every root", async () => {
    const all = await planDev(scratch, mounts());
    const fewer = await planDev(scratch, mounts().slice(0, 3));
    const moved = await planDev(scratch, [
      ...mounts().slice(0, 3),
      { prefix: "private/other", path: todo },
    ]);
    const single = await planDev(scratch, docs);
    expect(new Set([all.base, fewer.base, moved.base, single.base]).size).toBe(4);
    expect(all.base).toBe((await planDev(scratch, mounts())).base);
  });

  it("refuses a root that is missing or a file that is not markdown", async () => {
    await expect(planDev(scratch, [{ prefix: "x", path: "missing" }])).rejects.toThrow(/does not exist/);
    writeFileSync(join(scratch, "data.txt"), "x");
    await expect(planDev(scratch, [{ prefix: "x", path: "data.txt" }])).rejects.toThrow(
      /is a file but not a \.md/,
    );
  });
});

describe("mdocs dev with several roots, run for real", () => {
  let child: ChildProcess | undefined;

  afterEach(async () => {
    const running = child;
    child = undefined;
    if (running === undefined || running.exitCode !== null) return;
    const exited = new Promise((done) => running.once("exit", done));
    running.kill();
    await exited;
  });

  const cli = fileURLToPath(new URL("../../src/cli/mdocs.ts", import.meta.url));

  it("builds the roots side by side and puts nothing next to any of them", async () => {
    const notes = join(scratch, "notes");
    const more = join(scratch, "more");
    mkdirSync(join(notes, "sub"), { recursive: true });
    mkdirSync(more);
    writeFileSync(join(notes, "index.md"), "# Home\n\nText.\n");
    writeFileSync(join(notes, "sub", "page.md"), "# Sub\n\nText.\n");
    writeFileSync(join(more, "extra.md"), "# Extra\n\n[home](../notes/index.md) [readme](../README.md)\n");
    writeFileSync(join(scratch, "README.md"), "# Readme\n\nText.\n");
    const temp = join(scratch, "tmp");
    mkdirSync(temp);
    const beforeNotes = readdirSync(notes).sort();
    const beforeMore = readdirSync(more).sort();
    const beforeTop = readdirSync(scratch).sort();

    child = spawn(
      "bun",
      [cli, "dev", "--root", notes, "--root", `ideas=${more}`, "--root", "=README.md", "--port", "0"],
      {
        cwd: scratch,
        env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp },
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    let output = "";
    const url = await new Promise<string>((done, fail) => {
      child?.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
        const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
        if (match !== null) done(match[0]);
      });
      child?.on("exit", () => fail(new Error(`mdocs dev exited early:\n${output}`)));
    });

    expect(await (await fetch(`${url}/`)).text()).toContain("<h1>Home</h1>");
    expect(await (await fetch(`${url}/sub/page`)).text()).toContain("<h1>Sub</h1>");
    const extra = await (await fetch(`${url}/ideas/extra`)).text();
    expect(extra).toContain("<h1>Extra</h1>");
    expect(extra).toContain('href="/"');
    expect(extra).toContain('href="/readme"');
    expect(await (await fetch(`${url}/readme`)).text()).toContain("<h1>Readme</h1>");

    expect(readdirSync(notes).sort()).toEqual(beforeNotes);
    expect(readdirSync(more).sort()).toEqual(beforeMore);
    expect(readdirSync(scratch).sort()).toEqual(beforeTop);
  }, 60_000);

  it("exits 2 on a prefix it cannot use, before anything is built", () => {
    const run = (...roots: string[]) =>
      spawnSync("bun", [cli, "dev", "--port", "0", ...roots.flatMap((root) => ["--root", root])], {
        cwd: scratch,
        encoding: "utf8",
      });

    const traversal = run(`../up=${scratch}`);
    expect(traversal.status).toBe(2);
    expect(traversal.stderr).toContain("must not contain");

    const duplicate = run(`a=${scratch}`, `A=${scratch}`);
    expect(duplicate.status).toBe(2);
    expect(duplicate.stderr).toContain("already used");

    const reserved = run(`assets=${scratch}`);
    expect(reserved.status).toBe(2);
    expect(reserved.stderr).toContain("reserved");
  }, 30_000);
});
