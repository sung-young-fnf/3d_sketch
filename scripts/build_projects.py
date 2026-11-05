"""
data/projects.raw.json + data/projects/<pid>.json → data/projects.json (웹앱용)

렌더 상세 패널 값은 lightsettings 에서 화면 라벨에 맞게 끌어낸다.
도면은 corners/walls/items 벡터를 그대로 넘겨 웹에서 SVG 로 그린다.
"""

import io
import json
import os
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
nfc = lambda s: unicodedata.normalize("NFC", s or "")


def rel(path):
    return os.path.relpath(path, ROOT).replace("\\", "/") if path and os.path.isabs(path) else path


def polygon_area_m2(corners):
    """코너(mm)로 shoelace 면적 → m². floorplan.area 가 0 으로 와서 직접 계산한다."""
    if len(corners) < 3:
        return 0.0
    s = 0.0
    for i in range(len(corners)):
        a, b = corners[i], corners[(i + 1) % len(corners)]
        s += a["x"] * b["z"] - b["x"] * a["z"]
    return round(abs(s) / 2 / 1e6, 2)


def cover_from(images):
    for want in ("DEFAULT", "THUMBNAIL"):
        for i in images:
            if i.get("type") == want and i.get("url"):
                return i["url"]
    return next((i["url"] for i in images if i.get("url")), None)


def render_panel(light, rec):
    """lightsettings → 화면 '이미지 상세 정보' 패널 값."""
    cam = (light or {}).get("camera") or {}
    lig = (light or {}).get("light") or {}
    t = lig.get("time")  # 분 단위
    hh, mm = (t // 60, t % 60) if isinstance(t, (int, float)) else (None, None)
    res = rec.get("resolution") or cam.get("resolution") or {}
    return {
        "resolution": f"{int(res.get('x', 0))} X {int(res.get('y', 0))}" if res else None,
        "cameraHeightMm": round(cam.get("position", {}).get("y")) if cam.get("position") else None,
        "cameraClip": cam.get("near"),
        "fov": cam.get("fov"),
        "aspect": f"{int(res.get('x', 0))}:{int(res.get('y', 0))}" if res else None,
        "sun": {"year": lig.get("year"), "month": lig.get("month"),
                "time": f"{hh:02d}:{mm:02d}" if hh is not None else None,
                "intensity": lig.get("intensity"), "orientation": lig.get("orientation")},
        "indirectIntensity": lig.get("interiorLightIntensity"),
        "world": {"temperature": lig.get("worldTemperature"),
                  "intensity": lig.get("worldLightIntensity"),
                  "rotation": lig.get("orientation")},
        "interiorTemperature": lig.get("interiorTemperature"),
    }


def main():
    raw = json.load(open(os.path.join(DATA, "projects.raw.json"), encoding="utf-8"))
    pdir = os.path.join(DATA, "projects")

    folder_of = raw.get("folderOf") or {}
    projects = []
    skipped = []
    for p in raw["active"]["content"]:
        pid = p["id"]
        rec_path = os.path.join(pdir, pid + ".json")
        if not os.path.exists(rec_path):
            # 상세를 아직 안 받은 프로젝트(TODO.md) — 목록에 빈 카드로 내지 않는다
            skipped.append(nfc(p["name"]))
            continue
        rec = json.load(open(rec_path, encoding="utf-8"))
        detail = (rec.get("detail") or {}).get("data") or {}

        floors = []
        for f in detail.get("floorplans") or []:
            corners = [{"id": c.get("archiId"),
                        "x": c["position"]["x"], "z": c["position"]["z"]}
                       for c in f.get("corners") or [] if c.get("position")]
            floors.append({
                "id": f.get("id"), "title": nfc(f.get("title")),
                "areaM2": polygon_area_m2(corners), "fpImageScale": f.get("fpImageScale"),
                "dimensions": f.get("dimensions"),
                "corners": corners,
                "walls": [{"corners": w.get("corners")} for w in f.get("walls") or []],
                "items": [{"productId": it.get("productId"),
                           "x": it["position"]["x"], "z": it["position"]["z"],
                           "ry": (it.get("rotation") or {}).get("y", 0),
                           "code": ((it.get("meta") or {}).get("editorType") or {}).get("code")}
                          for it in f.get("items") or [] if it.get("position")],
                "columns": len(f.get("columns") or []),
            })

        lights = rec.get("lightSettings") or {}
        folder_abs = os.path.join(ROOT, *(rec.get("localDir") or "").split("/"))
        renders = []
        n_i = 0
        for r in (rec.get("renders") or {}).get("renderings", []):
            if r.get("status") != 2:
                continue
            iid = r["_id"]
            n_i += 1
            thumb_file = os.path.join(folder_abs, f"render_{n_i}__{iid}.jpg")
            renders.append({
                "id": iid, "resolution": r.get("resolution"),
                "title": (r.get("comment") or {}).get("title"),
                "createdAt": r.get("createdAt"), "floorplanId": r.get("floorplanId"),
                "thumb": f"https://resources.archisketch.com/images/{iid}/550xAUTO/{iid}.png",
                "thumbLocal": rel(thumb_file) if os.path.exists(thumb_file) else None,
                "full": f"https://resources.archisketch.com/images/{iid}/{int((r.get('resolution') or {}).get('x', 0))}x{int((r.get('resolution') or {}).get('y', 0))}/{iid}.png",
                "panel": render_panel(lights.get(iid), r),
                "tags": [{"productId": t.get("productId"), "productType": t.get("productType")}
                         for t in (r.get("items") or [])],
            })

        folder = rec.get("localDir")
        projects.append({
            "id": pid, "name": nfc(p["name"]).strip(),
            "folderId": folder_of.get(pid),
            "cover": cover_from(p.get("images") or []),
            "coverLocal": rel(rec.get("coverLocal")),
            "owner": p.get("ownerUser"),
            "sharedWith": p.get("projectAccessUsers") or [],
            "bookmarked": p.get("bookmarked", False),
            "createdAt": p.get("createdAt"), "updatedAt": p.get("updatedAt"),
            "floorCount": len(floors),
            "areaM2": round(sum(f["areaM2"] for f in floors), 2) if floors else None,
            "floors": floors,
            "renders": renders,
            "renderCount": len(renders),
            "counts": {
                "render": len((rec.get("renders") or {}).get("renderings", [])),
                "aiSnap": len((rec.get("aiSnaps") or {}).get("renderings", [])),
                "tour": len((rec.get("tours") or {}).get("tours", [])),
                "styler": len((rec.get("styler") or {}).get("data", [])),
                "bundle": len((rec.get("bundles") or {}).get("data", [])),
                "portfolio": len(rec.get("portfolio") or []),
                "estimate": len((rec.get("estimates") or {}).get("estimates", [])),
            },
            "localDir": folder,
        })

    out = {
        "enterpriseId": raw.get("enterpriseId"),
        "folders": raw.get("folders"),
        "trashCount": (raw.get("trash") or {}).get("totalCount", 0),
        "totalCount": (raw.get("active") or {}).get("totalCount", len(projects)),
        "projects": projects,
    }
    if skipped:
        print(f"상세 미수집 {len(skipped)}개 제외 (TODO.md)")
    json.dump(out, open(os.path.join(DATA, "projects.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    r_tot = sum(p["renderCount"] for p in projects)
    f_tot = sum(p["floorCount"] for p in projects)
    print(f"projects {len(projects)}  층 {f_tot}  렌더(완료) {r_tot}  휴지통 {out['trashCount']}")
    for p in projects[:4]:
        print(f"  {p['name'][:18]:18} 층{p['floorCount']} 렌더{p['renderCount']} "
              f"면적{p['areaM2']}  공유{len(p['sharedWith'])}")


if __name__ == "__main__":
    main()
