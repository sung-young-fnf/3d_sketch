"""
사진 05 (디스커버리 명동 1F 벽면좌측1, AIRWELL 경량패딩): 4 rounded back panels, grey | wood | grey | wood
([DX명동]벽 행거_3-1 / _3-2 cut apart by scripts/vignettes/parts_v5.py), each with a wood shelf + a hanging bar under it.
  1 grey : shelf 1300 (2 AIRWELL posters) + bar: side-hung 3 + face-out 2 (shelf / bar run past the panel's left edge)
  2 wood : shelf 1200 with 2 torsos (M01 black hooded, M02 brown) + bar: side-hung 13
  3 grey : shelf 1330 (2 AIRWELL posters) + bar: side-hung 7 + face-out 1
  4 wood : round loop 2200 with 2 face-outs + single arm with 1 face-out; shelf 1250 + bar: side-hung 10
           (pants, a vest and paddings; runs past the panel's right edge)
  floor  : a stone plinth in front of panel 3/4 with a pair of white sneakers
Scale: the 4 panels (4 x 1007 mm) span 1710 px of the 2400 px photo -> 2.36 mm / px at the wall,
~2.2 mm / px at the shelf fronts; heights from the panel bottom (22 mm) up.
"""
MD = "assets/F&F/국내-명동/[디스커버리 명동]"


def build(V):
    V.LIB.update({
        "v5 회색판": f"{MD}/부품/v5_회색판.glb",
        "v5 나무판": f"{MD}/부품/v5_나무판.glb",
        "v5 선반": f"{MD}/부품/v5_선반.glb",
        "v5 고리": f"{MD}/부품/v5_고리.glb",
        "v5 좌대": "assets/F&F/중국/[16]스자좡 비엔티안 시티점/가구/[16]신발 좌대_gray__5eb7a0ef.glb",
        **{f"v5 포스터_{i}": f"{MD}/부품/v5_포스터_{i}.glb" for i in range(1, 5)},
    })
    v = V.Vignette("v5", "05 1층 벽면좌측1", "05_벽면좌측1.jpg", width=5200, depth=6000, floor_color="c9c6c0")
    W = 1007
    bay = [(-1.5 + i) * W for i in range(4)]  # panel centres
    for i, x in enumerate(bay):
        v.put("v5 회색판" if i % 2 == 0 else "v5 나무판", f"panel{i + 1}", [x, 0, 0])

    pad_h = V.bbox(V.LIB["패딩"])[1][1]  # hook top above the store 패딩's hem (its origin)
    hook = lambda part: V.bbox(V.LIB[part])[1][1]
    side = V.rot_y(90)
    BAR_Z, BAR_DROP = 390, 101  # the bar under each shelf: 390 off the wall, tube top 101 below the ledge top

    def shelf(key, x, y, sx=1.0):
        return v.put("v5 선반", f"{key}-shelf", [x, y, 0], scale=(sx, 1, 1))

    def hung(key, group, label, prefix, first, x0, x1, y, mix, count, gap, defaults, facing=90, bounds=None):
        """garments on the bar whose tube top is at y, from x0 to x1 (fullest layout); mix = part per garment"""
        n = len(mix)
        xs = [x0 + (x1 - x0) * k / max(n - 1, 1) for k in range(n)]
        rot, deep = (side, 0.32) if facing == 90 else (V.I3, 1)
        v.rack(key, group, label, mix, prefix, first, [[x, y - hook(m), BAR_Z] for x, m in zip(xs, mix)], count, "패딩",
               facing, gap=gap, rot=rot, scale=[(1, 1, deep if m == "패딩" else 1) for m in mix],
               line=[[x0, y, BAR_Z], [x1 if n > 1 else x0 + 1, y, BAR_Z]], defaults=defaults,
               **({"swapDepth": V.SIDE_DEPTH} if facing == 90 else {}),
               **({"bounds": bounds} if bounds else {}))
        return key

    with v.zone("b1", "1칸", "1칸", "아래", dict(x=-1510.5, w=980, z=60, y0=300, y1=1950), "A"):
        # ---- 1 grey: posters on the shelf, bar below (side-hung black / silver / lime, face-out light blue + silver)
        x, y, sx = bay[0] - 100, 1300, 1.2
        its = [shelf("b1", x, y, sx)]
        with v.prop("poster1", "1칸", "왼쪽 포스터", "xy"):
            v.picture("v5 포스터_1", "P01", "1칸 왼쪽 포스터", [x - 160, y + 605 / 2, 170])
        its.append(v.items[-1])
        with v.prop("poster2", "1칸", "오른쪽 포스터", "xy"):
            v.picture("v5 포스터_2", "P02", "1칸 오른쪽 포스터", [x + 170, y + 540 / 2, 250])
        its.append(v.items[-1])
        lo, hi = x - 481 * sx, x + 487 * sx  # bar ends
        racks = [hung("b1-side", "1칸", "옆걸이", "A", 1, lo + 90, lo + 460, y - BAR_DROP, ["패딩"] * 5, 3, 150,
                      ["X26FDMDJ7I066_BKS", "X26FDMDJ7I066_GRS", "X26FDMDJ7I066_LWS"], bounds=(-40, 470)),
                 hung("b1-face", "1칸", "정면걸이", "A", 6, lo + 700, lo + 1000, y - BAR_DROP, ["패딩"] * 2, 2, 300,
                      ["X26FDMDJ7I066_SBS", "X26FDMDJ83066_GRL"], facing=0, bounds=(-450, hi - lo - 700))]
        v.level("b1", "1칸", "선반·봉", y, its, 900, 1800, racks=racks)

    with v.zone("b2", "2칸", "2칸", "아래", dict(x=-503.5, w=980, z=60, y0=300, y1=1950), "B"):
        # ---- 2 wood: two torsos on the shelf, 13 side-hung on the bar
        x, y = bay[1], 1200
        its = [shelf("b2", x, y)]
        hip = 363  # torso base bottom -> hip; its stand is clipped away below the shelf (as in 01)
        with v.prop("torsos", "2칸", "토르소 2개", "x"):
            its.append(v.product("토르소", "M01", "2칸 토르소 왼쪽", "착장", [x - 250, y - hip, 270], 0, fit="model",
                                 clip=[y, 3000], default="X26FDMDJ6A066_BKS"))
            its.append(v.product("토르소", "M02", "2칸 토르소 오른쪽", "착장", [x + 230, y - hip, 250], 0, fit="model",
                                 clip=[y, 3000], default="X26FDXDJ6M066_DWS"))
        racks = [hung("b2-side", "2칸", "옆걸이", "B", 1, x - 440, x + 440, y - BAR_DROP, ["패딩"] * 16, 13, 75,
                      ["X26FDMDJ71066_BKS", "X26FDMDJ7M066_DWS", "X26FDMDJ79066_NYD", "X26FDMDJ83066_BKS",
                       "X26FDWDJ80066_IVS", "X26FDXDJ6M066_INL", "X26FDMDJ7I066_SBS", "X26FDMDJ7I066_BKS",
                       "X26FDMDJ71066_GRL", "X26FDMDJ7I066_GRS", "X26FDMDJ79066_BKS", "X26FDMDJ7I066_LWS",
                       "X26FDMDJ7M066_BKS"], bounds=(-40, 920))]
        v.level("b2", "2칸", "선반·토르소·봉", y, its, 900, 1700, racks=racks)

    with v.zone("b3", "3칸", "3칸", "아래", dict(x=503.5, w=980, z=60, y0=300, y1=1950), "C"):
        # ---- 3 grey: posters, 7 side-hung + the grey face-out with the AIRWELL card
        x, y = bay[2], 1330
        its = [shelf("b3", x, y)]
        with v.prop("poster3", "3칸", "왼쪽 포스터", "xy"):
            v.picture("v5 포스터_3", "P03", "3칸 왼쪽 포스터", [x - 130, y + 580 / 2, 170])
        its.append(v.items[-1])
        with v.prop("poster4", "3칸", "오른쪽 포스터", "xy"):
            v.picture("v5 포스터_4", "P04", "3칸 오른쪽 포스터", [x + 230, y + 520 / 2, 250])
        its.append(v.items[-1])
        racks = [hung("b3-side", "3칸", "옆걸이", "C", 1, x - 440, x + 60, y - BAR_DROP, ["패딩"] * 9, 7, 75,
                      ["X26FDWDJ72066_BKS", "X26FDWDJ9M066_GRL", "X26FDWDJ9M066_DWS", "X26FDWDJ9T066_BKS",
                       "X26FDWDJ99166_LBL", "X26FDWDJ84066_BKS", "X26FDWDJ84066_PKL"], bounds=(-40, 540)),
                 hung("b3-face", "3칸", "정면걸이", "C", 10, x + 330, x + 330, y - BAR_DROP, ["패딩"], 1, None,
                      ["X26FDWDJ94166_GRL"], facing=0)]
        v.level("b3", "3칸", "선반·봉", y, its, 900, 1800, racks=racks)

    # tops of 1-3칸: nothing above the posters / torsos - a zone whose type can be 4칸 위's loop or a module
    for i in range(3):
        with v.zone(f"b{i + 1}-top", f"{i + 1}칸", f"{i + 1}칸 위", "위",
                    dict(x=bay[i], w=980, z=60, y0=1950, y1=2450), "ABC"[i]):
            pass

    # ---- 4 wood: loop + arm on top (mirrored: loop on the left as in the photo), shelf, mixed side-hung bar
    x = bay[3]
    y = 2200
    with v.zone("b4-top", "4칸", "4칸 위", "위", dict(x=1510.5, w=980, z=60, y0=1950, y1=2450), "D"):
        loop = v.put("v5 고리", "b4-loop", [x, y, 0], scale=(-1, 1, 1))
        BAR_Z = 314  # the loop's front bar (hung() reads it)
        racks = [hung("b4-loop", "4칸 위", "고리 정면걸이", "D", 1, x - 400, x - 50, y, ["패딩"] * 3, 2, 220,
                      ["X26FDWDJ9M066_IVS", "X26FDWDJ80066_IVS"], facing=0, bounds=(-400, 700))]
        BAR_Z = 390
        v.rack("b4-arm", "4칸 위", "외팔 정면걸이", "패딩", "D", 4, [[x + 266, y - pad_h, 300 - 60 * k] for k in range(4)],
               1, "패딩", 0, gap=60, anchor="start", defaults=["X26FDWDJ9M066_GRL"])
        v.level("b4-top", "4칸", "위 고리·외팔", y, [loop], 1900, 2300, racks=racks + ["b4-arm"])
    with v.zone("b4", "4칸", "4칸", "아래", dict(x=1510.5, w=980, z=60, y0=300, y1=1950), "D"):
        y, sx = 1250, 1.2
        xs = x + 100
        its = [shelf("b4", xs, y, sx)]
        lo, hi = xs - 481 * sx, xs + 487 * sx
        mix = ["바지", "바지", "티셔츠", "바지", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩"]
        racks = [hung("b4-side", "4칸", "옆걸이", "D", 8, lo + 60, hi - 120, y - BAR_DROP, mix, 10, 110,
                      [None, None, None, None, "X26FDWDJ9M066_BKS", "X26FDWDJ9F066_BKS", "X26FDWDJ9H066_BKS",
                       "X26FDWDJ9M066_GRL", "X26FDWDJ9F066_CRS", "X26FDWDJ9M066_IVS"], bounds=(-60, hi - lo - 60))]
        v.level("b4", "4칸", "선반·봉", y, its, 900, 1700, racks=racks)

    # ---- floor: stone plinth (764 x 500 x 500 scaled to 450 x 330 x 380) with a pair of white sneakers
    with v.prop("plinth", "바닥", "좌대", "xz"):
        px, pz, ph = 760, 900, 330
        v.put("v5 좌대", "plinth", [px, 0, pz], scale=(450 / 764, ph / 500, 380 / 500))
        for i, dx in enumerate((-75, 75)):
            v.product("운동화", f"S0{i + 1}", f"좌대 신발 {i + 1}", "신발", [px + dx, ph, pz], 0, default="DXSH4236N_WHS",
                      mount="place")
    return v.scene([0, 1200, 4800], 42)
