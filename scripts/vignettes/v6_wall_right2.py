"""
사진 06 (1층 벽면우측2, 06_벽면우측2.jpg + _b.jpg): men's jackets / outer wall, 4 bays of [DX명동]벽 행거_3-2 (1.2 m each)

  1칸  top: face-out (brown) on the single arm + 2 side-hung (beige) on the loop | ledge 1151 + rail: 13 side-hung
  2칸  poster | ledge 1380 with 3 waist bags + rail: 1 face-out (light grey hoodie) + 5 side-hung | plinth, white shoes
  3칸  top: face-out (beige) + 2 side-hung (black) on the loop | ledge 1151 + rail: 15 side-hung
  4칸  ledge 1380 with the cap on a head stand + backpack, rail: 1 face-out (sage jacket) + 7 side-hung | plinth, black shoes

Parts: scripts/vignettes/v6_parts.py (3-2 cut into 벽판 / 선반 / 고리 / 팔, poster, granite plinth, head stand,
store clothes tinted to the photo's colours). Ledges are levels (move up / down), every rail / loop / arm a rack.

Scale (photo a, 06_벽면우측2.jpg shown at 2000 px wide): upright top y 60 -> floor y 1105 = the 3-2's 2351 mm,
2.25 mm/px; 3칸 ledge y 600 -> 1136 (the 3-2's own 1151), 4칸 ledge y 500 -> 1361 (~1380 as the poster bay in photo b);
a bay 490-530 px -> 1.1-1.2 m. Positions inside a bay come from photo b (bay 465 px = 1200 mm, 2.58 mm/px).
"""
import os

MD = "assets/F&F/국내-명동/[디스커버리 명동]"
P = f"{MD}/부품"
BAY = 1200
SX = BAY / 1007  # 3-2 panel is 1007 mm wide
CX = [-1800, -600, 600, 1800]  # bay centres; uprights at -2400 .. 2400
LEDGE_RAIL = 113  # ledge top -> rail tube centre (v6_선반 [Aluminum]3.004)
RAIL_Z = 390  # rail tube, off the wall face
LOOP_Z, ARM_X, LOOP_X = 300, -267 * SX, (-17 * SX + 60, 463 * SX - 60)
TOP_BAR = 1978  # loop / arm tube top


def build(V):
    V.LIB.update({
        "v6 벽판": f"{P}/v6_벽판.glb", "v6 선반": f"{P}/v6_선반.glb", "v6 고리": f"{P}/v6_고리.glb",
        "v6 팔": f"{P}/v6_팔.glb", "v6 포스터": f"{P}/v6_포스터.glb", "v6 좌대": f"{P}/v6_좌대.glb",
        "v6 모자 스탠드": f"{P}/v6_모자 스탠드.glb",
        "v6 볼캡": "assets/F&F/＊소품/의류&잡화/모자/볼캡_모자_낱개__8bce7cac.glb",
        "v6 크로스백": "assets/F&F/＊소품/의류&잡화/가방/크로스백2__646015ba.glb",
    })
    for f in os.listdir(os.path.join(V.ROOT, P)):
        if f.startswith("v6_") and f.split("_")[1] in ("맨투맨", "바지", "후드티"):
            V.LIB["v6 " + f[3:-4].replace("_", " ")] = f"{P}/{f}"

    v = V.Vignette("v6", "06 1층 벽면우측2", "06_벽면우측2.jpg", width=5600, floor_color="c3c4c0")
    side = V.rot_y(90)
    # per garment kind: model scale (후드티 is modelled ~2x too big) and side-hung depth squeeze
    SCALE = {"맨투맨": 1.0, "바지": 1.0, "후드티": 0.42}
    SQUEEZE = {"맨투맨": 0.6, "바지": 1.0, "후드티": 0.32}
    kind = lambda name: name.split()[1]
    hook = lambda name: V.bbox(V.LIB[name])[1][1] * SCALE[kind(name)]

    def hung(key, group, label, prefix, first, x0, x1, bar, z, names, count, gap, lo, hi, facing=90, anchor="center"):
        """garments (v6 <kind> <colour>) on a tube at height `bar`, z off the wall, spread x0..x1 (face-out: stacked
        front to back along z from x0 when x0 == x1); lo..hi = the bay edges along x"""
        n = len(names)
        names = ["v6 " + s for s in names]
        if facing == 90:
            pts = [[x0 + (x1 - x0) * k / max(n - 1, 1), z] for k in range(n)]
            line = [[x0, bar, z], [x1, bar, z]]
            bounds = (lo - x0, hi - x0)
        else:  # face-outs one behind another on an arm (z steps of 60 towards the wall)
            pts = [[x0, z - 60 * k] for k in range(n)]
            line = [[x0, bar, z], [x0, bar, z - 60 * (n - 1)]]
            bounds = None
        scales = [(SCALE[kind(m)],) * 2 + (SCALE[kind(m)] * (SQUEEZE[kind(m)] if facing == 90 else 1),) for m in names]
        v.rack(key, group, label, names, prefix, first, [[x, bar - hook(m), zz] for (x, zz), m in zip(pts, names)],
               count, "패딩", facing, gap=gap, rot=side if facing == 90 else V.I3, scale=scales, line=line,
               anchor=anchor, bounds=bounds, **({"swapDepth": V.SIDE_DEPTH} if facing == 90 else {}))

    def ledge(key, x, y):
        return v.put("v6 선반", f"{key}-ledge", [x, y, 0], scale=(SX, 1, 1))

    for i, x in enumerate(CX):
        v.put("v6 벽판", f"bay{i + 1}", [x, 0, 0], scale=(SX, 1, 1))
    half = BAY / 2 - 20  # bay centre -> inside of the upright

    # ---- 1칸 / 3칸: arm + loop on top, ledge 1151 + side-hung rail
    tops = {0: ("1칸", "A", ["후드티 브라운", "후드티 블랙", "후드티 베이지"], ["후드티 베이지", "후드티 베이지", "후드티 블랙", "후드티 라이트그레이"]),
            2: ("3칸", "C", ["후드티 베이지", "후드티 브라운", "후드티 블랙"], ["후드티 블랙", "후드티 블랙", "후드티 베이지", "후드티 라이트그레이"])}
    rails = {0: ["맨투맨 네이비", "맨투맨 블랙", "맨투맨 화이트", "맨투맨 브라운", "바지 베이지", "맨투맨 베이지", "맨투맨 차콜",
                 "맨투맨 브라운", "맨투맨 네이비", "맨투맨 블랙", "바지 블랙", "맨투맨 스카이", "맨투맨 블랙", "맨투맨 그레이", "바지 차콜"],
             2: ["맨투맨 블랙", "맨투맨 베이지", "맨투맨 블랙", "바지 아이보리", "맨투맨 네이비", "맨투맨 블루", "맨투맨 그레이",
                 "맨투맨 블랙", "바지 그레이", "바지 차콜", "바지 블랙", "맨투맨 브라운", "맨투맨 아이보리", "맨투맨 네이비",
                 "맨투맨 블랙", "맨투맨 차콜"]}
    shown = {0: 13, 2: 15}
    for i, (group, pf, arm, loop) in tops.items():
        x = CX[i]
        v.put("v6 팔", f"{pf}-arm", [x, 0, 0], scale=(SX, 1, 1))
        v.put("v6 고리", f"{pf}-loop", [x, 0, 0], scale=(SX, 1, 1))
        hung(f"{pf}-arm", group, "위 정면걸이", pf, 1, x + ARM_X, x + ARM_X, TOP_BAR, 300, arm, 1, 60, 0, 0,
             facing=0, anchor="start")
        hung(f"{pf}-loop", group, "위 옆걸이", pf, 4, x + LOOP_X[0], x + LOOP_X[1], TOP_BAR, LOOP_Z, loop, 2, 160,
             x + LOOP_X[0] - 60, x + LOOP_X[1] + 60)
        y = 1151
        hung(f"{pf}-rail", group, "아래 옆걸이", pf, 8, x - half + 50, x + half - 50, y - LEDGE_RAIL, RAIL_Z, rails[i],
             shown[i], 80, x - half, x + half)
        v.level(f"{pf}-ledge", group, "선반·봉", y, [ledge(pf, x, y)], 900, 1450, racks=[f"{pf}-rail"])

    # ---- 2칸: poster, ledge 1380 with 3 waist bags, rail with a face-out + side-hung, plinth with shoes
    x, y = CX[1], 1380
    v.picture("v6 포스터", "P01", "2칸 포스터", [x, 1770, 30])
    bag_s = 0.65
    bags = [v.product("v6 크로스백", f"G0{k + 1}", f"2칸 선반 가방 {k + 1}", "가방", [x + dx, y, 250], 0,
                      scale=(bag_s,) * 3, mount="place") for k, dx in enumerate((-430, -15, 350))]
    hung("B-face", "2칸", "봉 정면걸이", "B", 1, x - 300, x - 300, y - LEDGE_RAIL, RAIL_Z, ["후드티 라이트그레이"], 1, 60,
         0, 0, facing=0, anchor="start")
    hung("B-rail", "2칸", "봉 옆걸이", "B", 2, x + 60, x + half - 50, y - LEDGE_RAIL, RAIL_Z,
         ["맨투맨 브라운", "바지 블랙", "바지 네이비", "맨투맨 블랙", "맨투맨 블랙", "맨투맨 그레이", "맨투맨 네이비"], 5, 90,
         x + 10, x + half)
    v.level("B-ledge", "2칸", "선반·봉", y, [ledge("B", x, y), *bags], 1100, 1450, racks=["B-face", "B-rail"])

    # ---- 4칸: ledge 1380 with the cap on a head stand + backpack, rail with a face-out + side-hung
    x = CX[3]
    stand = v.put("v6 모자 스탠드", "D-stand", [x - 200, y, 250])
    cap = v.put("v6 볼캡", "D-cap", [x - 200, y + 490 - 70, 255])
    bp = V.bbox(V.LIB["디스커버리백팩"])
    bp_s = 520 / (bp[1][1] - bp[0][1])
    pack = v.product("디스커버리백팩", "G04", "4칸 선반 백팩", "가방", [x + 330, y, 250], 0, scale=(bp_s,) * 3,
                     default="X26NDXBK3506N_DWS", mount="place")
    hung("D-face", "4칸", "봉 정면걸이", "D", 1, x - 300, x - 300, y - LEDGE_RAIL, RAIL_Z, ["맨투맨 세이지"], 1, 60,
         0, 0, facing=0, anchor="start")
    hung("D-rail", "4칸", "봉 옆걸이", "D", 2, x + 40, x + half - 30, y - LEDGE_RAIL, RAIL_Z,
         ["맨투맨 화이트", "맨투맨 아이보리", "맨투맨 블랙", "바지 블랙", "바지 네이비", "맨투맨 브라운", "바지 블랙", "맨투맨 차콜"], 7, 85,
         x - 10, x + half + 20)
    v.level("D-ledge", "4칸", "선반·봉", y, [ledge("D", x, y), stand, cap, pack], 1100, 1600, racks=["D-face", "D-rail"])

    # ---- plinths (granite, 450 x 220 x 450) with a pair of shoes each: 2칸 left (white), 4칸 left (black)
    plinth_h = 220
    n = 0
    for px, default in ((CX[1] - 355, "DXSH4236N_WHS"), (CX[3] - 380, "DXSH4236N_BKS")):
        v.put("v6 좌대", f"plinth{n // 2 + 1}", [px, 0, 260], scale=(1, plinth_h / 250, 1))
        for dx in (-75, 75):
            n += 1
            v.product("운동화", f"S{n:02d}", f"좌대 신발 {n}", "신발", [px + dx, plinth_h, 260], 0, default=default)
    return v.scene([0, 1300, 4400], 40)
