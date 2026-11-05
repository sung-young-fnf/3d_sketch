"""
.gltf 의 외부 참조 파일(.bin, 텍스처 .png/.jpg)을 마저 받는다.

왜 필요한가
  받아둔 .gltf 는 전부 외부 참조다 (buffers[].uri 로 .bin, images[].uri 로 .png).
  그 사이드카가 없으면 .gltf 는 단독으로 열리지 않는다. .glb 는 자체 포함이라 멀쩡하다.

URL 은 어떻게 만드나
  catalog.json 의 gltfUrl 디렉터리가 그대로 CDN 상의 기준 경로다.
    gltfUrl = https://resources.archisketch.com/modelings/{mid}/RENDER/{ts}/{mid}.gltf
    sidecar = https://resources.archisketch.com/modelings/{mid}/RENDER/{ts}/{uri}
  uri 는 URL 인코딩돼 있을 수 있으므로 디코드해서 로컬 경로로, 인코드해서 요청에 쓴다.

재개 가능하고 멱등하다. 결과: data/sidecar-report.json
"""

import argparse
import collections
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")


def refs(gltf_path):
    """gltf 가 참조하는 상대 uri 목록. data: 와 절대 URL 은 뺀다."""
    try:
        d = json.load(open(gltf_path, encoding="utf-8"))
    except Exception:
        return None
    out = []
    for coll in ("buffers", "images"):
        for item in d.get(coll, []):
            u = item.get("uri")
            if not u or u.startswith("data:") or "://" in u:
                continue
            out.append(u)
    return out


def fetch(url, dest, timeout=90, retries=3):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r, open(tmp, "wb") as f:
                while True:
                    chunk = r.read(1 << 16)
                    if not chunk:
                        break
                    f.write(chunk)
            os.replace(tmp, dest)
            return "ok", os.path.getsize(dest)
        except urllib.error.HTTPError as e:
            if os.path.exists(tmp):
                os.remove(tmp)
            return f"http{e.code}", 0
        except Exception:
            if attempt == retries - 1:
                if os.path.exists(tmp):
                    os.remove(tmp)
                return "error", 0
            time.sleep(2 ** attempt)
    return "error", 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sleep", type=float, default=0.2)
    ap.add_argument("--limit", type=int, default=0, help="gltf 몇 개만 처리 (시험용)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    catalog = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))
    # 로컬 gltf 경로 -> 원본 gltf URL
    base_of = {}
    for p in catalog["products"]:
        for c in p["components"]:
            if not c.get("gltfUrl"):
                continue
            local = os.path.join(ASSETS, *p["localDir"].split("/"), c["stem"] + ".gltf")
            base_of[os.path.normcase(local)] = c["gltfUrl"].rsplit("/", 1)[0] + "/"

    gltfs = []
    for dp, _, fs in os.walk(ASSETS):
        for f in fs:
            if f.lower().endswith(".gltf"):
                gltfs.append(os.path.join(dp, f))
    gltfs.sort()
    if a.limit:
        gltfs = gltfs[: a.limit]
    print(f"gltf {len(gltfs)}개 처리")

    counts = collections.Counter()
    total = 0
    no_base = []
    for i, g in enumerate(gltfs, 1):
        base = base_of.get(os.path.normcase(g))
        if not base:
            no_base.append(os.path.relpath(g, ROOT))
            counts["no_base_url"] += 1
            continue
        uris = refs(g)
        if uris is None:
            counts["unparsable_gltf"] += 1
            continue
        for uri in uris:
            rel = urllib.parse.unquote(uri)
            dest = os.path.join(os.path.dirname(g), *rel.split("/"))
            if os.path.exists(dest) and os.path.getsize(dest) > 0:
                counts["skip"] += 1
                continue
            if a.dry_run:
                counts["would_fetch"] += 1
                continue
            url = base + urllib.parse.quote(rel)
            status, n = fetch(url, dest)
            counts[status] += 1
            total += n
            time.sleep(a.sleep)
        if i % 50 == 0:
            print(f"  {i}/{len(gltfs)}  ok {counts['ok']}  skip {counts['skip']}  "
                  f"{total/1e6:.0f} MB", flush=True)

    print(f"\n{dict(counts)}  합계 {total/1e6:.1f} MB")
    if no_base:
        print(f"기준 URL 을 못 찾은 gltf {len(no_base)}건 (예: {no_base[:3]})")

    # 끝난 뒤 실제로 온전해졌는지 다시 센다
    complete = broken = 0
    for g in gltfs:
        uris = refs(g)
        if uris is None:
            broken += 1
            continue
        if all(os.path.exists(os.path.join(os.path.dirname(g), *urllib.parse.unquote(u).split("/")))
               for u in uris):
            complete += 1
        else:
            broken += 1
    print(f"단독 사용 가능한 gltf: {complete}/{len(gltfs)}  (불완전 {broken})")

    json.dump({"counts": dict(counts), "bytes": total, "gltf_total": len(gltfs),
               "gltf_complete": complete, "gltf_broken": broken, "no_base_url": no_base},
              open(os.path.join(ROOT, "data", "sidecar-report.json"), "w", encoding="utf-8"),
              ensure_ascii=False)


if __name__ == "__main__":
    main()
