"""
매장연출 07 1층 벽면 RUN&FIT (07_벽면_런앤핏.jpg): a recessed wall niche of 4 bays of the 명동 wall system
([DX명동]벽 행거_1단 cut into uprights / back panel / rail / shelf board by scripts/vignettes/v7_parts.py).

  bay 1 (wood):  shelf 1580 (RUN&FIT letters, framed poster P01, mountain sculpture), side-hung rail 1500 (8)
  bay 2 (white): poster P02 on the panel, shelf 1790 (2 shoes), shelf 1444 (3 caps H01-03), side-hung rail 1366 (10)
  bay 3 (wood):  shelf 1539 (2 torsos in T-shirts + D sculpture), rail 1460: 1 face-out + 5 side-hung
  bay 4 (white): face-out bar 2450 (3 T-shirts), empty shelf 1413, side-hung rail 1350 (13)
  floor: two granite plinths with a pair of shoes each

Scale: 3.14 mm per px of the 2000 px wide view (x1.2 for the 2400 px original), measured on the wall plane:
upright 790 px = the 2481 mm upright of 벽 행거_1단, so a bay is 350 px = 1100 mm (the 1250 mm bay squeezed x 0.88).
Floor at py 1335, wall centre at px 1011. Things ~350 mm in front of the wall (rails, shelf fronts) look 7 % wider.
Store clothes are 옷걸이&맨투맨 / 옷걸이 & 의류 / 볼캡 tinted to the photo's colours (v7_parts.py).
"""

PX = 3.14
X = lambda px: round((px - 1011) * PX)
XF = lambda px: round((px - 1011) * PX / 1.07)  # something ~350 mm in front of the wall
Y = lambda py: round((1335 - py) * PX)


def build(V):
    D = f"{V.MD}/부품"
    parts = ["v7_벽 행거_기둥", "v7_벽판_나무", "v7_벽판_흰", "v7_봉", "v7_선반", "v7_포스터_액자", "v7_포스터_런앤핏",
             "v7_사인_런앤핏", "v7_조형_산", "v7_조형_D", "v7_좌대"]
    colors = ["회색", "카키", "브라운", "블랙", "네이비", "연하늘", "하늘", "오렌지", "라임", "화이트", "크림", "핑크", "토프", "베이지"]
    parts += [f"v7_맨투맨_{c}" for c in colors] + [f"v7_티셔츠_{c}" for c in ("화이트", "라임", "토프")]
    parts += [f"v7_볼캡_{c}" for c in ("블랙", "베이지", "라임")]
    V.LIB.update({p: f"{D}/{p}.glb" for p in parts})

    v = V.Vignette("v7", "07 1층 벽면 RUN&FIT", "07_벽면_런앤핏.jpg", width=4900, depth=7000, height=2900,
                   floor_color="a9aaa8")
    for w in v.floor["walls"]:
        w["color"] = "cbc8bb"  # greige niche plaster

    bay_w, sx = 1100, 1100 / 1250
    bays = [(-1.5 + i) * bay_w for i in range(4)]  # -1650 -550 550 1650
    lift = 170  # uprights stand on a plinth line: top at py 490 = 2650 mm
    panel_top = Y(560)  # wood top 2430, grey strip above
    for i, x in enumerate(bays):
        v.put("v7_벽 행거_기둥", f"post{i + 1}", [x, lift, 0], scale=(sx, 1, 1))
        v.put("v7_벽판_나무" if i % 2 == 0 else "v7_벽판_흰", f"panel{i + 1}", [x, 250, 0],
              scale=(sx, (panel_top - 250) / 1957, 1))
        v.put("v7_벽판_흰", f"strip{i + 1}", [x, panel_top, 0], scale=(sx, (lift + 2481 - panel_top) / 1957, 1))

    side = V.rot_y(90)
    hook = lambda part: V.bbox(V.LIB[part])[1][1]  # hanger top above the model origin
    rail_z = 385  # bar centre off the wall (v7_봉 bar at z 370-400)
    shelf_d = 0.8  # board 112-532 -> 90-425 off the wall

    def shelf(key, x0, x1, top):
        return v.put("v7_선반", key, [(x0 + x1) / 2, top, 0], scale=((x1 - x0) / 1254, 1, shelf_d))

    def bar(key, x0, x1, y):
        return v.put("v7_봉", key, [(x0 + x1) / 2, y, 0], scale=((x1 - x0) / 1253, 1, 1))

    def hung(key, group, label, prefix, first, x0, x1, y, cols, count, gap, bay_x, facing=90, z=rail_z):
        """garments on the bar at height y (bar top) from x0 to x1: cols = colour per garment (v7_맨투맨)"""
        mix = [c if c.startswith("v7_") else f"v7_맨투맨_{c}" for c in cols]
        n = len(mix)
        xs = [x0 + (x1 - x0) * k / max(n - 1, 1) for k in range(n)]
        zs = z if isinstance(z, (list, tuple)) else [z] * n
        rot = side if facing == 90 else V.I3
        sy = 1.2 if facing == 90 else 1  # the photo's long-sleeve jackets hang ~20 % longer than the store 맨투맨
        v.rack(key, group, label, mix, prefix, first, [[x, y - hook(m) * sy, zz] for x, m, zz in zip(xs, mix, zs)],
               count, "패딩", facing, gap=gap, rot=rot, scale=(1, sy, 0.7) if facing == 90 else (1, 1, 1),
               line=[[x0, y, zs[0]], [x1, y, zs[0]]], bounds=(bay_x - 540 - x0, bay_x + 540 - x0),
               **({"swapDepth": V.SIDE_DEPTH} if facing == 90 else {}))

    with v.zone("b1", "1칸", "1칸", "전체", dict(x=-1650, w=1080, z=70, y0=300, y1=2500), "A"):
        # ---- bay 1: shelf + side-hung rail, both reaching past the left upright to the niche wall
        x = bays[0]
        y = Y(832)
        things = [shelf("b1-shelf", -2420, -1100, y)]
        with v.prop("sign", "1칸", "RUN&FIT 사인", "xy"):
            things.append(v.put("v7_사인_런앤핏", "runfit-sign", [XF(253), y + 108, 200]))
        with v.prop("poster1", "1칸", "액자 포스터", "xy"):
            v.picture("v7_포스터_액자", "P01", "1칸 액자 포스터", [XF(388), y + 355, 120])
        things.append(v.items[-1])
        with v.prop("mountain", "1칸", "산 조형물", "xy"):
            things.append(v.put("v7_조형_산", "mountain", [XF(537), y + 273, 160]))
        v.level("b1-shelf", "1칸", "선반", y, things, 1200, 2000)
        y = Y(858)
        cols = ["카키", "카키", "회색", "회색", "브라운", "블랙", "네이비", "블랙", "회색", "블랙"]
        hung("b1-rail", "1칸", "옆걸이", "A", 1, -2380, -1160, y, cols, 8, 150, -1770)
        v.level("b1-rail", "1칸", "봉", y, [bar("b1-bar", -2420, -1120, y)], 1000, 1800, racks=["b1-rail"])
        v.racks[-1]["bounds"] = [-40, 1260]  # whole rail: niche wall .. right upright

    with v.zone("b2", "2칸", "2칸", "전체", dict(x=-550, w=1080, z=70, y0=300, y1=2500), "B"):
        # ---- bay 2: poster on the panel, shoe shelf, cap shelf, side-hung rail
        x = bays[1]
        with v.prop("poster2", "2칸", "RUN&FIT 포스터", "xy"):
            v.picture("v7_포스터_런앤핏", "P02", "2칸 RUN&FIT 포스터", [X(888), Y(685), 80])
        y = Y(765)
        shoes = [v.product("운동화", f"S0{i + 1}", f"2칸 위 선반 신발 {i + 1}", "신발", [XF(px), y, 250], -90,
                           rot=V.rot_y(-90), default="DXSH4236N_WHS", mount="place") for i, px in enumerate((705, 755))]
        v.level("b2-top", "2칸", "위 선반", y, [shelf("b2-top", x - 540, x + 540, y)] + shoes, 1500, 2200)
        y = Y(875)
        caps = [v.product(f"v7_볼캡_{c}", f"H0{i + 1}", f"2칸 아래 선반 모자 {i + 1}", "모자", [XF(px), y, 240], 0,
                          mount="place") for i, (c, px) in enumerate((("블랙", 670), ("베이지", 812), ("라임", 950)))]
        v.level("b2-mid", "2칸", "아래 선반", y, [shelf("b2-mid", x - 540, x + 540, y)] + caps, 1100, 1800)
        y = Y(900)
        cols = ["연하늘", "하늘", "하늘", "회색", "회색", "회색", "블랙", "오렌지", "회색", "라임", "블랙", "회색"]
        hung("b2-rail", "2칸", "옆걸이", "B", 1, x - 480, x + 480, y, cols, 10, 130, x)
        v.level("b2-rail", "2칸", "봉", y, [bar("b2-bar", x - 540, x + 540, y)], 900, 1700, racks=["b2-rail"])

    with v.zone("b3", "3칸", "3칸", "전체", dict(x=550, w=1080, z=70, y0=300, y1=2500), "C"):
        # ---- bay 3: torsos in T-shirts on the shelf, a face-out + side-hung on the rail
        x = bays[2]
        y = Y(845)
        tee_hook = hook("v7_티셔츠_화이트")
        things = [shelf("b3-shelf", x - 540, x + 540, y)]
        with v.prop("dlogo", "3칸", "D 조형물", "xy"):
            things.append(v.put("v7_조형_D", "d-logo", [XF(1088), y + 110, 180]))
        for i, (px, top_py, c) in enumerate(((1165, 600, "화이트"), (1305, 552, "라임"))):
            h = Y(top_py) - y  # torso top above the shelf
            s = h / 1102
            tx = XF(px)
            with v.prop(f"torso{i + 1}", "3칸", f"토르소 {i + 1}", "x"):
                things.append(v.product("토르소", f"M0{i + 1}", f"3칸 토르소 {i + 1}", "착장", [tx, y, 230], 0,
                                        scale=(s, s, s), fit="model"))
                # the T-shirt it wears: the store tee, hanger clipped off, over the torso's chest
                tee_y = y + h * 0.80 - 600
                things.append(v.put(f"v7_티셔츠_{c}", f"torso-tee{i + 1}", [tx, tee_y, 230 + 221 * s + 10],
                                    scale=(1.0, 1.0, 1.0), clip=[0, tee_y + 610]))
        v.level("b3-shelf", "3칸", "선반", y, things, 1200, 1900)
        y = Y(870)
        hung("b3-front", "3칸", "정면걸이", "C", 1, XF(1155), XF(1155), y, ["브라운"], 1, None, x, facing=0, z=rail_z + 40)
        hung("b3-rail", "3칸", "옆걸이", "C", 2, XF(1260), x + 500, y, ["연하늘", "블랙", "회색", "라임", "라임", "화이트", "블랙"],
             5, 120, x)
        v.racks[-1]["bounds"] = [-80, x + 540 - XF(1260)]
        v.level("b3-rail", "3칸", "봉", y, [bar("b3-bar", x - 540, x + 540, y)], 1000, 1800,
                racks=["b3-front", "b3-rail"])

    with v.zone("b4", "4칸", "4칸", "전체", dict(x=1650, w=1080, z=70, y0=300, y1=2500), "D"):
        # ---- bay 4: face-out T-shirts on a top bar, empty shelf, long side-hung rail
        x = bays[3]
        y = Y(555)
        hung("b4-top", "4칸", "위 정면걸이", "D", 1, XF(1520), XF(1840), y, ["v7_티셔츠_토프", "v7_티셔츠_라임", "v7_티셔츠_화이트"],
             3, 330, x, facing=0, z=[rail_z, rail_z + 30, rail_z - 30])
        v.level("b4-top", "4칸", "위 봉", y, [bar("b4-topbar", x - 540, x + 540, y)], 1900, 2500, racks=["b4-top"])
        y = Y(885)
        v.level("b4-shelf", "4칸", "선반", y, [shelf("b4-shelf", x - 540, x + 600, y)], 1100, 1900)
        y = Y(905)
        cols = ["크림", "화이트", "브라운", "블랙", "화이트", "토프", "화이트", "회색", "블랙", "핑크", "블랙", "브라운", "네이비",
                "회색", "블랙"]
        hung("b4-rail", "4칸", "옆걸이", "D", 4, x - 500, x + 600, y, cols, 13, 90, x)
        v.racks[-1]["bounds"] = [-40, 1150]
        v.level("b4-rail", "4칸", "봉", y, [bar("b4-bar", x - 540, x + 640, y)], 900, 1700, racks=["b4-rail"])

    # ---- floor: granite plinths, a pair of shoes on each
    for key, cx, w, h, shoe, px in (("left", -1950, 820, 220, "DXSH4236N_WHS", (215, 300)),
                                    ("mid", 350, 560, 260, "DXSH4236N_BES", (1110, 1150))):
        with v.prop(f"plinth-{key}", "바닥", "좌대 (왼쪽)" if key == "left" else "좌대 (가운데)", "xz"):
            v.put("v7_좌대", f"plinth-{key}", [cx, 0, 650], scale=(w / 1000, h / 1000, 520 / 1000))
            for k, dx in enumerate((-80, 80)):
                sid = f"F{len([s for s in v.slots if s['id'].startswith('F')]) + 1:02d}"
                v.product("운동화", sid, f"{'왼쪽' if key == 'left' else '가운데'} 좌대 신발 {k + 1}", "신발",
                          [cx + dx, h, 650], 0, default=shoe)
    return v.scene([0, 1450, 4600], 50)
