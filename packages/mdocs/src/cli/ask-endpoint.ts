import { randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  type AskAnswerDetail,
  AskWriteError,
  type ContentRoot,
  rootFile,
  writeAnswer,
} from "../index";

export interface AskWritten extends AskAnswerDetail {
  /** The absolute path of the file the answer went into. */
  readonly path: string;
  /** The same file as the pages know it: the root's prefix, then the path inside it. */
  readonly virtualFile: string;
}

export interface AskEndpointOptions {
  /** The one directory `file` is relative to and no write may leave. Ignored when `roots` is given. */
  readonly root?: string | undefined;
  /**
   * The roots `file` is a virtual path into: a directory root answers for `file`s
   * under its prefix, a file root for its own page and nothing else.
   */
  readonly roots?: readonly ContentRoot[] | undefined;
  /** The origins a browser page of this very server can have. */
  readonly origins: () => readonly string[];
  /** Called once an answer is on disk, before the reply is sent. */
  readonly onWritten?: ((event: AskWritten) => void) | undefined;
}

const BODY_LIMIT = 64 * 1024;
const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<Buffer | "too-large"> {
  return new Promise((done, fail) => {
    if (Number(request.headers["content-length"] ?? 0) > BODY_LIMIT) {
      request.resume();
      done("too-large");
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        chunks.length = 0;
        request.removeAllListeners("data");
        request.resume();
        done("too-large");
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => done(Buffer.concat(chunks)));
    request.on("error", fail);
  });
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

interface Located {
  readonly root: ContentRoot;
  /** The path inside the root; for a file root, the file's name. */
  readonly inside: string;
}

function locate(roots: readonly ContentRoot[], file: string): Located | undefined {
  const exact = roots.find((root) => root.file !== undefined && rootFile(root) === file);
  if (exact !== undefined) return { root: exact, inside: exact.file ?? "" };
  let best: Located | undefined;
  for (const root of roots) {
    if (root.file !== undefined) continue;
    const mount = root.prefix === "" ? "" : `${root.prefix}/`;
    if (!file.startsWith(mount)) continue;
    if (best === undefined || root.prefix.length > best.root.prefix.length) {
      best = { root, inside: file.slice(mount.length) };
    }
  }
  return best;
}

interface Parsed {
  readonly file: string;
  readonly id: string;
  readonly hash: string;
  readonly answer: string | readonly string[];
  readonly comment: string | undefined;
}

function parseBody(raw: string): Parsed | string {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return "the body is not JSON";
  }
  if (typeof json !== "object" || json === null) return "the body must be an object";
  const body = json as Record<string, unknown>;
  const { file, id, hash, answer, comment } = body;
  if (typeof file !== "string" || file === "") return '"file" must be a non-empty string';
  if (typeof id !== "string" || id === "") return '"id" must be a non-empty string';
  if (typeof hash !== "string" || hash === "") return '"hash" must be a non-empty string';
  const isList = Array.isArray(answer) && answer.every((item) => typeof item === "string");
  if (typeof answer !== "string" && !isList) return '"answer" must be a string or a list of strings';
  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    return '"comment" must be a string';
  }
  return {
    file,
    id,
    hash,
    answer: answer as string | readonly string[],
    comment: typeof comment === "string" ? comment : undefined,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/**
 * Swapped in over the original, never written into it: a reader that opens the
 * file mid-write sees the old text or the new one, and a crash leaves the old.
 *
 * The retries are Windows': an editor, an indexer or a virus scanner holds the
 * target for a few milliseconds and `rename` answers EPERM or EBUSY until it lets
 * go. Anything else is a real failure and is raised at once.
 */
async function replaceFile(file: string, text: string): Promise<void> {
  const temp = join(dirname(file), `.${basename(file)}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, text, { encoding: "utf8", mode: statSync(file).mode & 0o777 });
    for (let attempt = 1; ; attempt += 1) {
      try {
        renameSync(temp, file);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "";
        if (!RETRYABLE.has(code) || attempt >= 5) throw error;
        await sleep(20 * attempt);
      }
    }
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** One write at a time: two answers to one file are a read-modify-write each. */
function serialized<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * `POST /__ask`: put a reader's answer into the markdown file that asked.
 *
 * This is a local server that writes to the disk, so it is guarded like one. A
 * page on any other site can make a browser send a request here; what stops it
 * is the `Origin` check (a cross-site fetch always carries one, and it will not be
 * ours), the JSON content type (a form post cannot send it without a preflight),
 * and the server listening on loopback only.
 */
export async function handleAsk(
  request: IncomingMessage,
  response: ServerResponse,
  options: AskEndpointOptions,
): Promise<void> {
  if (request.method !== "POST") {
    send(response, 405, { error: "POST only" }, { allow: "POST" });
    return;
  }
  if (!/^application\/json\s*(;|$)/i.test(request.headers["content-type"] ?? "")) {
    send(response, 415, { error: "the body must be application/json" });
    return;
  }
  const origin = request.headers.origin;
  if (origin !== undefined && !options.origins().includes(origin)) {
    send(response, 403, { error: "cross-origin request refused" });
    return;
  }

  const body = await readBody(request);
  if (body === "too-large") {
    const cutoff = setTimeout(() => request.destroy(), 2000);
    response.once("close", () => clearTimeout(cutoff));
    send(response, 413, { error: `the body is over ${BODY_LIMIT} bytes` }, { connection: "close" });
    return;
  }
  const parsed = parseBody(body.toString("utf8"));
  if (typeof parsed === "string") {
    send(response, 400, { error: parsed });
    return;
  }

  const roots = options.roots ?? (options.root === undefined ? [] : [{ dir: options.root, prefix: "" }]);
  const found = locate(roots, parsed.file);
  if (found === undefined || isAbsolute(parsed.file)) {
    send(response, 403, { error: "the file is outside the content directory" });
    return;
  }
  const root = resolve(found.root.dir);
  const target = resolve(root, found.inside);
  const single = found.root.file !== undefined;
  if (!single && !inside(root, target)) {
    send(response, 403, { error: "the file is outside the content directory" });
    return;
  }
  if (extname(target) !== ".md") {
    send(response, 400, { error: "the file must be a .md" });
    return;
  }
  if (!existsSync(target)) {
    send(response, 404, { error: "no such file" });
    return;
  }
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    send(response, 404, { error: "no such file" });
    return;
  }
  if (!single && !inside(realpathSync(root), real)) {
    send(response, 403, { error: "the file is outside the content directory" });
    return;
  }

  try {
    const result = await serialized(async () => {
      const written = writeAnswer(readFileSync(real, "utf8"), parsed.id, parsed.hash, {
        answer: parsed.answer,
        comment: parsed.comment,
      });
      await replaceFile(real, written.source);
      return written.hash;
    });
    options.onWritten?.({
      path: target,
      virtualFile: single
        ? rootFile(found.root)
        : found.root.prefix === ""
          ? relative(root, target).split(sep).join("/")
          : `${found.root.prefix}/${relative(root, target).split(sep).join("/")}`,
      file: parsed.file,
      id: parsed.id,
      hash: result,
      answer: parsed.answer,
      comment: parsed.comment ?? "",
    });
    send(response, 200, { hash: result });
  } catch (error) {
    if (error instanceof AskWriteError) {
      if (error.code === "not-found") send(response, 404, { error: error.message });
      else if (error.code === "stale") send(response, 409, { error: error.message, hash: error.hash });
      else send(response, 422, { error: error.message });
      return;
    }
    console.error(`could not write ${parsed.file}: ${(error as Error).message}`);
    send(response, 500, { error: "the file could not be written" });
  }
}
