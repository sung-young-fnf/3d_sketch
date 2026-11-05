#!/usr/bin/env python3
"""Resumable bulk downloader for Archisketch CDN assets.

Reads data/catalog.json and pulls, for every component that has a glbUrl:

    assets/<product.localDir>/<component.stem>.glb
    assets/<product.localDir>/<component.stem>.gltf
    assets/<product.localDir>/<component.stem>.png

Writes data/download-report.json with a per-component outcome and totals.

Plain stdlib, Python 3.10. Run with -I:
    python.exe -I scripts/download_assets.py
"""

import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import argparse
import hashlib
import json
import os
import socket
import struct
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CATALOG = os.path.join(ROOT, "data", "catalog.json")
ASSETS = os.path.join(ROOT, "assets")
REPORT = os.path.join(ROOT, "data", "download-report.json")
ENV_FILE = os.path.join(os.path.dirname(ROOT), ".env")

CHUNK = 64 * 1024
TIMEOUT = 120
RETRIES = 3
DELAY = 0.3
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def nfc(s):
    return unicodedata.normalize("NFC", s or "")


def safe_rel(rel):
    """Turn a localDir into an OS-relative path, keeping legitimate '/' nesting."""
    parts = [p.strip() for p in nfc(rel).split("/") if p.strip() not in ("", ".", "..")]
    # strip characters Windows cannot store in a path segment
    cleaned = []
    for p in parts:
        for ch in '<>:"\\|?*':
            p = p.replace(ch, "_")
        cleaned.append(p.rstrip(" ."))
    return os.path.join(*cleaned) if cleaned else ""


def build_opener(use_proxy):
    handlers = []
    if use_proxy:
        user = password = None
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line.startswith("OXYLABS_USERNAME="):
                        user = line.split("=", 1)[1].strip()
                    elif line.startswith("OXYLABS_PASSWORD="):
                        password = line.split("=", 1)[1].strip()
        except OSError as exc:
            raise SystemExit("could not read .env for proxy credentials: %s" % exc)
        if not user or not password:
            raise SystemExit("OXYLABS_USERNAME / OXYLABS_PASSWORD missing from .env")
        endpoint = "http://%s:%s@pr.oxylabs.io:7777" % (
            urllib.parse.quote(user, safe=""),
            urllib.parse.quote(password, safe=""),
        )
        handlers.append(urllib.request.ProxyHandler({"http": endpoint, "https": endpoint}))
        print("[proxy] routing through pr.oxylabs.io:7777 as %s" % user, flush=True)
    else:
        handlers.append(urllib.request.ProxyHandler({}))
    return urllib.request.build_opener(*handlers)


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def validate_glb(path):
    """glTF binary: magic 'glTF' then version then total length at offset 8."""
    size = os.path.getsize(path)
    if size < 12:
        return False, "file shorter than a glb header (%d bytes)" % size
    with open(path, "rb") as fh:
        head = fh.read(12)
    if head[:4] != b"glTF":
        return False, "bad magic %r" % head[:4]
    declared = struct.unpack("<I", head[8:12])[0]
    if declared != size:
        return False, "length field %d != file size %d" % (declared, size)
    return True, None


class Downloader:
    def __init__(self, opener, delay=DELAY, timeout=TIMEOUT, retries=RETRIES):
        self.opener = opener
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self.files = 0
        self.bytes = 0
        self._last_request = 0.0

    def _throttle(self):
        wait = self.delay - (time.monotonic() - self._last_request)
        if wait > 0:
            time.sleep(wait)
        self._last_request = time.monotonic()

    def fetch(self, url, dest, kind):
        """Return a result dict for one file."""
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            res = {"status": "skipped", "bytes": os.path.getsize(dest), "path": os.path.relpath(dest, ROOT)}
            if kind == "glb":
                res["sha256"] = sha256_of(dest)
            return res

        os.makedirs(os.path.dirname(dest), exist_ok=True)
        part = dest + ".part"
        last_err = None
        last_status = None

        for attempt in range(1, self.retries + 1):
            self._throttle()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
                with self.opener.open(req, timeout=self.timeout) as resp:
                    last_status = resp.status
                    total = 0
                    with open(part, "wb") as out:
                        while True:
                            buf = resp.read(CHUNK)
                            if not buf:
                                break
                            out.write(buf)
                            total += len(buf)
                if total == 0:
                    raise ValueError("empty response body")

                if kind == "glb":
                    ok, why = validate_glb(part)
                    if not ok:
                        os.remove(part)
                        last_err = "invalid glb: %s" % why
                        if attempt < self.retries:
                            continue
                        return {"status": "failed", "error": last_err, "httpStatus": last_status}

                os.replace(part, dest)
                self.files += 1
                self.bytes += total
                res = {"status": "ok", "bytes": total, "httpStatus": last_status,
                       "path": os.path.relpath(dest, ROOT)}
                if kind == "glb":
                    res["sha256"] = sha256_of(dest)
                if self.files % 25 == 0:
                    print("[%s] %d files, %.1f MB" % (
                        datetime.now().strftime("%H:%M:%S"), self.files, self.bytes / 1048576.0), flush=True)
                return res

            except urllib.error.HTTPError as exc:
                last_status = exc.code
                last_err = "HTTP %d %s" % (exc.code, exc.reason)
                if exc.code in (403, 404, 401, 410):
                    break  # not retryable
                if exc.code < 500 and exc.code != 429:
                    break
            except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, ValueError, OSError) as exc:
                last_err = "%s: %s" % (type(exc).__name__, exc)

            if os.path.exists(part):
                try:
                    os.remove(part)
                except OSError:
                    pass
            if attempt < self.retries:
                time.sleep(min(30, 2 ** attempt))

        return {"status": "failed", "error": last_err, "httpStatus": last_status}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--proxy", action="store_true", help="route through the Oxylabs residential endpoint")
    ap.add_argument("--limit", type=int, default=0, help="only process the first N components (smoke test)")
    ap.add_argument("--delay", type=float, default=DELAY, help="seconds between requests")
    ap.add_argument("--no-gltf", action="store_true")
    ap.add_argument("--no-preview", action="store_true")
    ap.add_argument("--report", default=REPORT)
    args = ap.parse_args()

    with open(CATALOG, "r", encoding="utf-8") as fh:
        catalog = json.load(fh)

    tasks = []
    no_model = []
    for product in catalog["products"]:
        rel = safe_rel(product.get("localDir", ""))
        for comp in product.get("components", []):
            entry = {
                "productId": product.get("id"),
                "productName": nfc(product.get("name")),
                "componentId": comp.get("id"),
                "stem": nfc(comp.get("stem") or comp.get("id")),
                "localDir": nfc(product.get("localDir", "")),
                "urlKind": comp.get("urlKind"),
                "status": comp.get("status"),
            }
            if not comp.get("glbUrl"):
                entry["result"] = "skipped-no-model"
                no_model.append(entry)
                continue
            entry["_rel"] = rel
            entry["_urls"] = {"glb": comp.get("glbUrl"), "gltf": comp.get("gltfUrl"), "png": comp.get("previewUrl")}
            tasks.append(entry)

    if args.limit:
        tasks = tasks[: args.limit]

    print("components with a model: %d   without: %d" % (len(tasks), len(no_model)), flush=True)

    dl = Downloader(build_opener(args.proxy), delay=args.delay)
    started = datetime.now(timezone.utc)
    t0 = time.monotonic()

    results = []
    counts = {k: {"ok": 0, "skipped": 0, "failed": 0, "bytes": 0} for k in ("glb", "gltf", "png")}
    forbidden = {"glb": 0, "gltf": 0, "png": 0}
    failures = []

    for i, entry in enumerate(tasks, 1):
        rel, urls = entry.pop("_rel"), entry.pop("_urls")
        base = os.path.join(ASSETS, rel, entry["stem"])
        wanted = [("glb", urls["glb"], base + ".glb")]
        if not args.no_gltf and urls.get("gltf"):
            wanted.append(("gltf", urls["gltf"], base + ".gltf"))
        if not args.no_preview and urls.get("png"):
            wanted.append(("png", urls["png"], base + ".png"))

        for kind, url, dest in wanted:
            res = dl.fetch(url, dest, kind)
            res["url"] = url
            entry[kind] = res
            c = counts[kind]
            c[res["status"]] += 1
            c["bytes"] += res.get("bytes", 0)
            if res["status"] == "failed":
                if res.get("httpStatus") == 403:
                    forbidden[kind] += 1
                failures.append({
                    "kind": kind, "stem": entry["stem"], "localDir": entry["localDir"],
                    "componentId": entry["componentId"], "url": url,
                    "httpStatus": res.get("httpStatus"), "error": res.get("error"),
                })
        entry["result"] = "ok" if entry["glb"]["status"] in ("ok", "skipped") else "failed"
        results.append(entry)

        if i % 100 == 0:
            print("[progress] component %d/%d  (%d files, %.1f MB)" % (
                i, len(tasks), dl.files, dl.bytes / 1048576.0), flush=True)

    finished = datetime.now(timezone.utc)
    report = {
        "startedAt": started.isoformat(),
        "finishedAt": finished.isoformat(),
        "durationSec": round(time.monotonic() - t0, 1),
        "proxy": bool(args.proxy),
        "totals": {
            "componentsTotal": len(tasks) + len(no_model),
            "componentsWithModel": len(tasks),
            "componentsWithoutModel": len(no_model),
            "filesDownloadedThisRun": dl.files,
            "bytesDownloadedThisRun": dl.bytes,
            "perKind": counts,
            "forbidden403": forbidden,
            "failures": len(failures),
        },
        "failures": failures,
        "components": results + no_model,
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)

    print("\ndone in %.1f s" % report["durationSec"], flush=True)
    print("downloaded this run: %d files, %.2f GB" % (dl.files, dl.bytes / 1073741824.0), flush=True)
    for kind in ("glb", "gltf", "png"):
        c = counts[kind]
        print("  %-4s ok=%d skipped=%d failed=%d (403: %d)  %.2f GB on disk this run" % (
            kind, c["ok"], c["skipped"], c["failed"], forbidden[kind], c["bytes"] / 1073741824.0), flush=True)
    print("report: %s" % args.report, flush=True)


if __name__ == "__main__":
    main()
