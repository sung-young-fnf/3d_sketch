"""
매장연출 (store display vignettes) -> data/vignettes/<projectId>.json

Each vignette rebuilds one real wall of the store from a reference photo
(assets/.../[디스커버리 명동]/매장연출/0N_*.png), assembled from 명동 library parts:
  01 패딩 월  [DX명동]벽 행거_3-2 x3 (wood back, face-out bar on the left, ledge) + [DX명동]벽걸이 행거 x3 (lower rail),
             side-hung 2 + face-out 1 | 디스커버리백팩 + 토르소 (M01, dressed torsos swap in; no loop / arm on this panel) | 2 + 1,
             12 + 1 + 12 패딩 on the lower rail - every rail / loop / arm is a rack whose count the viewer changes
  02 신발 월  흰 타공판 x3 over [DX명동]신발 진열대 하부 x4 (wood + mirror base), [DX명동]사이니지 as the TV,
             two posters (TV + posters are image slots P01-P03), and 84 운동화 on [DX명동]신발 받침 in the photo's 4x8 | 7x4 | 4x6 blocks
  03 중앙 행거  one long side (3 bays) of [DX명동]스탠드 행거, the 여성 글로시 숏패딩 MAIN photo: 2 shelves (bags, shoes, hat) +
             a side-hung rail | poster on a shelf + a rail with a face-out on an arm | a face-out bar (pink, grey) + a rail.
             Shelves and rails are levels the viewer moves up / down; slots show the photo's products (SceneSlot.product)
Parts cut out of bigger fixtures come from scripts/build_vignette_parts.py.
Hung VMD products without a hook get 부품/옷걸이 in the viewer (StoreScene.hanger).
Every product is a slot (U01, L01, S01 ...) with a category (상품 folder) and a `facing`
(yaw, deg) the swapped-in VMD product is turned to: glb products face +Z.

Coordinates: mm, wall face at z = 0, +z towards the camera, x to the right, y up.
Positions are measured on the photos (px -> mm, scale per wall below).

    python -X utf8 scripts/build_vignettes.py
"""
import json
import math
import os
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PID = "Z_qVQjfBCDE9007CAF64124"
MD = "assets/F&F/국내-명동/[디스커버리 명동]"
LIB = {
    "벽 행거_3-2": "assets/F&F/＊가구/진열장/의류 진열장/행거/[DX명동]벽 행거_3-2__8b36bb17.glb",
    "벽 행거_3-2_고리없음": f"{MD}/부품/[DX명동]벽 행거_3-2_고리없음.glb",
    "벽걸이 행거": f"{MD}/가구/[DX명동]벽걸이 행거__c6f27515.glb",
    "마네킹": f"{MD}/소품/[DX명동]마네킹__67bea515.glb",
    "사이니지": "assets/F&F/＊소품/사이니지/[DX명동]사이니지__220f5b6d.glb",
    "패딩": "assets/F&F/＊소품/의류&잡화/의류/옷걸이/패딩__76c61ed9.glb",
    "디스커버리백팩": "assets/F&F/＊소품/의류&잡화/가방/디스커버리백팩__04846390.glb",
    "운동화": "assets/F&F/＊소품/의류&잡화/신발/운동화__2459ed45.glb",
    "신발 받침": f"{MD}/부품/[DX명동]신발 받침.glb",
    "신발 진열대 하부": f"{MD}/부품/[DX명동]신발 진열대 하부.glb",
    "흰 타공판": f"{MD}/부품/흰 타공판.glb",
    "포스터_반슬리": f"{MD}/부품/포스터_반슬리.glb",
    "포스터_퍼지뮬": f"{MD}/부품/포스터_퍼지뮬.glb",
    "토르소": f"{MD}/부품/토르소.glb",
    "스탠드 행거": f"{MD}/부품/[DX명동]스탠드 행거_한면 3칸.glb",
    "스탠드 봉": f"{MD}/부품/[DX명동]스탠드 행거_봉.glb",
    "스탠드 팔": f"{MD}/부품/[DX명동]스탠드 행거_팔.glb",
    "스탠드 판": f"{MD}/부품/[DX명동]스탠드 행거_판.glb",
    "포스터_글로시": f"{MD}/부품/포스터_글로시.glb",
    "토트백": "assets/F&F/＊소품/의류&잡화/가방/가방__ZuQqjHb2.glb",
    "니트 모자": "assets/F&F/＊소품/의류&잡화/모자/나일론 모자__769a4f37.glb",
    "맨투맨": "assets/F&F/＊소품/의류&잡화/의류/옷걸이/옷걸이&맨투맨__bcd34945.glb",
    "티셔츠": "assets/F&F/＊소품/의류&잡화/의류/옷걸이/옷걸이 & 의류__ZtI__VoE.glb",
    "바지": "assets/F&F/＊소품/의류&잡화/의류/옷걸이/옷걸이 & 바지__ZtJEzVE4.glb",
}


# ------------------------------------------------------------------ glb bbox (mm)
def _mat_mul(a, b):
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]


def _node_matrix(n):
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


_boxes = {}


def bbox(rel):
    """model-space bounding box of a glb in mm (glb is metres): (lo, hi)"""
    if rel not in _boxes:
        with open(os.path.join(ROOT, rel), "rb") as f:
            f.read(12)
            n, _ = struct.unpack("<II", f.read(8))
            g = json.loads(f.read(n))
        lo, hi = [1e18] * 3, [-1e18] * 3

        def visit(i, parent):
            nd = g["nodes"][i]
            m = _mat_mul(parent, _node_matrix(nd))
            if "mesh" in nd:
                for prim in g["meshes"][nd["mesh"]]["primitives"]:
                    acc = g["accessors"][prim["attributes"]["POSITION"]]
                    for cx in (acc["min"][0], acc["max"][0]):
                        for cy in (acc["min"][1], acc["max"][1]):
                            for cz in (acc["min"][2], acc["max"][2]):
                                for k in range(3):
                                    v = (m[k] * cx + m[4 + k] * cy + m[8 + k] * cz + m[12 + k]) * 1000
                                    lo[k], hi[k] = min(lo[k], v), max(hi[k], v)
            for c in nd.get("children", []):
                visit(c, m)
        for i in g["scenes"][g.get("scene", 0)]["nodes"]:
            visit(i, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
        _boxes[rel] = (lo, hi)
    return _boxes[rel]


def web_copy(rel):
    """the light copy the viewer loads (scripts/build_product_lite.py -- items) when it is up to date, else rel"""
    ff = "assets/F&F/"
    lite = ff + "_웹/" + rel[len(ff):] if rel.startswith(ff) else None
    if lite and os.path.exists(os.path.join(ROOT, lite)) and             os.path.getmtime(os.path.join(ROOT, lite)) >= os.path.getmtime(os.path.join(ROOT, rel)):
        return lite
    return rel


def rot_y(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]]


I3 = rot_y(0)
SIDE_DEPTH = 0.5  # a side-hung VMD product is pressed to this share of its depth (viewer 옆걸이 촘촘히, on by default)
HANGER = f"{MD}/부품/옷걸이.glb"  # StoreScene.hanger: VMD clothes without a hook of their own hang on it
SHOE_ROT = rot_y(90)  # store 운동화 toe to the right, as on the real wall (VMD shoes: facing 90)


class Vignette:
    def __init__(self, key, title, photo, width, depth=6000, height=3000, floor_color="cfc8bd"):
        self.key, self.title, self.photo = key, title, photo
        self.items, self.slots, self.racks, self.levels = [], [], [], []
        hw = width / 2
        wall = lambda a, b: {"a": a, "b": b, "thickness": 300.0, "height": height, "openings": [], "color": "f4f3f0"}
        self.floor = {
            "id": f"{key}-floor", "title": title, "level": 0.0, "height": height,
            "rooms": [{"points": [[-hw, 0], [hw, 0], [hw, depth], [-hw, depth]], "height": height,
                       "hideCeiling": False, "color": floor_color}],
            # back wall (face at z = 0) and the two side walls
            "walls": [wall([-hw - 150, -150], [hw + 150, -150]), wall([-hw - 150, 0], [-hw - 150, depth]),
                      wall([hw + 150, 0], [hw + 150, depth])],
            "items": self.items, "missing": [], "drawing": None,
        }

    def put(self, part, item_id, origin, rot=I3, scale=(1, 1, 1), **extra):
        """place a library model with its model origin at `origin` (mm), turned by rot, scaled per local axis"""
        rel = LIB[part]
        lo, hi = bbox(rel)
        center = [(lo[k] + hi[k]) / 2 for k in range(3)]
        size = [hi[k] - lo[k] for k in range(3)]
        m = [[rot[r][c] * scale[c] for c in range(3)] for r in range(3)]
        pos = [origin[r] + sum(m[r][c] * center[c] for c in range(3)) for r in range(3)]
        item = {
            "id": f"{self.key}-{item_id}", "productId": part, "name": part, "kind": "glb", "url": web_copy(rel),
            "matrix": [round(v, 5) for v in (m[0][0], m[1][0], m[2][0], 0, m[0][1], m[1][1], m[2][1], 0,
                                             m[0][2], m[1][2], m[2][2], 0, pos[0], pos[1], pos[2], 1)],
            "center": center, "size": size, **extra,
        }
        self.items.append(item)
        return item

    def product(self, part, slot, label, category, origin, facing, rot=I3, scale=(1, 1, 1), default=None, **extra):
        """default: the VMD product (상품 file stem) the slot shows at first"""
        it = self.put(part, slot, origin, rot, scale, facing=facing, **extra)
        self.slots.append({"id": slot, "itemId": it["id"], "label": label, "category": category,
                           **({"product": default} if default else {})})
        return it

    def level(self, key, group, label, y, items, lo, hi, racks=(), step=50):
        """a shelf / rail the viewer moves up / down (SceneShot.levels): items (dicts from put / product) and racks
        go with it; y = its height for people, lo..hi the allowed range"""
        self.levels.append({"id": key, "group": group, "label": label, "itemIds": [it["id"] for it in items],
                            "rackIds": list(racks), "y": y, "min": lo, "max": hi, "step": step})

    def rack(self, key, group, label, part, prefix, first, origins, count, category, facing, gap=None,
             anchor="center", rot=I3, scale=(1, 1, 1), line=None, defaults=(), bounds=None, **extra):
        """a hanging zone whose garment count the viewer can change (SceneShot.racks): one item + slot per
        possible garment, at the origins of the fullest layout (first .. last); the viewer shows `count` of them,
        re-spaced (centre: spread evenly, at most `gap` mm apart; start: `gap` mm steps from the first).
        group / label name it for people: 위칸 / 아래칸, then where + 옆걸이 (shoulder out) or 정면걸이 (face out).
        part / scale may be one per garment (mixed racks); then give `line` = the hook line [first, last] (mm) the
        garments keep their own drop from, else the line runs through the item centres. bounds = (lo, hi) mm along
        the line that every garment's whole width stays within (the bay's posts)"""
        slots = []
        for k, o in enumerate(origins):
            sid = f"{prefix}{first + k:02d}"
            pk = part[k] if isinstance(part, (list, tuple)) else part
            sk = scale[k] if isinstance(scale[0], (list, tuple)) else scale
            self.product(pk, sid, f"{group} {label} {k + 1}", category, o, facing, rot=rot, scale=sk,
                         default=defaults[k] if k < len(defaults) else None, **extra,
                         # thin: depth share when side-on; a face-out 패딩 gets it too so it presses when switched
                         **({"thin": sk[2]} if sk[2] < 1 else {"thin": 0.32} if pk == "패딩" else {}))
            slots.append(sid)
        ends = line or [self.items[-len(origins)]["matrix"][12:15], self.items[-1]["matrix"][12:15]]
        self.racks.append({"id": key, "group": group, "label": label, "slotIds": slots, "count": count,
                           "from": ends[0], "to": ends[1], "anchor": anchor,
                           **({"bounds": list(bounds)} if bounds else {}),
                           **({"gap": gap} if gap else {})})

    def picture(self, part, slot, label, origin, scale=(1, 1, 1)):
        """a poster / screen whose front face takes an image in the viewer (slot kind image)"""
        it = self.put(part, slot, origin, scale=scale)
        self.slots.append({"id": slot, "itemId": it["id"], "label": label, "kind": "image"})

    def scene(self, cam_pos, fov):
        shot = {"id": f"{self.key}-shot", "floorId": self.floor["id"], "title": self.title,
                "thumb": f"{MD}/매장연출/{self.photo}", "position": cam_pos, "quaternion": [0, 0, 0, 1],
                "fov": fov, "aspect": 16 / 9, "near": 50.0, "slots": self.slots,
                **({"racks": self.racks} if self.racks else {}),
                **({"levels": self.levels} if self.levels else {})}
        return {"projectId": f"{PID}~{self.key}", "name": self.title, "units": "mm", "hanger": HANGER,
                "floors": [self.floor], "shots": [shot], "drawings": []}


def padding_wall():
    """사진 01 (MAN): 2 side-hung + 1 face-out | 백팩 + 토르소 | 2 + 1 on the upper level, 12 + 1 + 12 on the lower rail"""
    v = Vignette("v1", "01 패딩 월", "01_패딩월.png", width=6200, floor_color="c8bfb2")
    # 3 back panels, each 1.5x as wide as the 1 m 벽 행거_3-2, mirrored: the face-out bar is on the left as in the photo
    bay_sx = 1.5
    bay_w = 1007 * bay_sx
    bays = [(-1 + i) * bay_w for i in range(3)]
    back = -bbox(LIB["벽 행거_3-2"])[0][2]  # model z of the back panel -> wall face
    for i, x in enumerate(bays):  # the middle panel (backpack + torso) has no loop / arm on top
        v.put("벽 행거_3-2_고리없음" if i == 1 else "벽 행거_3-2", f"bay{i + 1}", [x, 0, back], scale=(-bay_sx, 1, 1))
    ledge = 1151  # top of the 벽 행거_3-2 ledge
    pad_h = bbox(LIB["패딩"])[1][1]  # hook top of the store 패딩, model origin at its hem

    # upper level, left and right panels (the counts change in the viewer, SceneShot.racks): side-hung 패딩 on the
    # round loop bar (left half, x -693..+25, front bar 1978 mm high, 350 mm off the wall) like the lower rail - 2,
    # up to 5 - and face-outs one behind another on the single arm right of it (x +400, z 120..330) - 1, up to 4
    side = rot_y(90)  # shoulder to the camera
    n = 1
    for b_i, where, side_key in ((0, "왼쪽", "left"), (2, "오른쪽", "right")):
        v.rack(f"{side_key}-loop", "위칸", f"{where} 옆걸이", "패딩", "U", n,
               [[bays[b_i] - 650 + 157 * k, 1978 - pad_h, 350] for k in range(5)], 2, "패딩", 90,
               gap=200, rot=side, scale=(1, 1, 0.32), swapDepth=SIDE_DEPTH)
        v.rack(f"{side_key}-arm", "위칸", f"{where} 정면걸이", "패딩", "U", n + 5,
               [[bays[b_i] + 400, 2000 - pad_h, 300 - 60 * k] for k in range(4)], 1, "패딩", 0, gap=60, anchor="start")
        n += 9

    # middle panel: backpack on the ledge and the torso right of it (scripts/build_torso.py). The torso's hip
    # sits on the ledge, its stand is clipped away below it; M01 swaps in a dressed torso (상품/착장) in the same frame
    hip = 363  # base bottom -> hip, mm
    v.product("토르소", "M01", "토르소 착장", "착장", [180, ledge - hip, 290], 0, fit="model", clip=[ledge, 3000])
    bag_scale = 460 / (bbox(LIB["디스커버리백팩"])[1][1] - bbox(LIB["디스커버리백팩"])[0][1])
    v.product("디스커버리백팩", "B01", "선반 가방", "가방", [-350, ledge, 270], 0, scale=(bag_scale,) * 3, mount="place")

    # lower rail: 3 x 벽걸이 행거 stretched to the 3 panels, bar top at 1.0 m, 350 mm off the wall
    (rlo, rhi), rail_len = bbox(LIB["벽걸이 행거"]), 1531
    sx = len(bays) * bay_w / (3 * rail_len)
    bar_mid = rlo[0] + rail_len / 2  # the bar runs from the model's left edge; a bracket sticks out right
    for i in range(3):
        cx = (i - 1) * rail_len * sx
        v.put("벽걸이 행거", f"rail{i + 1}", [cx - bar_mid * sx, 1000 - rhi[1], -rlo[2]], scale=(sx, 1, 1))
    # left / right: 12 side-hung, up to 16 (157 mm apart, closer when fuller); middle: 1 face-out (0 or 1)
    for key, label, first, (x0, x1) in (("left-rail", "왼쪽 옆걸이", 1, (-2150, -420)), ("right-rail", "오른쪽 옆걸이", 18, (420, 2150))):
        v.rack(key, "아래칸", label, "패딩", "L", first, [[x0 + (x1 - x0) * k / 15, 1000 - pad_h, 350] for k in range(16)],
               12, "패딩", 90, gap=157, rot=side, scale=(1, 1, 0.32), swapDepth=SIDE_DEPTH)
        if key == "left-rail":
            v.rack("mid-rail", "아래칸", "가운데 정면걸이", "패딩", "L", 17, [[0, 1000 - pad_h, 350]], 1, "패딩", 0)
    return v.scene([0, 1250, 4200], 40)


def shoe_wall():
    """사진 02: 반슬리 | TV | 퍼지뮬 — shoes 4 x 8 left, 7 x 4 under the TV, 4 x 6 right (84)"""
    v = Vignette("v2", "02 신발 월", "02_신발월.png", width=5600, floor_color="cfc8bd")
    mm = 6.2  # mm per photo px (shoe column pitch 49 px = the 신발 진열대 pad pitch 305 mm)
    X = lambda px: round((px - 387) * mm)
    Y = lambda py: round((420 - py) * mm)  # floor at py 420

    # base: wood + mirror units, 4.5 m; pegboard 300 -> 2400 above it
    for i in range(4):
        v.put("신발 진열대 하부", f"base{i + 1}", [(i - 1.5) * 1125, 0, 175], scale=(1.125, 1, 1))
    for i in range(3):
        v.put("흰 타공판", f"peg{i + 1}", [(i - 1) * 1500, 300, 8], scale=(1500 / 1634, 2100 / 2500, 1))
    # TV (the 명동 lightbox signage scaled to the screen) and the two posters
    # all three take an image in the viewer (P01-P03)
    v.picture("포스터_반슬리", "P01", "왼쪽 포스터", [X(143), Y(112), 18])
    v.picture("사이니지", "P02", "TV 화면", [0, Y(228), 8 + 200 * 0.3], scale=(1594 / 2400, 887 / 855, 0.3))
    v.picture("포스터_퍼지뮬", "P03", "오른쪽 포스터", [X(631), Y(112), 18])

    shoe_lo, shoe_hi = bbox(LIB["운동화"])
    shoe_half = (shoe_hi[1] - shoe_lo[1]) / 2
    pad_back = -bbox(LIB["신발 받침"])[0][2]
    blocks = (
        ("반슬리", (40, 90, 138, 185), (160, 183, 208, 233, 260, 286, 312, 338)),
        ("가운데", (237, 288, 338, 390, 438, 485, 540), (260, 286, 312, 338)),
        ("퍼지뮬", (588, 638, 688, 738), (158, 183, 208, 250, 300, 338)),
    )
    n = 0
    for name, cols, rows in blocks:
        for r, py in enumerate(rows):
            for c, px in enumerate(cols):
                n += 1
                top = Y(py) - shoe_half  # shoe bottom = pad top
                v.put("신발 받침", f"pad{n:02d}", [X(px), top - 5, 8 + pad_back])
                v.product("운동화", f"S{n:02d}", f"{name} {r + 1}단 {c + 1}", "신발",
                          [X(px), top, 8 + pad_back - 86], 90, rot=SHOE_ROT)
    return v.scene([0, 1265, 3700], 40)


def center_hanger():
    """사진 03 (여성 글로시 숏패딩 MAIN): one long side of the 스탠드 행거, 3 bays 1300 mm apart.
    왼쪽: shelves 2030 (bags) / 1525 (shoes, hat) + side-hung rail 1300 | 가운데: poster on a shelf 1750 + rail 1500 with
    a face-out on an arm | 오른쪽: face-out bar 2300 (pink, grey) + side-hung rail 1300"""
    v = Vignette("v3", "03 중앙 행거", "03_중앙행거.png", width=6000, depth=7000, floor_color="c9c8c4")
    Z = 1200  # upright plane, 1.2 m off the back wall: garments hang across it (double-sided fixture)
    to_x = rot_y(-90)  # fixture parts run along model z -> world x, model +x (outside) -> camera
    v.put("스탠드 행거", "frame", [0, 0, Z], rot=to_x)
    bay = {"왼쪽 칸": -1300, "가운데 칸": 0, "오른쪽 칸": 1300}
    pad_top = bbox(LIB["패딩"])[1][1]
    hook = lambda part: bbox(LIB[part])[1][1]  # hanger top above the model origin
    side = rot_y(90)

    def board(key, x, top, depth=380):
        """a shelf: one wood post laid flat (18 x 2400 x 100 -> 25 thick, 1190 wide, `depth` deep) on two arms"""
        lay = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]  # model y -> x, model x -> -y
        b = v.put("스탠드 판", f"{key}-board", [x, top - 12.5, Z - 40 + depth / 2], rot=lay,
                  scale=(25 / 18, 1190 / 2400, depth / 100))
        arms = [v.put("스탠드 팔", f"{key}-arm{i}", [x + dx, top - 25 - 18, Z + 100], rot=to_x) for i, dx in enumerate((-540, 540))]
        return [b, *arms]

    def rail(key, x, y):
        return v.put("스탠드 봉", key, [x, y, Z], rot=to_x)

    inner = 600  # bay centre -> inner face of a post (posts 1300 apart, 100 wide)

    def hung(key, group, label, prefix, first, x0, x1, y, mix, count, gap, defaults, facing=90):
        """side-hung (facing 90) or face-out (0) garments on the rail at y: mix = part per garment"""
        n = len(mix)
        bay_x = (x0 + x1) / 2  # every rail is centred in its bay
        xs = [x0 + (x1 - x0) * k / (n - 1) for k in range(n)]
        bar = y + 25  # tube top: the hooks
        rot, deep = (side, 0.32) if facing == 90 else (I3, 1)
        v.rack(key, group, label, mix, prefix, first, [[x, bar - hook(m), Z] for x, m in zip(xs, mix)], count, "패딩",
               facing, gap=gap, rot=rot, scale=[(1, 1, deep if m == "패딩" else 1) for m in mix],
               line=[[x0, bar, Z], [x1, bar, Z]], defaults=defaults,
               **({"swapDepth": SIDE_DEPTH} if facing == 90 else {}),
               bounds=(bay_x - inner - x0, bay_x + inner - x0))

    # 왼쪽 칸: 2 shelves + rail
    x = bay["왼쪽 칸"]
    top = board("l-top", x, 2030)
    bag_s = 460 / (bbox(LIB["디스커버리백팩"])[1][1] - bbox(LIB["디스커버리백팩"])[0][1])
    bags = [v.product("디스커버리백팩", "G01", "왼쪽 칸 위 선반 가방 1", "가방", [x - 300, 2030, Z + 150], 0,
                      scale=(bag_s,) * 3, default="X26NDXBK3506N_DWS", mount="place"),
            v.product("토트백", "G02", "왼쪽 칸 위 선반 가방 2", "가방", [x + 150, 2030, Z + 150], 0, scale=(0.6,) * 3,
                      mount="place")]
    v.level("l-top", "왼쪽 칸", "위 선반", 2030, top + bags, 1500, 2350)
    mid = board("l-mid", x, 1525)
    shoes = [v.product("운동화", f"S0{i + 1}", f"왼쪽 칸 아래 선반 신발 {i + 1}", "신발", [x + dx, 1525, Z + 170], 90,
                       rot=SHOE_ROT, default="DXSH4236N_WHS") for i, dx in enumerate((-420, -170))]
    hat = v.put("니트 모자", "hat", [x + 150, 1525, Z + 170])
    v.level("l-mid", "왼쪽 칸", "아래 선반", 1525, mid + shoes + [hat], 900, 2100)
    mix = ["패딩", "패딩", "맨투맨", "바지", "티셔츠", "패딩", "패딩", "바지", "패딩", "패딩", "패딩", "패딩"]
    hung("l-rail", "왼쪽 칸", "옆걸이", "L", 1, x - 560, x + 560, 1300, mix, 8, 140,
         ["X26FDXDJ8I066_BKS", "X26FDXDJ8C066_SBS", None, None, None, "X26FDXDJ6M066_INL", "X26FDXDJ8C066_IVS"])
    v.level("l-rail", "왼쪽 칸", "봉", 1300, [rail("l-rail-bar", x, 1300)], 900, 1700, racks=["l-rail"])

    # 가운데 칸: poster on a shelf, rail with the hero face-out in front on a long arm
    x = bay["가운데 칸"]
    shelf = board("c-top", x, 1750)
    v.picture("포스터_글로시", "P01", "가운데 칸 포스터", [x, 1750 + 395, Z + 60])
    v.level("c-top", "가운데 칸", "선반·포스터", 1750, shelf + [v.items[-1]], 1300, 1900)
    mix = ["패딩", "티셔츠", "맨투맨", "바지", "바지", "패딩", "패딩", "패딩", "패딩", "패딩"]
    hung("c-rail", "가운데 칸", "옆걸이", "C", 1, x - 560, x + 560, 1500, mix, 5, 130, ["X26FDMDJ7I066_SBS"])
    arm = v.put("스탠드 팔", "c-hero-arm", [x + 200, 1615 + 18, Z + 210], rot=to_x, scale=(1.8, 1, 1))
    hero = v.product("패딩", "C11", "가운데 칸 정면걸이", "패딩", [x + 200, 1615 + 25 - pad_top, Z + 400], 0,
                     default="X26FDXDJ8I066_SIL")
    v.level("c-rail", "가운데 칸", "봉·정면걸이", 1500, [rail("c-rail-bar", x, 1500), arm, hero], 1000, 1800,
            racks=["c-rail"])

    # 오른쪽 칸: face-out bar on top, side-hung rail below
    x = bay["오른쪽 칸"]
    hung("r-top", "오른쪽 칸", "위 정면걸이", "R", 1, x - 380, x + 380, 2300, ["패딩"] * 3, 2, 400,
         ["X26FDWDJ84066_PKL", "X26FDXDJ8I066_DGS"], facing=0)
    v.level("r-top", "오른쪽 칸", "위 봉", 2300, [rail("r-top-bar", x, 2300)], 1800, 2450, racks=["r-top"])
    mix = ["패딩", "패딩", "패딩", "맨투맨", "티셔츠", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩"]
    hung("r-rail", "오른쪽 칸", "옆걸이", "R", 4, x - 560, x + 560, 1300, mix, 8, 140,
         ["X26FDXDJ8I066_BKS", "X26FDWDJ9R066_DWS", "X26FDWDJ84066_PKL", None, None, "X26FDXDJ8C066_SBS",
          "X26FDXDJ8I066_SIL", "X26FDXDJ8C066_IVS"])
    v.level("r-rail", "오른쪽 칸", "아래 봉", 1300, [rail("r-rail-bar", x, 1300)], 900, 1700, racks=["r-rail"])
    return v.scene([0, 1350, Z + 3700], 40)


def more_vignettes():
    """scripts/vignettes/v*.py: one more wall each, `build(V)` -> V.Vignette(...).scene(...) with V = this module.
    A file that fails is reported and left out, so one half-done wall does not stop the others."""
    import importlib.util
    import sys
    import traceback
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vignettes")
    out = []
    for name in sorted(os.listdir(here)) if os.path.isdir(here) else []:
        if not (name.startswith("v") and name.endswith(".py")) or name.endswith("_parts.py"):
            continue
        try:
            spec = importlib.util.spec_from_file_location(f"vignettes.{name[:-3]}", os.path.join(here, name))
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            out.append(mod.build(sys.modules[__name__]))
        except Exception:
            print("!! skipped", name)
            traceback.print_exc()
    return out


def main():
    out = {"projectId": PID, "vignettes": [padding_wall(), shoe_wall(), center_hanger(), *more_vignettes()]}
    path = os.path.join(ROOT, "data", "vignettes", f"{PID}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf8") as f:
        json.dump(out, f, ensure_ascii=False)
    for s in out["vignettes"]:
        cats = {}
        for sl in s["shots"][0]["slots"]:
            k = sl.get("category") or "이미지"
            cats[k] = cats.get(k, 0) + 1
        print(s["name"], "items", len(s["floors"][0]["items"]), "slots", cats)
    print("->", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
