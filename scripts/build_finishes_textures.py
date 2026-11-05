"""finishes-textures.raw.json + 다운로드 리포트 → data/finishes-textures.json (웹앱용)"""
import json, os, sys, io, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")
nfc = lambda s: unicodedata.normalize("NFC", s or "")

raw = json.load(open(os.path.join(D, "finishes-textures.raw.json"), encoding="utf-8"))
rep = json.load(open(os.path.join(D, "finishes-textures-report.json"), encoding="utf-8"))
local = {e["id"]: {k: v for k, v in e["files"].items() if v["status"] in ("ok", "skip")}
         for g in ("finishes", "materials") for e in rep[g]}

def tree(cats):
    out = {}
    for cid, c in cats.items():
        parts, seen, cur = [], set(), cid
        while cur and cur in cats and cur not in seen:
            seen.add(cur); parts.append(nfc(cats[cur]["name"])); cur = cats[cur]["parent"]
        parts = list(reversed(parts))
        out[cid] = {"id": cid, "name": nfc(c["name"]), "parentId": c["parent"],
                    "childIds": c["children"], "path": parts, "pathLabel": " / ".join(parts)}
    return out

finishes = []
for f in raw["finishes"]:
    name = next((t["value"] for t in f.get("translatedNames", []) if t.get("code") == "ko"), f.get("name") or f["id"])
    finishes.append({
        "id": f["id"], "name": nfc(name), "categoryIds": f.get("categoryIds") or [],
        "sku": f.get("sku"), "code": f.get("code"), "showInEditor": f.get("showInEditor"),
        "mappingDimension": f.get("mappingDimension"), "salesInfo": f.get("salesInfo"),
        "renderSettings": f.get("renderSettings"),
        "remote": {k: (v or {}).get("url") for k, v in (f.get("textureImages") or {}).items() if v and v.get("url")},
        "local": {k: v["path"] for k, v in local.get(f["id"], {}).items()},
    })

materials = []
for m in raw["materials"]:
    mat = m.get("material") or {}
    materials.append({
        "id": m["id"], "name": nfc(m.get("name") or m["id"]),
        "categoryId": m.get("_categoryId"), "categories": m.get("categories") or [],
        "showInEditor": m.get("showInEditor"), "roughness": mat.get("roughness"),
        "normalScale": mat.get("normalScale"),
        "remote": {k: v["url"] for k, v in mat.items() if isinstance(v, dict) and v.get("url")},
        "local": {k: v["path"] for k, v in local.get(m["id"], {}).items()},
    })

json.dump({"finishCategories": tree(raw["finishCategories"]), "finishes": finishes,
           "textureCategories": tree(raw["textureCategories"]), "materials": materials},
          open(os.path.join(D, "finishes-textures.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"finishes {len(finishes)} (local maps {sum(len(f['local']) for f in finishes)}), "
      f"materials {len(materials)} (local maps {sum(len(m['local']) for m in materials)})")
