import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { ASSETS_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ktx2": "image/ktx2",
  ".usdz": "model/vnd.usdz+zip",
  ".json": "application/json",
};

/**
 * Next already percent-decodes dynamic segments, but the brief asks for an
 * explicit decode. Decoding twice would corrupt a name that really contains
 * "%", so a failed decode falls back to the raw segment.
 */
function safeDecode(segment: string): string {
  if (!segment.includes("%")) return segment;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The upstream API hands back NFD-decomposed Korean (spec section 10), so a
 * link built from an API value can arrive NFD while the file on disk is NFC.
 * NTFS stores the exact UTF-16 it was given, so an NFD lookup of an NFC-named
 * file misses. Normalize before resolving. NFC only recombines characters - it
 * cannot introduce "/" or ".." - so the traversal check below stays valid.
 */
function normalizeSegment(segment: string): string {
  return safeDecode(segment).normalize("NFC");
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return "invalid";

  let start: number;
  let end: number;
  if (rawStart === "") {
    // suffix range: last N bytes
    const suffix = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd === "" ? size - 1 : Number.parseInt(rawEnd, 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (start > end || start >= size) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

/**
 * Streams a file out of ../assets (which sits outside public/ and runs to
 * several GB). Supports HTTP Range so the GLB viewer and <img> can seek.
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: rawSegments } = await context.params;
  const segments = (rawSegments ?? []).map(normalizeSegment);

  if (segments.length === 0 || segments.some((s) => s === "" || s === "." || s === "..")) {
    return new Response("bad asset path", { status: 400 });
  }

  // Resolve and verify the result is still inside the assets root.
  const target = path.resolve(ASSETS_DIR, ...segments);
  const root = ASSETS_DIR.endsWith(path.sep) ? ASSETS_DIR : ASSETS_DIR + path.sep;
  if (target !== ASSETS_DIR && !target.startsWith(root)) {
    return new Response("forbidden", { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return new Response("asset not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("asset not found", { status: 404 });

  const ext = path.extname(target).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const url = new URL(request.url);
  const asDownload = url.searchParams.get("download") === "1";

  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=60",
    "Last-Modified": stat.mtime.toUTCString(),
  });
  if (asDownload) {
    const filename = path.basename(target);
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
  }

  // unchanged since the browser's copy (it revalidates after max-age): no body, the copy is reused
  const since = Date.parse(request.headers.get("if-modified-since") ?? "");
  if (!asDownload && !Number.isNaN(since) && Math.floor(stat.mtimeMs / 1000) * 1000 <= since) {
    return new Response(null, { status: 304, headers });
  }

  const range = parseRange(request.headers.get("range"), stat.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${stat.size}`);
    return new Response(null, { status: 416, headers });
  }

  if (request.method === "HEAD") {
    headers.set("Content-Length", String(stat.size));
    return new Response(null, { status: 200, headers });
  }

  if (range) {
    const length = range.end - range.start + 1;
    headers.set("Content-Length", String(length));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
    const stream = fs.createReadStream(target, { start: range.start, end: range.end });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(stat.size));
  const stream = fs.createReadStream(target);
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: 200, headers });
}

export async function HEAD(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return GET(request, context);
}
