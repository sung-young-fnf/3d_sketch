"""
프로젝트 도면(아키스케치 floorplans) → three.js 매장 씬 데이터.  docs/store-assembly.md 참고.

입력
  data/projects/<pid>.json        collect_projects.py 결과 (도면 벡터 + 렌더 + lightsettings)
  data/catalog.json               가구 라이브러리 → 로컬 glb
  assets/__프로젝트/<..>/custom/   fetch_custom_items.py 결과 (프로젝트 전용 gltf)
  data/drawings/<pid>.json        (선택) 준공도면 PNG + 외곽선 보정값
  data/vmd-slots/<pid>.json       (선택) 렌더 시점별 교체 슬롯 규칙 → shots[].slots
출력
  data/scenes/<pid>.json

좌표: 아키스케치 그대로 mm, Y-up, 바닥 = XZ 평면. 웹에서 1/1000 해서 m 로 쓴다.
"""

import argparse
import io
import json
import math
import os
import struct
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
nfc = lambda s: unicodedata.normalize("NFC", s or "")

EXTERIOR_M2 = 1000  # 이보다 큰 방은 부지/외부로 보고 버린다 (명동 1F 에 92×74 m 방이 있다)


def rel(path):
    return os.path.relpath(path, ROOT).replace("\\", "/")


def glb_bbox(path):
    """glb 의 로컬 바운딩박스(mm). 원점이 바닥인지 중심인지 모델마다 달라서 필요하다.
    라이브러리 glb 는 mm 정점 + 루트 노드 scale 0.001 = 로드하면 m."""
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    return _bbox(json.loads(b[20:20 + n]), to_mm=1000)


def gltf_bbox(path):
    """프로젝트 전용 gltf 는 mm 정점, 노드 scale 없음 = 로드하면 mm."""
    return _bbox(json.load(open(path, encoding="utf-8")), to_mm=1)


def _bbox(j, to_mm):
    # 루트 노드 scale 만 반영한다 (하위 노드 transform 은 두 계열 모두 비어 있다).
    s = 1.0
    for node in j.get("nodes", []):
        if node.get("scale"):
            s = node["scale"][0]
            break
    mn, mx = [1e18] * 3, [-1e18] * 3
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            a = j["accessors"][p["attributes"]["POSITION"]]
            for i in range(3):
                mn[i] = min(mn[i], a["min"][i])
                mx[i] = max(mx[i], a["max"][i])
    unit = s * to_mm
    return [v * unit for v in mn], [v * unit for v in mx], s


def item_matrix(it):
    """아이템 월드 행렬 (column-major, mm) = T(position) · Rᵀ · S.

    - position/rotation/scale 은 이미 월드 값이다. 그룹(groupsV2) 안 아이템도 그렇다.
      localTransform 은 그룹 기준 상대값이라 그룹 안에서는 쓰면 안 된다.
    - 아키스케치 회전은 three.js(glTF) 기준과 부호가 반대다. 같은 Euler 로 만든 회전의
      전치(=역회전)를 써야 렌더샷과 겹친다 (docs/store-assembly.md §3).
    """
    r, s, p = it["rotation"], it["scale"], it["position"]
    cx, sx_ = math.cos(r["x"]), math.sin(r["x"])
    cy, sy_ = math.cos(r["y"]), math.sin(r["y"])
    cz, sz_ = math.cos(r["z"]), math.sin(r["z"])
    rx = [[1, 0, 0], [0, cx, -sx_], [0, sx_, cx]]
    ry = [[cy, 0, sy_], [0, 1, 0], [-sy_, 0, cy]]
    rz = [[cz, -sz_, 0], [sz_, cz, 0], [0, 0, 1]]
    mul = lambda a, b: [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    rot = mul(mul(rx, ry), rz)  # three.js Euler 'XYZ'
    rt = [[rot[j][i] for j in range(3)] for i in range(3)]  # 전치
    sc = [s["x"], s["y"], s["z"]]
    m = [[rt[i][j] * sc[j] for j in range(3)] for i in range(3)]
    return [m[0][0], m[1][0], m[2][0], 0, m[0][1], m[1][1], m[2][1], 0,
            m[0][2], m[1][2], m[2][2], 0, p["x"], p["y"], p["z"], 1]


def poly_area_m2(pts):
    a = 0.0
    for i in range(len(pts)):
        (x1, z1), (x2, z2) = pts[i], pts[(i + 1) % len(pts)]
        a += x1 * z2 - x2 * z1
    return abs(a) / 2 / 1e6


def project_to_shot(shot, p):
    """mm world point → (u, v, depth) in the shot frame: u,v in 0..1 from top-left, None if behind the clip."""
    x, y, z, w = shot["quaternion"]
    v = [p[i] - shot["position"][i] for i in range(3)]
    # rotate by the inverse camera quaternion
    qx, qy, qz = -x, -y, -z
    tx, ty, tz = 2 * (qy * v[2] - qz * v[1]), 2 * (qz * v[0] - qx * v[2]), 2 * (qx * v[1] - qy * v[0])
    cx = v[0] + w * tx + (qy * tz - qz * ty)
    cy = v[1] + w * ty + (qz * tx - qx * tz)
    cz = v[2] + w * tz + (qx * ty - qy * tx)
    if -cz <= shot["near"]:
        return None
    f = 1 / math.tan(math.radians(shot["fov"]) / 2)
    sx, sy = cx / -cz * f / shot["aspect"], cy / -cz * f
    return (sx + 1) / 2, (1 - sy) / 2, -cz


def assign_slots(shots, floors_out, conf):
    """렌더 시점별 교체 슬롯: 규칙(이름 + 화면 영역)에 맞는 아이템을 화면 왼쪽→오른쪽 순서로 번호 매김.

    data/vmd-slots/<pid>.json
      { "rules": [ { "shot": 1, "prefix": "L", "label": "왼쪽 벽 행거",
                     "names": ["옷걸이&맨투맨"], "u": [0, 0.3], "v": [0, 1] } ] }
    shot 은 렌더 시점 번호(1부터). 아이템 중심이 화면 안(u,v 범위)에 있어야 한다.
    """
    for rule in conf.get("rules", []):
        shot = shots[rule["shot"] - 1]
        fl = next(f for f in floors_out if f["id"] == shot["floorId"])
        u0, u1 = rule.get("u", [0, 1])
        v0, v1 = rule.get("v", [0, 1])
        found = []
        for it in fl["items"]:
            if it.get("renderHidden") or it["name"] not in rule["names"]:
                continue
            m = it["matrix"]
            uv = project_to_shot(shot, (m[12], m[13] + fl["level"], m[14]))
            if uv and u0 <= uv[0] <= u1 and v0 <= uv[1] <= v1:
                found.append((uv[0], uv[2], it["id"]))
        found.sort()
        slots = shot.setdefault("slots", [])
        for n, (_, _, item_id) in enumerate(found, 1):
            slots.append({"id": f"{rule['prefix']}{n:02d}", "itemId": item_id, "label": rule.get("label", "")})
        print(f"렌더 #{rule['shot']} 슬롯 {rule['prefix']}01~{rule['prefix']}{len(found):02d} ({rule.get('label', '')})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project_id")
    a = ap.parse_args()
    pid = a.project_id

    rec = json.load(open(os.path.join(DATA, "projects", pid + ".json"), encoding="utf-8"))
    proj_dir = rec["localDir"]  # assets/__프로젝트/<name>__<id8>
    detail = rec["detail"]["data"]

    # ---- 가구 라이브러리: product id / component id → 로컬 glb
    catalog = json.load(open(os.path.join(DATA, "catalog.json"), encoding="utf-8"))["products"]
    lib = {}
    for p in catalog:
        for c in p.get("components") or []:
            path = os.path.join(ROOT, "assets", *p["localDir"].split("/"), c["stem"] + ".glb")
            entry = {"name": nfc(p["name"]), "path": path, "dim": c.get("dimensionMm")}
            lib.setdefault(p["id"], entry)  # product id → 첫 컴포넌트
            lib[c["id"]] = entry

    bbox_cache = {}

    def bbox(path, kind):
        if path not in bbox_cache:
            bbox_cache[path] = glb_bbox(path) if kind == "glb" else gltf_bbox(path)
        return bbox_cache[path]

    drawings = {}
    dpath = os.path.join(DATA, "drawings", pid + ".json")
    if os.path.exists(dpath):
        dconf = json.load(open(dpath, encoding="utf-8"))
        for pg in dconf["pages"]:
            pg["url"] = f"{proj_dir}/{pg['file']}"
            if pg.get("floor"):
                drawings[pg["floor"]] = pg
        gallery = dconf["pages"]
    else:
        gallery = []

    floors_out = []
    level = 0.0
    stats = {"items": 0, "lib": 0, "custom": 0, "missing": 0}
    for f in detail["floorplans"]:
        C = {c["archiId"]: (c["position"]["x"], c["position"]["z"]) for c in f["corners"]}

        rooms = []
        for r in f["rooms"]:
            pts = [C[c] for c in r["corners"] if c in C]
            # 연속 중복점 제거 (명동 1F 방에 같은 점이 두 번 들어 있다)
            pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
            if len(pts) < 3 or poly_area_m2(pts) > EXTERIOR_M2:
                continue
            fin = r.get("finish") or {}
            rooms.append({"points": pts, "height": r.get("height"), "hideCeiling": r.get("hideCeiling"),
                          "color": fin.get("color") or "eeeeee", "finishId": fin.get("productId")})
        if not rooms:
            continue
        xs = [p[0] for r in rooms for p in r["points"]]
        zs = [p[1] for r in rooms for p in r["points"]]
        box = (min(xs) - 1000, min(zs) - 1000, max(xs) + 1000, max(zs) + 1000)
        inside = lambda p: box[0] <= p[0] <= box[2] and box[1] <= p[1] <= box[3]

        walls = []
        for w in f["walls"]:
            if not all(c in C for c in w["corners"]):
                continue
            pa, pb = C[w["corners"][0]], C[w["corners"][1]]
            if not (inside(pa) and inside(pb)) or (w.get("height") or 0) < 10:
                continue  # 부지 외벽 · 높이 2 mm 짜리 가상 경계선
            fins = w.get("finishes") or []
            walls.append({"a": pa, "b": pb, "thickness": w.get("thickness") or 200,
                          "height": w.get("height"), "openings": w.get("openings") or [],
                          "color": (fins[0].get("color") if fins else None) or "f2f2f2"})

        items, missing = [], {}
        for it in f.get("items") or []:
            if it.get("visible") is False:
                continue
            stats["items"] += 1
            if it.get("customPath"):
                path = os.path.join(ROOT, *proj_dir.split("/"), "custom", *it["customPath"].split("/"))
                kind, name = "gltf", (lib.get(it["productId"]) or {}).get("name", "전용 가구")
            else:
                e = lib.get(it["productId"])
                path, kind, name = (e["path"], "glb", e["name"]) if e else (None, None, None)
            if not path or not os.path.exists(path):
                stats["missing"] += 1
                missing[it["productId"]] = missing.get(it["productId"], 0) + 1
                continue
            stats["custom" if kind == "gltf" else "lib"] += 1
            mn, mx, _ = bbox(path, kind)
            items.append({
                "id": it["archiId"], "productId": it["productId"], "name": name, "kind": kind,
                "url": rel(path),
                "matrix": item_matrix(it),  # column-major, mm, world
                # 배치 기준점은 모델 바운딩박스 중심이다 (§3). 웹에서 -center 만큼 옮긴 뒤 matrix 를 곱한다.
                "center": [(mn[i] + mx[i]) / 2 for i in range(3)],
                "size": [mx[i] - mn[i] for i in range(3)],
                # 이름에 '(렌더링x)' = 에디터 보조물(조명 위치 표시 등). 렌더에 안 나온다.
                "renderHidden": "렌더링x" in (name or "").replace(" ", "").lower(),
            })

        title = nfc(f.get("title"))
        floors_out.append({
            "id": f["id"], "archiId": f.get("archiId"), "title": title, "level": level,
            "height": max((r["height"] or 0) for r in rooms) or f.get("floorHeight"),
            "rooms": rooms, "walls": walls, "items": items,
            "missing": [{"productId": k, "count": v} for k, v in missing.items()],
            "drawing": drawings.get(title),
        })
        # 다음 층 바닥 = 이 층 방 높이 (+ 슬래브). floorHeight 는 2F 에서 2300 으로 엉뚱하게 와서 쓰지 않는다.
        level += floors_out[-1]["height"] + (f.get("slabThickness") or 0)

    # ---- 렌더샷 카메라 (lightsettings.camera 가 정확한 값: position mm + quaternion + fov)
    # 렌더의 floorplanId 는 floorplan 의 archiId 를 가리킨다 (id 아님)
    floor_of = {k: fl for fl in floors_out for k in (fl["id"], fl["archiId"]) if k}
    shots = []
    lights = rec.get("lightSettings") or {}
    for n, r in enumerate((rec.get("renders") or {}).get("renderings", []), 1):
        if r.get("status") != 2:
            continue
        cam = (lights.get(r["_id"]) or {}).get("camera") or {}
        if not cam.get("position") or not cam.get("quaternion"):
            continue
        q = cam["quaternion"]
        res = cam.get("resolution") or r.get("resolution") or {"x": 16, "y": 9}
        thumb = os.path.join(ROOT, *proj_dir.split("/"), f"render_{len(shots) + 1}__{r['_id']}.jpg")
        fl = floor_of.get(r.get("floorplanId"))
        shots.append({
            "id": r["_id"], "floorId": fl["id"] if fl else None,
            "title": (r.get("comment") or {}).get("title") or f"렌더 {len(shots) + 1}",
            "thumb": rel(thumb) if os.path.exists(thumb) else None,
            "position": [cam["position"]["x"], cam["position"]["y"] + (fl["level"] if fl else 0),
                         cam["position"]["z"]],
            "quaternion": [q["x"], q["y"], q["z"], q["w"]] if isinstance(q, dict) else q,
            "fov": cam.get("fov", 60), "aspect": res["x"] / res["y"],
            # 카메라 클립: 이 거리 안쪽은 렌더에서 잘려 나간다. 바깥에서 벽 너머를 찍은 컷이 많다.
            "near": cam.get("near") or 50,
        })

    spath = os.path.join(DATA, "vmd-slots", pid + ".json")
    if os.path.exists(spath):
        assign_slots(shots, floors_out, json.load(open(spath, encoding="utf-8")))

    out = {"projectId": pid, "name": nfc(rec["name"]).strip(), "units": "mm",
           "floors": floors_out, "shots": shots, "drawings": gallery}
    os.makedirs(os.path.join(DATA, "scenes"), exist_ok=True)
    json.dump(out, open(os.path.join(DATA, "scenes", pid + ".json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    for fl in floors_out:
        print(f"{fl['title']}: level {fl['level']:.0f} h {fl['height']:.0f}  방 {len(fl['rooms'])} 벽 {len(fl['walls'])} "
              f"가구 {len(fl['items'])} (누락 {sum(m['count'] for m in fl['missing'])})  도면 {'O' if fl['drawing'] else '-'}")
    print(f"가구 {stats['items']}: 라이브러리 {stats['lib']} · 전용 {stats['custom']} · 누락 {stats['missing']}  "
          f"렌더 시점 {len(shots)}  → data/scenes/{pid}.json")


if __name__ == "__main__":
    main()
