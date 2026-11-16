/**
 * `POST /__ask` under load and under a failing disk: the two paths `dev.test.ts`
 * does not reach, because they need several requests in flight at once or a
 * `rename` that refuses.
 */

import * as fs from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askIndex } from "../../src/index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAsk } from "../../src/cli/ask-endpoint";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

const fence = (id: string): string =>
  ["```ask id=" + id, "kind: choice", "question: Which?", "options:", "  - a", "  - b", "```", ""].join("\n");

const IDS = ["q1", "q2", "q3", "q4", "q5", "q6"];

let content = "";
let server: Server | undefined;
let url = "";

function hashOf(id: string): string {
  const source = fs.readFileSync(join(content, "notes.md"), "utf8");
  const entry = askIndex(source).find((item) => item.block.id === id);
  if (entry === undefined) throw new Error(`no block ${id}`);
  return entry.hash;
}

function post(body: unknown): Promise<Response> {
  return fetch(`${url}/__ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function leftovers(): string[] {
  return fs.readdirSync(content).filter((name) => name.endsWith(".tmp"));
}

beforeEach(async () => {
  content = fs.mkdtempSync(join(tmpdir(), "mdocs-ask-"));
  fs.writeFileSync(join(content, "notes.md"), ["# Notes", "", ...IDS.map(fence)].join("\n"));
  server = createServer((request, response) => {
    void handleAsk(request, response, { root: content, origins: () => [] });
  });
  await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  url = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  vi.mocked(fs.renameSync).mockReset();
  vi.mocked(fs.renameSync).mockImplementation(
    (await vi.importActual<typeof import("node:fs")>("node:fs")).renameSync,
  );
  await new Promise<void>((done) => server?.close(() => done()));
  server = undefined;
  fs.rmSync(content, { recursive: true, force: true });
});

describe("POST /__ask, concurrent writes", () => {
  it("keeps every answer when several blocks of one file are answered at once", async () => {
    // A write is synchronous unless its rename is retried, so the first one is held
    // once: without the queue, the others read the file during that sleep and lose it.
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    let held = false;
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (!held) {
        held = true;
        throw Object.assign(new Error("busy"), { code: "EBUSY" });
      }
      actual.renameSync(from, to);
    });
    const hashes = IDS.map(hashOf);
    const responses = await Promise.all(
      IDS.map((id, index) => post({ file: "notes.md", id, answer: "b", hash: hashes[index] })),
    );

    expect(responses.map((response) => response.status)).toEqual(IDS.map(() => 200));
    const blocks = askIndex(fs.readFileSync(join(content, "notes.md"), "utf8"));
    expect(blocks.map((entry) => entry.block.answer)).toEqual(IDS.map(() => "b"));
    expect(leftovers()).toEqual([]);
  });

  it("lets exactly one of two writes under the same hash through, and refuses the other as stale", async () => {
    const hash = hashOf("q1");
    const [first, second] = await Promise.all([
      post({ file: "notes.md", id: "q1", answer: "a", hash }),
      post({ file: "notes.md", id: "q1", answer: "b", hash }),
    ]);

    expect([first?.status, second?.status]).toEqual([200, 409]);
    const conflict = (await second?.json()) as { hash: string };
    expect(conflict.hash).toBe(hashOf("q1"));
    expect(askIndex(fs.readFileSync(join(content, "notes.md"), "utf8"))[0]?.block.answer).toBe("a");
  });
});

describe("POST /__ask, a failing disk", () => {
  it("answers 500, leaves the file as it was and no temp file behind", async () => {
    const before = fs.readFileSync(join(content, "notes.md"), "utf8");
    vi.mocked(fs.renameSync).mockImplementation(() => {
      throw Object.assign(new Error("disk gone"), { code: "EIO" });
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await post({ file: "notes.md", id: "q1", answer: "a", hash: hashOf("q1") });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "the file could not be written" });
    expect(fs.readFileSync(join(content, "notes.md"), "utf8")).toBe(before);
    expect(leftovers()).toEqual([]);
    expect(vi.mocked(fs.renameSync)).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("retries a rename the system holds, then writes", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    let refusals = 2;
    vi.mocked(fs.renameSync).mockImplementation((from, to) => {
      if (refusals > 0) {
        refusals -= 1;
        throw Object.assign(new Error("busy"), { code: "EBUSY" });
      }
      actual.renameSync(from, to);
    });

    const response = await post({ file: "notes.md", id: "q1", answer: "a", hash: hashOf("q1") });

    expect(response.status).toBe(200);
    expect(vi.mocked(fs.renameSync)).toHaveBeenCalledTimes(3);
    expect(askIndex(fs.readFileSync(join(content, "notes.md"), "utf8"))[0]?.block.answer).toBe("a");
    expect(leftovers()).toEqual([]);
  });

  it("gives up after five refusals, and the next write still goes through", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fs.renameSync).mockImplementation(() => {
      throw Object.assign(new Error("busy"), { code: "EPERM" });
    });

    const refused = await post({ file: "notes.md", id: "q1", answer: "a", hash: hashOf("q1") });
    expect(refused.status).toBe(500);
    expect(vi.mocked(fs.renameSync)).toHaveBeenCalledTimes(5);
    expect(leftovers()).toEqual([]);

    vi.mocked(fs.renameSync).mockImplementation(
      (await vi.importActual<typeof import("node:fs")>("node:fs")).renameSync,
    );
    const next = await post({ file: "notes.md", id: "q1", answer: "b", hash: hashOf("q1") });
    expect(next.status).toBe(200);
    error.mockRestore();
  });
});

describe("POST /__ask, several roots", () => {
  let base = "";
  let other: Server | undefined;
  let otherUrl = "";
  let written: { path: string; virtualFile: string; file: string }[] = [];

  const note = (...parts: string[]): string => join(base, ...parts);
  const hashIn = (file: string): string => {
    const entry = askIndex(fs.readFileSync(file, "utf8"))[0];
    if (entry === undefined) throw new Error(`no ask in ${file}`);
    return entry.hash;
  };
  const answer = (file: string, path: string): Promise<Response> =>
    fetch(`${otherUrl}/__ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file, id: "q1", answer: "b", hash: hashIn(path) }),
    });
  const answered = (path: string): string | undefined =>
    askIndex(fs.readFileSync(path, "utf8"))[0]?.block.answer as string | undefined;

  beforeEach(async () => {
    base = fs.mkdtempSync(join(tmpdir(), "mdocs-ask-roots-"));
    for (const path of [
      note("a", "x.md"),
      note("b", "sub", "z.md"),
      note("single.md"),
      note("top.md"),
      note("outside.md"),
    ]) {
      fs.mkdirSync(join(path, ".."), { recursive: true });
      fs.writeFileSync(path, ["# T", "", fence("q1")].join("\n"));
    }
    written = [];
    other = createServer((request, response) => {
      void handleAsk(request, response, {
        roots: [
          { dir: note("a"), prefix: "alpha" },
          { dir: note("b"), prefix: "beta" },
          { dir: base, prefix: "one", file: "single.md" },
          { dir: base, prefix: "", file: "top.md" },
        ],
        origins: () => [],
        onWritten: ({ path, virtualFile, file }) => written.push({ path, virtualFile, file }),
      });
    });
    await new Promise<void>((done) => other?.listen(0, "127.0.0.1", done));
    const address = other.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    otherUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((done) => other?.close(() => done()));
    other = undefined;
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("maps the prefix to its root and writes into the real file", async () => {
    expect((await answer("alpha/x.md", note("a", "x.md"))).status).toBe(200);
    expect((await answer("beta/sub/z.md", note("b", "sub", "z.md"))).status).toBe(200);
    expect(answered(note("a", "x.md"))).toBe("b");
    expect(answered(note("b", "sub", "z.md"))).toBe("b");
    expect(written.map((entry) => [entry.path, entry.virtualFile, entry.file])).toEqual([
      [note("a", "x.md"), "alpha/x.md", "alpha/x.md"],
      [note("b", "sub", "z.md"), "beta/sub/z.md", "beta/sub/z.md"],
    ]);
  });

  it("writes a file root only through its own virtual file", async () => {
    expect((await answer("one.md", note("single.md"))).status).toBe(200);
    expect((await answer("top.md", note("top.md"))).status).toBe(200);
    expect(answered(note("single.md"))).toBe("b");
    expect(answered(note("top.md"))).toBe("b");
    expect(written.map((entry) => entry.virtualFile)).toEqual(["one.md", "top.md"]);

    for (const file of ["one/single.md", "one/outside.md", "top.md/../outside.md", "outside.md"]) {
      expect((await answer(file, note("outside.md"))).status).toBe(403);
    }
    expect(answered(note("outside.md"))).toBeUndefined();
  });

  it("refuses a path that leaves a root through its prefix", async () => {
    for (const file of [
      "alpha/../outside.md",
      "alpha/../../outside.md",
      "beta/../a/x.md",
      "alpha/../beta/sub/z.md",
      "alpha/",
    ]) {
      expect((await answer(file, note("outside.md"))).status).toBe(403);
    }
    expect(answered(note("outside.md"))).toBeUndefined();
    expect(answered(note("a", "x.md"))).toBeUndefined();
    expect(written).toEqual([]);
  });

  it("refuses a prefix no root has, and a directory root's file that does not exist", async () => {
    expect((await answer("gamma/x.md", note("a", "x.md"))).status).toBe(403);
    expect((await answer("alpha/nope.md", note("a", "x.md"))).status).toBe(404);
    expect((await answer("alpha/x.txt", note("a", "x.md"))).status).toBe(400);
  });

  it("keeps answering the single root it was given by `root`", async () => {
    other?.close();
    other = createServer((request, response) => {
      void handleAsk(request, response, { root: note("a"), origins: () => [] });
    });
    await new Promise<void>((done) => other?.listen(0, "127.0.0.1", done));
    const address = other.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    otherUrl = `http://127.0.0.1:${address.port}`;

    expect((await answer("x.md", note("a", "x.md"))).status).toBe(200);
    expect((await answer("../outside.md", note("outside.md"))).status).toBe(403);
  });
});
