"""
data/*.raw.json → data/categories.json, data/catalog.json

둘 다 다운로더와 웹앱이 같이 읽는다. 로컬 저장 경로(localDir/stem)도 여기서 한 번만 정해
다운로더와 웹앱이 어긋나지 않게 한다.
"""

import csv
import json
import os
import re
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
ROOT_CATEGORY = "ZtDxN2vF95C5BA5F88B48D5"  # "F&F"
BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def nfc(s):
    return unicodedata.normalize("NFC", s or "")


def safe(name, limit=80):
    name = BAD.sub("_", nfc(name).strip()).rstrip(". ")
    return (name or "unnamed")[:limit]


def main():
    raw_cats = json.load(open(os.path.join(DATA, "categories.raw.json"), encoding="utf-8"))
    products = json.load(open(os.path.join(DATA, "products.raw.json"), encoding="utf-8"))
    manifest = {}
    with open(os.path.join(DATA, "furniture-manifest.csv"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            manifest[r["component_id"]] = r

    # ---- 카테고리 ----
    def names(cid):
        out, seen = [], set()
        while cid and cid in raw_cats and cid not in seen:
            seen.add(cid)
            out.append(nfc(raw_cats[cid]["name"]))
            cid = raw_cats[cid]["parent"]
        return list(reversed(out))

    cats = {}
    for cid, c in raw_cats.items():
        parts = names(cid)
        cats[cid] = {
            "id": cid,
            "name": nfc(c["name"]),
            "parentId": c["parent"],
            "childIds": c["children"],
            "path": parts,
            "pathLabel": " / ".join(parts),
            "dir": "/".join(safe(p) for p in parts),
            "depth": len(parts) - 1,
            "productCount": 0,
            "descendantProductCount": 0,
        }

    # ---- 제품 ----
    items = []
    for p in products:
        pcats = [c for c in (p.get("categoryIds") or []) if c in cats]
        primary = pcats[0] if pcats else None
        comps = []
        for c in p["components"]["records"]:
            m = manifest.get(c["id"], {})
            stem = f'{safe(nfc(p["name"]), 60)}__{c["id"][:8]}'
            d = c.get("dimension") or {}
            comps.append({
                "id": c["id"],
                "order": c.get("order", 0),
                "options": c.get("options") or [],
                "price": c.get("price") or {},
                "modelingId": m.get("modeling_id") or "",
                "status": (c.get("modeling") or {}).get("renderingStatus"),
                "urlKind": m.get("url_kind") or "no-model",
                "glbUrl": m.get("glb_url") or "",
                "gltfUrl": m.get("gltf_url") or "",
                "previewUrl": c.get("previewImage") or "",
                "dimensionMm": {
                    "w": d.get("mmWidth"), "d": d.get("mmDepth"), "h": d.get("mmHeight"),
                },
                "stem": stem,
            })
        items.append({
            "id": p["id"],
            "name": nfc(p["name"]),
            "categoryIds": pcats,
            "primaryCategoryId": primary,
            "localDir": cats[primary]["dir"] if primary else "_미분류",
            "previewUrl": p.get("previewImage") or "",
            "tags": p.get("tags") or [],
            "createdAt": p.get("createdAt"),
            "updatedAt": p.get("updatedAt"),
            "components": comps,
        })

    # 카테고리별 제품 수.
    # 한 제품이 여러 카테고리에 속하므로 하위 포함 집계는 **제품 id 집합**으로 센다.
    # 단순 합산하면 중복이 섞여 제품 1,745개인데 3,563 같은 수가 나온다.
    direct = {cid: set() for cid in cats}
    for it in items:
        for cid in it["categoryIds"]:
            direct[cid].add(it["id"])
    for cid in cats:
        cats[cid]["productCount"] = len(direct[cid])

    def roll(cid, seen=None):
        acc = set(direct[cid])
        for ch in cats[cid]["childIds"]:
            if ch in cats:
                acc |= roll(ch)
        cats[cid]["descendantProductCount"] = len(acc)
        return acc

    roll(ROOT_CATEGORY)

    json.dump(
        {"rootId": ROOT_CATEGORY, "categories": cats},
        open(os.path.join(DATA, "categories.json"), "w", encoding="utf-8"),
        ensure_ascii=False,
    )
    json.dump(
        {"enterpriseId": "ZtDxN1y583722F9F0E74FA2", "products": items},
        open(os.path.join(DATA, "catalog.json"), "w", encoding="utf-8"),
        ensure_ascii=False,
    )

    downloadable = sum(1 for i in items for c in i["components"] if c["glbUrl"])
    print(f"categories {len(cats)}  products {len(items)}  "
          f"components {sum(len(i['components']) for i in items)}  downloadable {downloadable}")


if __name__ == "__main__":
    main()
