import { existsSync, type FSWatcher, readFileSync, rmSync, statSync, watch } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  ASK_ANSWER_EVENT,
  ASK_WRITE_FLAG,
  type AskAnswerDetail,
  type ContentRoot,
  createHighlight,
  type HighlightHandle,
  rootFile,
} from "../index";
import { handleAsk } from "./ask-endpoint";
import { type BuildOptions, build } from "./build";
import type { RootSpec } from "./cli-args";
import type { ResolvedConfig, SiteConfig } from "./config";
import { claimBase, type DevPlan, planDev, prepareGeneratedRoot } from "./dev-config";

export interface DevOptions {
  readonly cwd: string;
  /** `--root`: the content directory, when it is not the config's. */
  readonly root?: string | undefined;
  /**
   * Every `--root`, each a directory or one `.md` file mounted under a prefix.
   * Wins over `root`; a lone unprefixed directory behaves exactly as `root` does.
   */
  readonly roots?: readonly RootSpec[] | undefined;
  /** `--write`: serve `POST /__ask`, which rewrites answers in the markdown files. */
  readonly write: boolean;
  /** 0 asks the OS for a free one. */
  readonly port: number;
  readonly chrome: BuildOptions["chrome"];
  /** `--slug`: how headings get their ids, over the config's `headingSlugs` on every rebuild. */
  readonly headingSlugs?: SiteConfig["headingSlugs"] | undefined;
  /** Makes the highlighter shared by every rebuild. Swapped by tests that count calls. */
  readonly createHighlight?: () => Promise<HighlightHandle>;
  /** The build to run. Swapped by tests, which run under node and not under Bun. */
  readonly build?: (config: ResolvedConfig, options: BuildOptions) => Promise<number>;
}

export interface DevServer {
  readonly url: string;
  readonly port: number;
  /** The folder every dev build goes into. Under the OS temp folder. */
  readonly outDir: string;
  close(): Promise<void>;
}

/** Long enough for the first build, short enough that a wedged one still answers. */
const HOLD_LIMIT = 30_000;
const DEBOUNCE = 100;
/** How long a file change is taken for the echo of the server's own answer write. */
const OWN_WRITE_WINDOW = 2000;
const IGNORED = /(^|[\\/])(node_modules|\.git|\.mdocs)([\\/]|$)|\.tmp$/;

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

/**
 * Reload on a good build, a banner on a bad one, and hand an answer the server
 * wrote to the islands as a `window` event so the page stays where it is.
 *
 * Injected when a page is served and never written into the output. The banner
 * is part of this script and not a page of its own so it can appear over the last
 * good build, which is what is still being served.
 */
const CLIENT_SCRIPT =
  `<script>(()=>{const show=m=>{let e=document.getElementById("__mdocs-error");if(!m){if(e)e.remove();return}if(!e){e=document.createElement("pre");e.id="__mdocs-error";e.style.cssText="position:fixed;left:0;right:0;bottom:0;max-height:50vh;overflow:auto;margin:0;padding:12px;background:#400;color:#fff;font:12px/1.4 monospace;white-space:pre-wrap;z-index:2147483647";document.body.append(e)}e.textContent=m};new EventSource("/__reload").onmessage=ev=>{const d=JSON.parse(ev.data);if(d.type==="reload")location.reload();else if(d.type==="answer")window.dispatchEvent(new CustomEvent("${ASK_ANSWER_EVENT}",{detail:d}));else show(d.message)}})()</script>`;

/**
 * Tells the page the server will take its answers, so the UI can offer to send
 * them. Sent with the reload script and for the same reason: it is a fact about
 * the server running now, and a flag written into the build would outlive it.
 */
const WRITE_SCRIPT = `<script>window.${ASK_WRITE_FLAG}=true</script>`;

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function page(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(
    `<!doctype html><meta charset="utf-8"><title>${status}</title><p>${escapeHtml(message)}${CLIENT_SCRIPT}`,
  );
}

function within(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function defaultBuild(
  plan: DevPlan,
  config: ResolvedConfig,
  options: BuildOptions,
): Promise<number> {
  if (plan.generated) prepareGeneratedRoot(config.root);
  return build({ ...config, base: "/" }, options);
}

/**
 * `mdocs dev`: watch, build for real, serve the result, reload the page.
 *
 * Every reload is a real `mdocs build` in development mode, so what the browser
 * shows is the artefact a build would write. It goes into one of two folders
 * under the OS temp directory and the server flips between them: the folder being
 * built is never the one being served, so a failed build leaves the last good
 * site where it was, and a request mid-build is answered rather than held. Only
 * the first build, before any site exists, parks requests.
 *
 * Listens on loopback only. With `write`, `POST /__ask` rewrites answers in the
 * markdown files under the content directory — see `ask-endpoint.ts` for what
 * guards that.
 */
export async function startDev(options: DevOptions): Promise<DevServer> {
  const plan = await planDev(options.cwd, options.roots ?? options.root);
  claimBase(plan.base);
  const slots = [join(plan.base, "a"), join(plan.base, "b")] as const;
  // The slots are this server's own; a killed server leaves them behind, and
  // without the build's marker the build would refuse to empty them.
  for (const slot of slots) rmSync(slot, { recursive: true, force: true });
  const runBuild =
    options.build ?? ((config: ResolvedConfig, built: BuildOptions) => defaultBuild(plan, config, built));

  const makeHighlight = options.createHighlight ?? createHighlight;
  let highlighter: Promise<HighlightHandle> | undefined;
  const sharedHighlight = (): Promise<HighlightHandle> => {
    highlighter ??= makeHighlight().catch((error: unknown) => {
      highlighter = undefined;
      throw error;
    });
    return highlighter;
  };

  let current: string | undefined;
  let building = false;
  let queued = false;
  let closed = false;
  let configChanged = false;
  let reloadWanted = false;
  const ownWrites = new Map<string, number>();
  let lastError: string | undefined;
  let running: Promise<void> = Promise.resolve();
  const clients = new Set<ServerResponse>();
  const held = new Set<{ resume: () => void; timer: ReturnType<typeof setTimeout> }>();

  const publish = (
    event:
      | { type: "reload" }
      | { type: "error"; message: string }
      | ({ type: "answer" } & AskAnswerDetail),
  ): void => {
    for (const client of clients) {
      try {
        client.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        clients.delete(client);
      }
    }
  };

  const release = (): void => {
    for (const entry of held) {
      clearTimeout(entry.timer);
      held.delete(entry);
      entry.resume();
    }
  };

  const whenReady = (resume: () => void): void => {
    if (current !== undefined || !building) {
      resume();
      return;
    }
    const entry = {
      resume,
      timer: setTimeout(() => {
        held.delete(entry);
        resume();
      }, HOLD_LIMIT),
    };
    held.add(entry);
  };

  const rebuild = (): Promise<void> => {
    if (building) {
      queued = true;
      return running;
    }
    building = true;
    const started = Date.now();
    const wanted = reloadWanted;
    reloadWanted = false;
    const recovering = lastError !== undefined;
    running = (async () => {
      try {
        const config = await plan.load(configChanged);
        configChanged = false;
        const slot = current === slots[0] ? slots[1] : slots[0];
        const highlight = await sharedHighlight();
        const pages = await runBuild(
          {
            ...config,
            outDir: slot,
            ...(options.headingSlugs === undefined ? {} : { headingSlugs: options.headingSlugs }),
          },
          { chrome: options.chrome, mode: "development", asks: "island", highlight },
        );
        current = slot;
        lastError = undefined;
        console.log(`${pages} page(s) built in ${Date.now() - started}ms`);
        if (!closed && (wanted || recovering)) publish({ type: "reload" });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`build failed: ${lastError}`);
        if (!closed) publish({ type: "error", message: lastError });
      } finally {
        building = false;
        release();
        if (queued && !closed) {
          queued = false;
          void rebuild();
        }
      }
    })();
    return running;
  };

  const serveFile = (decoded: string, response: ServerResponse): void => {
    if (current === undefined) {
      page(response, 503, lastError ?? "No build yet.");
      return;
    }
    let file = resolve(current, `.${decoded.startsWith("/") ? decoded : `/${decoded}`}`);
    try {
      if (!within(current, file)) throw new Error("outside");
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) {
        page(response, 404, `No page at ${decoded}`);
        return;
      }
      const type = TYPES[extname(file)] ?? "application/octet-stream";
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      if (extname(file) !== ".html") {
        response.end(readFileSync(file));
        return;
      }
      const html = readFileSync(file, "utf8");
      const injected = (options.write ? WRITE_SCRIPT : "") + CLIENT_SCRIPT;
      const at = html.lastIndexOf("</body>");
      response.end(at === -1 ? html + injected : html.slice(0, at) + injected + html.slice(at));
    } catch (error) {
      console.error(`could not serve ${decoded}: ${(error as Error).message}`);
      if (!response.headersSent) page(response, 404, `No page at ${decoded}`);
      else response.destroy();
    }
  };

  const origins = (): readonly string[] => {
    const { port } = server.address() as AddressInfo;
    return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", "http://localhost");

    // Loopback alone does not stop DNS rebinding: a page on another name that
    // resolves to 127.0.0.1 would otherwise read everything this server serves.
    if (!origins().includes(`http://${request.headers.host ?? ""}`)) {
      page(response, 403, `Unknown host ${request.headers.host ?? "(none)"}.`);
      return;
    }

    if (url.pathname === "/__reload") {
      response.on("error", () => clients.delete(response));
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      response.write(": open\n\n");
      if (lastError !== undefined) {
        response.write(`data: ${JSON.stringify({ type: "error", message: lastError })}\n\n`);
      }
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }

    if (url.pathname === "/__ask") {
      if (!options.write) {
        page(response, 404, "Answers are not written: start mdocs dev with --write.");
        return;
      }
      await handleAsk(request, response, {
        roots: plan.roots,
        origins,
        onWritten: ({ path: _path, virtualFile, ...detail }) => {
          ownWrites.set(virtualFile, Date.now() + OWN_WRITE_WINDOW);
          if (!closed) publish({ type: "answer", ...detail });
        },
      });
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" });
      response.end();
      return;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      page(response, 404, `Malformed path ${url.pathname}`);
      return;
    }
    whenReady(() => {
      if (response.writableEnded || response.destroyed) return;
      serveFile(decoded, response);
    });
  };

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      console.error(`request failed: ${(error as Error).message}`);
      if (!response.headersSent) page(response, 500, "Internal error.");
      else response.destroy();
    });
  });

  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (closed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), DEBOUNCE);
  };
  const guard = (watcher: FSWatcher, label: string): void => {
    watcher.on("error", (error) => {
      console.error(`the watcher on ${label} stopped: ${error.message} — restart mdocs dev`);
    });
    watchers.push(watcher);
  };
  const onContentChange = (name: string, virtual: string, changed: string): void => {
    if (IGNORED.test(name) || within(plan.base, changed)) return;
    const now = Date.now();
    for (const [key, expiry] of ownWrites) if (expiry <= now) ownWrites.delete(key);
    if (!ownWrites.has(virtual)) reloadWanted = true;
    schedule();
  };
  const watchRoot = (root: ContentRoot): void => {
    if (root.file !== undefined) {
      const target = root.file;
      guard(
        watch(root.dir, (_event, name) => {
          if (name !== target) return;
          onContentChange(target, rootFile(root), join(root.dir, target));
        }),
        join(root.dir, target),
      );
      return;
    }
    guard(
      watch(root.dir, { recursive: true }, (_event, name) => {
        const inRoot = (name ?? "").split(sep).join("/");
        const virtual = root.prefix === "" || inRoot === "" ? inRoot : `${root.prefix}/${inRoot}`;
        onContentChange(name ?? "", virtual, join(root.dir, name ?? ""));
      }),
      root.dir,
    );
  };
  for (const root of plan.roots) watchRoot(root);
  if (plan.configFile !== null) {
    const file = plan.configFile;
    guard(
      watch(dirname(file), (_event, name) => {
        if (name !== basename(file)) return;
        configChanged = true;
        reloadWanted = true;
        schedule();
      }),
      file,
    );
  }

  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(options.port, "127.0.0.1", () => {
      server.off("error", fail);
      done();
    });
  }).catch((error: unknown) => {
    for (const watcher of watchers) watcher.close();
    throw error;
  });

  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  const watched = plan.roots.map((root) =>
    root.file === undefined ? root.dir : join(root.dir, root.file),
  );
  console.log(
    `mdocs dev on ${url} — watching ${plan.roots.length === 1 ? plan.contentDir : watched.join(", ")}`,
  );
  if (options.write) console.log("answers are written to the markdown files (--write)");
  await rebuild();

  return {
    url,
    port,
    outDir: plan.base,
    close: async () => {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
      for (const client of clients) client.end();
      clients.clear();
      release();
      await running;
      if (highlighter !== undefined) {
        const shared = await highlighter.catch(() => undefined);
        shared?.dispose();
      }
      await new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections();
      });
      rmSync(plan.base, { recursive: true, force: true });
    },
  };
}
