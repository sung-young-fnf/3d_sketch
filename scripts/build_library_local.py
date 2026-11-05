"""
Register the VMD products we made ourselves (data/vmd-products.json root) in the
local enterprise library, without touching the downloaded catalog.json.

Writes data/library-local.json: one product per style folder, one component
(= 컬러 option) per <스타일코드_컬러>.glb. web/src/lib/catalog.ts merges it in.

    python -X utf8 scripts/build_library_local.py
"""
import json, os, struct
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# 상품 category (first folder) -> library category  (F&F / *소품 / 의류&잡화 / ...)
CATEGORY = {
    "신발": "Z-CVDoMEE5A6F62CD714E1F",  # 신발
    "가방": "Z-CVHxV2836BEAD7E5E4F93",  # 가방
    "패딩": "aAZINB61D5DEBF1041F4081",  # 의류 / 옷걸이 (hanger-hung, like the store's 패딩)
    "착장": "Z8lrewL402DF4577ACB4629",  # 마네킹 (패딩 worn on the 토르소, docs/store-assembly.md §10)
}


def mat_mul(a, b):  # column-major 4x4
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]


def node_matrix(n):
    if "matrix" in n:
        return n["matrix"]
    tx, ty, tz = n.get("translation", [0, 0, 0])
    x, y, z, w = n.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = n.get("scale", [1, 1, 1])
    r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
         2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
         2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]
    return [r[0] * sx, r[1] * sx, r[2] * sx, 0, r[3] * sy, r[4] * sy, r[5] * sy, 0,
            r[6] * sz, r[7] * sz, r[8] * sz, 0, tx, ty, tz, 1]


def glb_size_mm(path):
    """Bounding box (w, d, h) in mm from accessor min/max under node transforms; glb is metres."""
    with open(path, "rb") as f:
        f.read(12)
        length, _ = struct.unpack("<II", f.read(8))
        gltf = json.loads(f.read(length))
    lo, hi = [1e9] * 3, [-1e9] * 3

    def visit(i, parent):
        n = gltf["nodes"][i]
        m = mat_mul(parent, node_matrix(n))
        if "mesh" in n:
            for prim in gltf["meshes"][n["mesh"]]["primitives"]:
                acc = gltf["accessors"][prim["attributes"]["POSITION"]]
                for cx in (acc["min"][0], acc["max"][0]):
                    for cy in (acc["min"][1], acc["max"][1]):
                        for cz in (acc["min"][2], acc["max"][2]):
                            p = [m[r] * cx + m[4 + r] * cy + m[8 + r] * cz + m[12 + r] for r in range(3)]
                            for k in range(3):
                                lo[k], hi[k] = min(lo[k], p[k]), max(hi[k], p[k])
        for c in n.get("children", []):
            visit(c, m)

    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    scene = gltf["scenes"][gltf.get("scene", 0)]
    for i in scene["nodes"]:
        visit(i, ident)
    w, h, d = (round((hi[k] - lo[k]) * 1000, 1) for k in range(3))
    return {"w": w, "d": d, "h": h}


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def main():
    conf = json.load(open(os.path.join(DATA, "vmd-products.json"), encoding="utf8"))
    root_rel = conf["root"].removeprefix("assets/")
    root_abs = os.path.join(ROOT, "assets", *root_rel.split("/"))
    products = []
    for cat in sorted(os.listdir(root_abs)):
        if cat not in CATEGORY:
            print("skip (no library category):", cat)
            continue
        for style in sorted(os.listdir(os.path.join(root_abs, cat))):
            d = os.path.join(root_abs, cat, style)
            glbs = sorted(f for f in os.listdir(d) if f.lower().endswith(".glb"))
            if not glbs:
                continue
            code = style.split(" ", 1)[0]
            # the same style can sit in 패딩 (hanging) and 착장 (on the 토르소): keep library ids unique
            key = f"torso-{code}" if cat == "착장" else code
            times = [os.path.getmtime(os.path.join(d, g)) for g in glbs]
            comps = []
            for order, g in enumerate(glbs):
                stem = g[:-4]
                color = stem.rsplit("_", 1)[-1]
                comps.append({
                    "id": f"local-{stem}" if key == code else f"local-torso-{stem}",
                    "order": order,
                    "options": [{"key": "컬러", "value": color}],
                    "price": {"value": 0.0, "unit": "KRW"},
                    "modelingId": None,
                    "status": "COMPLETED",
                    "urlKind": "local",
                    "glbUrl": None,
                    "gltfUrl": None,
                    "previewUrl": None,
                    "dimensionMm": glb_size_mm(os.path.join(d, g)),
                    "stem": stem,
                })
            products.append({
                "id": f"local-{key}",
                "name": style,
                "categoryIds": [CATEGORY[cat]],
                "primaryCategoryId": CATEGORY[cat],
                "localDir": f"{root_rel}/{cat}/{style}",
                "previewUrl": None,
                "tags": ["VMD 제작", cat, code],
                "createdAt": iso(min(times)),
                "updatedAt": iso(max(times)),
                "components": comps,
            })
            print(f"{cat:3} {style}: {len(comps)} colours", [c["dimensionMm"] for c in comps][:1])
    out = os.path.join(DATA, "library-local.json")
    json.dump({"note": "scripts/build_library_local.py 가 만든다. 우리가 만든 VMD 상품을 기업 라이브러리에 얹는 로컬 목록 (catalog.json 은 건드리지 않음).",
               "products": products}, open(out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("wrote", out, len(products), "products")


main()
