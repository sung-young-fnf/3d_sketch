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
import copy
import json
import math
import os
import re
import struct
from contextlib import contextmanager

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
PANTS_HANGER = f"{MD}/부품/바지걸이.glb"  # StoreScene.pantsHanger: VMD 팬츠 / 스커트 hang on this clip bar
SHOE_ROT = rot_y(90)  # store 운동화 toe to the right, as on the real wall (VMD shoes: facing 90)


# ------------------------------------------------------------------ 집기 modules (any zone can turn into one)
# built in a zone's frame f: x = bay centre, w = inside width, z = where boards / arms meet the wall or stand (the
# boards' back edge), y0..y1 = the height the zone may use; mm. Parts are the 스탠드 행거's board / arm and 08's caps.
V8P = lambda name: f"{MD}/부품/v8_{name}.glb"
CAP_COLORS = ("회색", "세이지", "모브", "검정", "흰색", "주황", "하늘", "스톤", "연그린", "그린", "아이보리", "차콜",
              "베이지", "카키", "네이비", "브라운")
LAY = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]  # a 스탠드 판 post laid flat: model y -> x, model x -> -y
TO_X = rot_y(-90)  # 스탠드 팔: its length (model +x) towards the camera


def _mul3(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(3)) for c in range(3)] for r in range(3)]


def _board(v, key, x, top, zb, width, depth=380):
    """a wood shelf (18 x 2400 x 100 post laid flat -> 25 thick) on two 스탠드 팔 arms, back edge at zb"""
    b = v.put("스탠드 판", f"{key}-board", [x, top - 12.5, zb + depth / 2], rot=LAY,
              scale=(25 / 18, width / 2400, depth / 100))
    arms = [v.put("스탠드 팔", f"{key}-arm{i}", [x + dx, top - 25 - 18, zb + 140], rot=TO_X)
            for i, dx in enumerate((-(width / 2 - 55), width / 2 - 55))]
    return [b, *arms]


def _caps(v, f, group, key, yf, label):
    """one grey cap tray tipped 18 deg (08 오른쪽 칸), front edge at yf: a front and a back row of caps"""
    for c in CAP_COLORS:
        LIB.setdefault(f"v8 볼캡 {c}", V8P(f"볼캡_{c}"))
    LIB.setdefault("v8 캡선반", V8P("캡선반"))
    x, zb, width = f["x"], f["z"], min(1190, f["w"] - 20)
    a = math.radians(18)
    c, s = math.cos(a), math.sin(a)
    tilt = [[1, 0, 0], [0, c, -s], [0, s, c]]
    depth = 420
    hb = yf + depth * s
    surf = [x, (yf + hb) / 2, zb + depth * c / 2]
    tray = v.put("v8 캡선반", f"{key}-tray", [surf[0], surf[1] - 12.5 * c, surf[2] - 12.5 * s],
                 rot=_mul3(tilt, LAY), scale=(25 / 18, width / 2400, depth / 100))
    items = [tray] + [v.put("스탠드 팔", f"{key}-arm{j}", [x + dx, hb - 40, zb + 100], rot=TO_X)
                      for j, dx in enumerate((-(width / 2 - 55), width / 2 - 55))]
    ncol = 4 if width >= 1000 else 3
    k = len(v.items)
    for row, vv in enumerate((95, -110)):
        for j in range(ncol):
            u = -width / 2 + width * (j + 0.5) / ncol
            col = CAP_COLORS[(k + row * ncol + j) % len(CAP_COLORS)]
            items.append(v.product(f"v8 볼캡 {col}", "K01", f"{group} {label} {'앞' if row == 0 else '뒤'}줄 {j + 1}",
                                   "모자", [x + u, surf[1] - s * vv, surf[2] + c * vv], 0, rot=tilt,
                                   scale=(1.05,) * 3, mount="place", tilt=18))
    return items


# ------------------------------------------------------------------ 집기 도구 (pieces any bay can take)
# Each builds one piece as a level at height y (what people read: rail / shelf top / tray front) in a bay frame
# f (x centre, w inside width, z back edge = wall / stand face, y0..y1, stand = a double-sided stand fixture).
# The viewer puts a piece in a bay (shows it, moves it to a free height or where it was dropped) and takes it out.
def part_rail(v, f, group, key, y, label):
    """옆걸이 행거: a rail with side-hung garments (6 shown, up to 10)"""
    x, w = f["x"], f["w"]
    pad_h = bbox(LIB["패딩"])[1][1]
    if f.get("stand"):
        bar_item = v.put("스탠드 봉", f"{key}-bar", [x, y - 25, f["z"] + 40], rot=TO_X)
        gz = f["z"] + 40
    else:
        (rlo, rhi), rail_len = bbox(LIB["벽걸이 행거"]), 1531
        sx = (w - 260) / rail_len  # the bracket past the bar's right end stays inside the bay too
        bar_item = v.put("벽걸이 행거", f"{key}-bar", [x - (rlo[0] + rail_len / 2) * sx, y - rhi[1], f["z"] - rlo[2]],
                         scale=(sx, 1, 1))
        gz = f["z"] + 350
    n = 10
    half = (w - 260) / 2 - 40 if not f.get("stand") else w / 2 - 70
    x0, x1 = x - half, x + half
    v.rack(f"{key}-rack", group, f"{label}", "패딩", "R", 1,
           [[x0 + (x1 - x0) * k / (n - 1), y - pad_h, gz] for k in range(n)], 6, "패딩", 90, gap=110,
           rot=rot_y(90), scale=(1, 1, 0.32), swapDepth=SIDE_DEPTH, line=[[x0, y, gz], [x1, y, gz]],
           bounds=(-50, x1 - x0 + 50))
    return [bar_item], [f"{key}-rack"]


def part_combo(v, f, group, key, y, label):
    """옆걸이+정면걸이 행거, the viewer flips it left / right.
    wall: the 명동 wall's round loop (side-hung, left) and a single arm right of it (face-outs one behind another);
    stand (03 / 08 centre fixture): one long loop across the bay with the arm fixed near its right end, reaching
    forward, so the face-out hangs in front of the side-hung clothes"""
    LIB.setdefault("v4 고리", f"{MD}/부품/v4_고리.glb")
    LIB.setdefault("v4 팔", f"{MD}/부품/v4_팔.glb")
    x, w = f["x"], f["w"]
    stand = f.get("stand")
    zt = f["z"] + (40 if stand else 20)
    pad_h = bbox(LIB["패딩"])[1][1]
    half_pad = (bbox(LIB["패딩"])[1][0] - bbox(LIB["패딩"])[0][0]) / 2
    arm_x = x + w / 2 - half_pad - 40  # the face-out's whole width inside the bay (flipped too: a mirror)
    x0 = x - w / 2 + 50
    z = zt + 220  # the loop's front bar
    if stand:
        length = w - 100
        reach = 1.6
        arm = v.put("v4 팔", f"{key}-arm", [arm_x, y + 7, z - 20], scale=(1, 1, reach))
        tip = z - 20 + 259 * reach - 30
        n_side, side_hi = 5, length - 90  # side-hung along the whole loop, behind the face-out too
    else:
        length = max(300, arm_x - 70 - x0)  # the loop runs up to the arm
        arm = v.put("v4 팔", f"{key}-arm", [arm_x, y + 7, zt])
        tip = zt + 240
        n_side, side_hi = 4, arm_x - half_pad - 20 - x0  # side-hung clothes stay clear of the face-out
    loop = v.put("v4 고리", f"{key}-loop", [x0, y, zt], scale=(length / 484, 1, 1))
    last = min(length - 90, side_hi)
    xs = [x0 + 90 + (last - 90) * k / (n_side - 1) for k in range(n_side)]
    v.rack(f"{key}-loop", group, f"{label} 옆걸이", "패딩", "R", 1, [[xx, y - pad_h, z] for xx in xs], 3 if stand else 2,
           "패딩", 90, gap=170, anchor="start", rot=rot_y(90), scale=(1, 1, 0.32), swapDepth=SIDE_DEPTH,
           line=[[xs[0], y, z], [xs[-1], y, z]], bounds=(-90, side_hi))
    v.rack(f"{key}-arm", group, f"{label} 정면걸이", "패딩", "R", 1,
           [[arm_x, y + 7 - pad_h, tip - 60 * k] for k in range(3)], 1, "패딩", 0, gap=60, anchor="start")
    return [loop, arm], [f"{key}-loop", f"{key}-arm"]


def part_shelf(v, f, group, key, y, label):
    """선반: a wood board on two arms with 3 things standing on it (shoes at first; any product can go there)"""
    x, width = f["x"], min(1190, f["w"] - 20)
    items = _board(v, key, x, y, f["z"], width)
    for i, u in enumerate((-0.3, 0, 0.3)):
        items.append(v.product("운동화", "S01", f"{group} {label} {i + 1}", "신발", [x + u * width, y, f["z"] + 190], 90,
                               rot=SHOE_ROT, mount="place"))
    return items, []


def part_caps(v, f, group, key, y, label):
    """모자 진열대: one tipped tray of caps"""
    return _caps(v, f, group, key, y, label), []


def part_poster(v, f, group, key, y, label):
    """사진 진열대: a board with a framed photo standing on it (the picture can be changed)"""
    x, width = f["x"], min(1190, f["w"] - 20)
    items = _board(v, key, x, y, f["z"], width)
    sc = min(1.0, (width - 120) / 1150)
    v.picture("포스터_글로시", "P01", f"{group} {label}", [x, y + 395 * sc, f["z"] + 80], scale=(sc, sc, 1))
    items.append(v.items[-1])
    return items, []


def part_goods(v, f, group, key, y, label):
    """용품 진열: a board with a backpack and a cap on a head stand (08 왼쪽 칸 위 선반)"""
    LIB.setdefault("v8 두상 머리", V8P("두상_머리"))
    LIB.setdefault("v8 두상 캡", V8P("두상_캡"))
    x, zb, width = f["x"], f["z"], min(1190, f["w"] - 20)
    items = _board(v, key, x, y, zb, width)
    lo, hi = bbox(LIB["디스커버리백팩"])
    bag_s = 460 / (hi[1] - lo[1])
    items.append(v.product("디스커버리백팩", "G01", f"{group} {label} 가방", "가방", [x - width * 0.22, y, zb + 200], 0,
                           scale=(bag_s,) * 3, mount="place"))
    hx = x + width * 0.22
    items.append(v.put("v8 두상 머리", f"{key}-head", [hx, y, zb + 180], rot=rot_y(90), scale=(1.15,) * 3))
    items.append(v.product("v8 두상 캡", "H01", f"{group} {label} 두상 모자", "모자", [hx, y, zb + 180], 90,
                           rot=rot_y(90), scale=(1.15,) * 3, mount="place"))
    return items, []


# type -> (label, how many a bay can take, builder, height range inside the bay: (from y0, from y1))
PARTS = {
    "rail": ("옆걸이 행거", 3, part_rail, (850, 100)),
    "combo": ("옆걸이+정면걸이 행거", 2, part_combo, (850, 80)),
    "shelf": ("선반", 3, part_shelf, (80, 250)),
    "caps": ("모자 진열대", 4, part_caps, (60, 250)),
    "poster": ("사진 진열대", 2, part_poster, (80, 900)),
    "goods": ("용품 진열", 2, part_goods, (80, 600)),
}


class Vignette:
    def __init__(self, key, title, photo, width, depth=6000, height=3000, floor_color="cfc8bd"):
        self.key, self.title, self.photo = key, title, photo
        self.items, self.slots, self.racks, self.levels = [], [], [], []
        # 집기 (SceneShot.fixtures): bay zones whose type can change + props that move / come off
        self.fixtures, self._zones, self._ns = [], [], None
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
            "id": self._iid(item_id), "productId": part, "name": part, "kind": "glb", "url": web_copy(rel),
            "matrix": [round(v, 5) for v in (m[0][0], m[1][0], m[2][0], 0, m[0][1], m[1][1], m[2][1], 0,
                                             m[0][2], m[1][2], m[2][2], 0, pos[0], pos[1], pos[2], 1)],
            "center": center, "size": size, **extra,
        }
        self.items.append(item)
        return item

    def product(self, part, slot, label, category, origin, facing, rot=I3, scale=(1, 1, 1), default=None, **extra):
        """default: the VMD product (상품 file stem) the slot shows at first"""
        slot = self._slot_id(slot)
        it = self.put(part, slot, origin, rot, scale, facing=facing, **extra)
        self.slots.append({"id": slot, "itemId": it["id"], "label": label, "category": category,
                           **({"product": default} if default else {})})
        return it

    def level(self, key, group, label, y, items, lo, hi, racks=(), step=50):
        """a shelf / rail the viewer moves up / down (SceneShot.levels): items (dicts from put / product) and racks
        go with it; y = its height for people, lo..hi the allowed range"""
        rids = [self._rid(r) for r in racks]
        # 옆걸이 + 정면걸이 together (a face-out on an arm / at the rail's end): its zone can flip left / right
        slot_item = {sl["id"]: sl["itemId"] for sl in self.slots}
        facing = {it["id"]: it.get("facing") for it in self.items}
        mine = [r for r in self.racks if r["id"] in rids]
        rack_facing = [facing.get(slot_item.get(r["slotIds"][0])) for r in mine if r["slotIds"]]
        face_item = any(it.get("facing") == 0 and it.get("mount") != "place" and it.get("fit") != "model" and
                        it["id"] in slot_item.values() for it in items)
        fixed = any(r.get("anchor") == "start" for r in mine) or (
            90 in rack_facing and (0 in rack_facing or face_item))
        self.levels.append({"id": self._rid(key), "group": group, "label": label,
                            "itemIds": [it["id"] for it in items], "rackIds": rids,
                            "y": y, "min": lo, "max": hi, "step": step, **({"fixed": True} if fixed else {})})

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
            slots.append(self.slots[-1]["id"])  # renumbered inside a fixture option (_slot_id)
        ends = line or [self.items[-len(origins)]["matrix"][12:15], self.items[-1]["matrix"][12:15]]
        self.racks.append({"id": self._rid(key), "group": group, "label": label, "slotIds": slots, "count": count,
                           "from": ends[0], "to": ends[1], "anchor": anchor,
                           **({"bounds": list(bounds)} if bounds else {}),
                           **({"gap": gap} if gap else {})})

    def picture(self, part, slot, label, origin, scale=(1, 1, 1)):
        """a poster / screen whose front face takes an image in the viewer (slot kind image)"""
        slot = self._slot_id(slot, image=True)
        it = self.put(part, slot, origin, scale=scale)
        self.slots.append({"id": slot, "itemId": it["id"], "label": label, "kind": "image"})

    # ------------------------------------------------------------ 집기 (fixtures)
    def _iid(self, item_id):
        return f"{self.key}-{self._ns['prefix']}-{item_id}" if self._ns else f"{self.key}-{item_id}"

    def _rid(self, key):
        """rack / level id: namespaced inside a fixture option"""
        return f"{self._ns['prefix']}:{key}" if self._ns else key

    def _alloc(self, letter):
        """next free slot number for this letter in the shot (L07 -> L08 ...)"""
        pat = re.compile(re.escape(letter) + r"(\d+)")
        nums = [int(m.group(1)) for sl in self.slots for m in [pat.fullmatch(sl["id"])] if m]
        return f"{letter}{max(nums, default=0) + 1:02d}"

    def _slot_id(self, slot, image=False):
        if not self._ns:
            return slot
        return self._alloc("P" if image else self._ns["letter"])

    def _mark(self):
        return len(self.items), len(self.slots), len(self.racks), len(self.levels)

    def _since(self, m):
        return {"items": self.items[m[0]:], "slots": self.slots[m[1]:], "racks": self.racks[m[2]:],
                "levels": self.levels[m[3]:]}

    @staticmethod
    def _ids(c):
        return {"itemIds": [it["id"] for it in c["items"]], "rackIds": [r["id"] for r in c["racks"]],
                "levelIds": [lv["id"] for lv in c["levels"]]}

    @contextmanager
    def zone(self, fid, group, label, tier, frame, letter, move="x", empty="비어 있음"):
        """a bay (or its top / bottom) as built: in the viewer it comes off whole or shelf by shelf, moves along the
        wall, and its bay (the zones of one group) gets the 집기 도구 pool (PARTS) built in the frame: x (bay centre),
        w (inside width), z (back edge of boards / arms = the wall or stand face), y0..y1 (the height it may use), mm,
        stand = a double-sided stand fixture. letter = the prefix of the pool's slot numbers"""
        m = self._mark()
        yield
        self._zones.append({"id": fid, "group": group, "label": label, "tier": tier, "frame": frame,
                            "letter": letter, "move": move, "empty": empty, "content": self._since(m)})

    @contextmanager
    def prop(self, fid, group, label, move="xz"):
        """a 소도구 / floor display that moves (x: along the wall, xy: on the wall, xz: on the floor) or comes off"""
        m = self._mark()
        yield
        self.fixtures.append({"id": fid, "group": group, "label": label, "move": move,
                              "options": [{"id": "base", "label": "원래", "kind": "base",
                                           **self._ids(self._since(m))}]})

    def _mirror(self, c, cx, pre):
        """content mirrored left <-> right about x = cx, as new items / slots / racks / levels in the same order:
        hardware is mirrored (scale -x), products / pictures only change place (no mirrored logos)"""
        shown = {sl["itemId"] for sl in c["slots"]}
        m = self._mark()
        imap, smap, rmap = {}, {}, {}
        for it in c["items"]:
            n = copy.deepcopy(it)
            n["id"] = f"{self.key}-{pre}-{it['id'][len(self.key) + 1:]}"
            mx = n["matrix"]
            if it["id"] not in shown:
                mx[0], mx[4], mx[8] = -mx[0], -mx[4], -mx[8]
            mx[12] = round(2 * cx - mx[12], 3)
            imap[it["id"]] = n["id"]
            self.items.append(n)
        for sl in c["slots"]:
            n = copy.deepcopy(sl)
            n["id"] = self._alloc(re.match(r"[A-Z]+", sl["id"]).group(0))
            n["itemId"] = imap[sl["itemId"]]
            smap[sl["id"]] = n["id"]
            self.slots.append(n)
        for r in c["racks"]:
            n = copy.deepcopy(r)
            n["id"] = rmap[r["id"]] = f"{pre}:{r['id']}"
            n["slotIds"] = [smap[x] for x in r["slotIds"]]
            for k in ("from", "to"):
                n[k] = [2 * cx - n[k][0], n[k][1], n[k][2]]
            self.racks.append(n)
        for lv in c["levels"]:
            n = copy.deepcopy(lv)
            n["id"] = f"{pre}:{lv['id']}"
            n["itemIds"] = [imap[x] for x in lv["itemIds"] if x in imap]
            n["rackIds"] = [rmap[x] for x in lv.get("rackIds", []) if x in rmap]
            self.levels.append(n)
        return self._since(m)

    def _finish_zones(self):
        """zones -> fixtures (as built, can come off shelf by shelf); per bay (zones of one group) a pool of 집기 도구
        (PARTS), each a fixture whose option 1 is the piece - hidden until someone puts it in"""
        zones, self._zones = self._zones, []
        out, bays = [], {}
        for Z in zones:
            opts = [{"id": "base", "label": "원래대로" if Z["content"]["items"] else Z["empty"],
                     "kind": f"zone:{Z['id']}", **self._ids(Z["content"])}]
            # a zone with a 옆걸이+정면걸이 hanger can flip left / right
            if any(lv.get("fixed") for lv in Z["content"]["levels"]) or any(
                    r.get("anchor") == "start" for r in Z["content"]["racks"]):
                opts.append({"id": "flip", "label": "좌우 뒤집기", "kind": "flip",
                             **self._ids(self._mirror(Z["content"], Z["frame"]["x"], f"{Z['id']}~flip"))})
            out.append({"id": Z["id"], "group": Z["group"], "label": Z["label"], "tier": Z["tier"], "move": Z["move"],
                        "options": opts})
            b = bays.setdefault(Z["group"], {"id": Z["group"], "label": Z["group"], **Z["frame"], "letter": Z["letter"]})
            b["y0"], b["y1"] = min(b["y0"], Z["frame"]["y0"]), max(b["y1"], Z["frame"]["y1"])
            b["w"] = min(b["w"], Z["frame"]["w"])
            if Z["tier"] != "위":
                b["letter"] = Z["letter"]
        for bi, b in enumerate(bays.values()):
            for t, (label, count, build, (lo, hi)) in PARTS.items():
                for k in range(count):
                    m = self._mark()
                    self._ns = {"prefix": f"b{bi}~{t}{k}", "letter": b["letter"]}
                    try:
                        name = f"{label} {k + 1}"
                        y = round((b["y0"] + lo + b["y1"] - hi) / 2)
                        items, racks = build(self, b, b["id"], "part", y, name)
                        self.level("part", b["id"], name, y, items, b["y0"] + lo, b["y1"] - hi, racks=racks)
                    finally:
                        self._ns = None
                    c = self._since(m)
                    opts = [{"id": "off", "label": "없음", "kind": "off", "itemIds": [], "rackIds": [], "levelIds": []},
                            {"id": "on", "label": label, "kind": f"part:{t}", **self._ids(c)}]
                    if t == "combo":  # option 2: the same hanger flipped (정면걸이 on the left)
                        opts.append({"id": "flip", "label": f"{label} (뒤집기)", "kind": f"part:{t}",
                                     **self._ids(self._mirror(c, b["x"], f"b{bi}~{t}{k}~flip"))})
                    out.append({"id": f"b{bi}~{t}{k}", "group": b["id"], "label": name, "move": "x",
                                "part": {"bay": b["id"], "type": t}, "options": opts})
        self.bays = [{k: b[k] for k in ("id", "label", "x", "w", "z", "y0", "y1")} for b in bays.values()]
        self.fixtures[:0] = out

    def scene(self, cam_pos, fov):
        self._finish_zones()
        shot = {"id": f"{self.key}-shot", "floorId": self.floor["id"], "title": self.title,
                "thumb": f"{MD}/매장연출/{self.photo}", "position": cam_pos, "quaternion": [0, 0, 0, 1],
                "fov": fov, "aspect": 16 / 9, "near": 50.0, "slots": self.slots,
                **({"racks": self.racks} if self.racks else {}),
                **({"levels": self.levels} if self.levels else {}),
                **({"fixtures": self.fixtures} if self.fixtures else {}),
                **({"bays": self.bays} if getattr(self, "bays", None) else {})}
        return {"projectId": f"{PID}~{self.key}", "name": self.title, "units": "mm", "hanger": HANGER, "pantsHanger": PANTS_HANGER,
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
    with v.prop("torso", "가운데", "토르소", "x"):
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
    with v.prop("poster-l", "벽", "왼쪽 포스터", "xy"):
        v.picture("포스터_반슬리", "P01", "왼쪽 포스터", [X(143), Y(112), 18])
    with v.prop("tv", "벽", "TV", "xy"):
        v.picture("사이니지", "P02", "TV 화면", [0, Y(228), 8 + 200 * 0.3], scale=(1594 / 2400, 887 / 855, 0.3))
    with v.prop("poster-r", "벽", "오른쪽 포스터", "xy"):
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

    with v.zone("l", "왼쪽 칸", "왼쪽 칸", "전체", dict(x=-1300, w=1190, z=Z - 40, y0=250, y1=2400, stand=True), "L"):
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

    with v.zone("c", "가운데 칸", "가운데 칸", "전체", dict(x=0, w=1190, z=Z - 40, y0=250, y1=2400, stand=True), "C"):
        # 가운데 칸: poster on a shelf, rail with the hero face-out in front on a long arm
        x = bay["가운데 칸"]
        shelf = board("c-top", x, 1750)
        with v.prop("poster", "가운데 칸", "포스터", "xy"):
            v.picture("포스터_글로시", "P01", "가운데 칸 포스터", [x, 1750 + 395, Z + 60])
        v.level("c-top", "가운데 칸", "선반·포스터", 1750, shelf + [v.items[-1]], 1300, 1900)
        mix = ["패딩", "티셔츠", "맨투맨", "바지", "바지", "패딩", "패딩", "패딩", "패딩", "패딩"]
        hung("c-rail", "가운데 칸", "옆걸이", "C", 1, x - 560, x + 560, 1500, mix, 5, 130, ["X26FDMDJ7I066_SBS"])
        arm = v.put("스탠드 팔", "c-hero-arm", [x + 200, 1615 + 18, Z + 210], rot=to_x, scale=(1.8, 1, 1))
        hero = v.product("패딩", "C11", "가운데 칸 정면걸이", "패딩", [x + 200, 1615 + 25 - pad_top, Z + 400], 0,
                         default="X26FDXDJ8I066_SIL")
        v.level("c-rail", "가운데 칸", "봉·정면걸이", 1500, [rail("c-rail-bar", x, 1500), arm, hero], 1000, 1800,
                racks=["c-rail"])

    with v.zone("r", "오른쪽 칸", "오른쪽 칸", "전체", dict(x=1300, w=1190, z=Z - 40, y0=250, y1=2400, stand=True), "R"):
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
