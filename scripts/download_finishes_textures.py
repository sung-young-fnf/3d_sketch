"""
마감재(FINISH) 51개 · 텍스처 머티리얼(TEXTURE) 26개의 이미지 맵을 내려받는다.

가구 glb 와 섞이지 않게 별도 루트에 쌓는다.
  assets/__마감재/<카테고리 경로>/<이름>__<id8>/{original,preview,albedo,normal,roughness,metalness}.png
  assets/__텍스처/<카테고리 경로>/<이름>__<id8>/{preview,color,normal,roughness,metal,...}.png

입력: data/finishes-textures.raw.json   출력: data/finishes-textures-report.json
"""

import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe(name, limit=70):
    name = BAD.sub("_", unicodedata.normalize("NFC", name or "").strip()).rstrip(". ")
    return (name or "unnamed")[:limit]


def cat_dir(cats, cid):
    parts, seen = [], set()
    while cid and cid in cats and cid not in seen:
        seen.add(cid)
        parts.append(safe(cats[cid]["name"]))
        cid = cats[cid]["parent"]
    return "/".join(reversed(parts)) or "_미분류"


def fetch(url, dest, retries=3):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "skip", os.path.getsize(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=90) as r, open(tmp, "wb") as f:
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
    raw = json.load(open(os.path.join(ROOT, "data", "finishes-textures.raw.json"), encoding="utf-8"))
    report = {"finishes": [], "materials": [], "totals": {}}
    counts = {"ok": 0, "skip": 0, "fail": 0}
    total_bytes = 0

    # ---- 마감재 ----
    fcats = raw["finishCategories"]
    for fin in raw["finishes"]:
        name = next((t["value"] for t in fin.get("translatedNames", []) if t.get("code") == "ko"),
                    fin.get("name") or fin["id"])
        cid = (fin.get("categoryIds") or [None])[0]
        folder = os.path.join(ASSETS, "__마감재", *cat_dir(fcats, cid).split("/"),
                              f"{safe(name)}__{fin['id'][:8]}")
        entry = {"id": fin["id"], "name": unicodedata.normalize("NFC", name),
                 "categoryIds": fin.get("categoryIds"), "files": {}}
        for kind, v in (fin.get("textureImages") or {}).items():
            if not v or not v.get("url"):
                continue
            ext = os.path.splitext(v["url"].split("?")[0])[1] or ".png"
            dest = os.path.join(folder, kind + ext)
            status, n = fetch(v["url"], dest)
            entry["files"][kind] = {"status": status, "bytes": n,
                                    "path": os.path.relpath(dest, ROOT).replace("\\", "/")}
            counts["ok" if status == "ok" else "skip" if status == "skip" else "fail"] += 1
            total_bytes += n
            time.sleep(0.25)
        report["finishes"].append(entry)
        print(f"[마감재] {entry['name'][:40]:42} {len(entry['files'])} maps")

    # ---- 텍스처 머티리얼 ----
    tcats = raw["textureCategories"]
    for mat in raw["materials"]:
        name = mat.get("name") or mat["id"]
        cid = mat.get("_categoryId") or (mat.get("categories") or [None])[0]
        folder = os.path.join(ASSETS, "__텍스처", *cat_dir(tcats, cid).split("/"),
                              f"{safe(name)}__{mat['id'][:8]}")
        entry = {"id": mat["id"], "name": unicodedata.normalize("NFC", name),
                 "categoryId": cid, "files": {}}
        for kind, v in (mat.get("material") or {}).items():
            if not isinstance(v, dict) or not v.get("url"):
                continue
            ext = os.path.splitext(v["url"].split("?")[0])[1] or ".png"
            dest = os.path.join(folder, safe(kind, 40) + ext)
            status, n = fetch(v["url"], dest)
            entry["files"][kind] = {"status": status, "bytes": n,
                                    "path": os.path.relpath(dest, ROOT).replace("\\", "/")}
            counts["ok" if status == "ok" else "skip" if status == "skip" else "fail"] += 1
            total_bytes += n
            time.sleep(0.25)
        report["materials"].append(entry)
        print(f"[텍스처] {entry['name'][:40]:42} {len(entry['files'])} maps")

    report["totals"] = {**counts, "bytes": total_bytes,
                        "finishes": len(report["finishes"]), "materials": len(report["materials"])}
    out = os.path.join(ROOT, "data", "finishes-textures-report.json")
    json.dump(report, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\n완료: ok {counts['ok']}, skip {counts['skip']}, fail {counts['fail']}, "
          f"{total_bytes/1e6:.1f} MB → {out}")


if __name__ == "__main__":
    main()
