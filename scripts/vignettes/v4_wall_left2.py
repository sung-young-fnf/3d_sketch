"""
사진 04 (1층 벽면좌측2): three [DX명동]벽 행거 modules on the wall, grey | wood | grey.
  위:   왼쪽 - round loop with 2 lilac jackets side-hung + 1 white face-out on the arm right of it
        가운데 - poster (wood panel), 2 caps on a short shelf
        오른쪽 - round loop with 2 ivory jackets side-hung + 1 brown face-out on the arm right of it
  아래: 왼쪽 ledge + rail 10 side-hung (pants, tops, jackets) | 가운데 shelf + rail 6 side-hung + brown hooded
        face-out | 오른쪽 ledge + rail 11 side-hung; white 반슬리 pair on a granite plinth in front of the middle.
Parts: scripts/vignettes/parts_v4.py (v4_*.glb, cut out of [DX명동]벽 행거_3-1 / 3-2 + photo poster / stone).

Scale: the photo (shown 2000 px wide) is ~2.17 mm per px at the wall - the side ledges sit at y px 718 against the
floor line at 1260, and the 벽 행거 ledge is 1151 mm high (also: loop bar at px 330 -> 2018 mm vs the fixture's
1978, wood panel 460 px -> 1000 mm). x = (px - 955) * 2.17 (the middle of the wood panel), y = (1260 - py) * 2.17.
"""

PANEL_Z = 221   # back of the 벽 행거 panel -> wall face (z 0)
TRACK_Z = 74    # loop / arm back plate in front of the wall (on the top track)
LEDGE_HOOK = -101  # rail bar top below the ledge top
RAIL_Z = PANEL_Z + 170  # rail bar, 391 off the wall


def build(V):
    md = V.MD + "/부품/"
    V.LIB.update({
        "v4 벽판 회색": md + "v4_벽판_회색.glb",
        "v4 벽판 나무": md + "v4_벽판_나무.glb",
        "v4 선반봉": md + "v4_선반봉.glb",
        "v4 상단레일": md + "v4_상단레일.glb",
        "v4 고리": md + "v4_고리.glb",
        "v4 팔": md + "v4_팔.glb",
        "v4 포스터": md + "v4_포스터.glb",
        "v4 좌대": md + "v4_좌대.glb",
        "v4 볼캡": "assets/F&F/＊소품/의류&잡화/모자/볼캡_모자_낱개__8bce7cac.glb",
    })
    v = V.Vignette("v4", "04 1층 벽면좌측2", "04_벽면좌측2.jpg", width=4800, depth=6000, floor_color="c9c6c0")
    top = lambda part: V.bbox(V.LIB[part])[1][1]  # hook top above the model origin (store clothes: origin at the hem)
    pad_h = top("패딩")
    side = V.rot_y(90)

    # wall modules: grey (3-1 panel) x -1007, wood (3-2) x 0, grey x +1057 (a bit wider in the photo: 505 px vs 435)
    v.put("v4 벽판 회색", "panel-l", [-1007, 0, 240])
    v.put("v4 벽판 나무", "panel-c", [0, 0, PANEL_Z])
    v.put("v4 벽판 회색", "panel-r", [1057, 0, 240], scale=(1.1, 1, 1))
    v.put("v4 상단레일", "track-l", [-1007, 1949, PANEL_Z])
    v.put("v4 상단레일", "track-r", [1057, 1949, PANEL_Z], scale=(1.1, 1, 1))

    # top: loop (photo px 210..600 left / 1255..1550 right, kept on the panel) + arm with the face-out
    def top_side(key, where, first, x0, length, arm_x, side_defaults, face_default):
        v.put("v4 고리", f"{key}-loop", [x0, 1978, TRACK_Z], scale=(length / 484, 1, 1))
        v.put("v4 팔", f"{key}-arm", [arm_x, 1985, TRACK_Z])
        z = TRACK_Z + 220  # loop front bar
        xs = [x0 + 90 + (length - 180) * k / 3 for k in range(4)]
        v.rack(f"{key}-loop", "위칸", f"{where} 옆걸이", "패딩", "U", first,
               [[x, 1978 - pad_h, z] for x in xs], 2, "패딩", 90, gap=200, rot=side, scale=(1, 1, 0.32),
               swapDepth=V.SIDE_DEPTH, line=[[xs[0], 1978, z], [xs[-1], 1978, z]], defaults=side_defaults,
               bounds=(-90, length - 90))
        v.rack(f"{key}-arm", "위칸", f"{where} 정면걸이", "패딩", "U", first + 4,
               [[arm_x, 1985 - pad_h, TRACK_Z + 240 - 60 * k] for k in range(3)], 1, "패딩", 0, gap=60,
               anchor="start", defaults=[face_default])

    with v.zone("top-l", "왼쪽", "왼쪽 위", "위", dict(x=-1007, w=1000, z=60, y0=1500, y1=2300), "U"):
        top_side("left", "왼쪽", 1, -1490, 540, -820, ["X26FDWDJ9T066_LPL", "X26FDWDJ9T066_LPL"], "X26FDWDJ9G166_IVS")
    with v.zone("top-r", "오른쪽", "오른쪽 위", "위", dict(x=1057, w=1100, z=60, y0=1500, y1=2300), "U"):
        top_side("right", "오른쪽", 8, 650, 640, 1500, ["X26FDWDJ9R066_IVS", "X26FDXDJ8C066_IVS"], "X26FDWDJ9J066_DWS")

    # poster on the wood panel (px 727..1195 x 308..582) and the 2 caps on the middle shelf
    with v.zone("top-c", "가운데", "가운데 위", "위", dict(x=0, w=1000, z=60, y0=1500, y1=2300), "U"):
        with v.prop("poster", "가운데", "포스터", "xy"):
            v.picture("v4 포스터", "P01", "가운데 포스터", [0, 1770, 30])

    def hung(key, group, label, prefix, first, x0, x1, hook_y, mix, count, gap, defaults, bounds, scales=None):
        n = len(mix)
        xs = [x0 + (x1 - x0) * k / (n - 1) for k in range(n)]
        sc = scales or [(1, 1, 0.32 if m == "패딩" else 1) for m in mix]
        v.rack(key, group, label, mix, prefix, first,
               [[x, hook_y - top(m) * s[1], RAIL_Z] for x, m, s in zip(xs, mix, sc)], count, "패딩", 90, gap=gap,
               rot=side, scale=sc, swapDepth=V.SIDE_DEPTH, line=[[x0, hook_y, RAIL_Z], [x1, hook_y, RAIL_Z]],
               defaults=defaults, bounds=(bounds[0] - x0, bounds[1] - x0))

    # side ledges: wider than the panels (px 130..725 left, 1190..1845 right), top 1151
    for key, where, cx, w in (("l", "왼쪽", -1146, 1287), ("r", "오른쪽", 1217, 1428)):
        with v.zone(f"bot-{key}", where, f"{where} 아래", "아래", dict(x=cx, w=w - 60, z=60, y0=300, y1=1450), key.upper()):
            sx = w / 1001
            shelf = v.put("v4 선반봉", f"{key}-ledge", [cx, 1151, PANEL_Z], scale=(sx, 1, 1))
            lo, hi = cx - 484 * sx, cx + 484 * sx  # rail bar ends
            hook_y = 1151 + LEDGE_HOOK
            if key == "l":  # photo: pants x2, black / white / lilac tops, black / pink jackets, pants, brown / white jacket
                mix = ["바지", "바지", "맨투맨", "티셔츠", "맨투맨", "패딩", "패딩", "바지", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩"]
                hung("l-rail", "아래칸", "왼쪽 옆걸이", "L", 1, lo + 70, hi - 70, hook_y, mix, 10, 125,
                     [None, None, None, None, None, "X26FDWDJ9J066_BKS", "X26FDWDJ9F066_PKL", None, "X26FDWDJ9J066_DWS",
                      "X26FDWDJ93066_CRS"], (lo, hi))
            else:  # black hood, light grey, pants, navy, taupe top, light blue top, pants, black, brown, light grey, sky blue
                mix = ["패딩", "패딩", "바지", "패딩", "맨투맨", "티셔츠", "바지", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩"]
                hung("r-rail", "아래칸", "오른쪽 옆걸이", "R", 1, lo + 70, hi - 70, hook_y, mix, 11, 115,
                     ["X26FDWDJ9J066_BKS", "X26FDWDJ86066_LGL", None, "X26FDWDJ9G066_INL", None, None, None,
                      "X26FDXDJ8C066_BKS", "X26FDWDJ9R066_DWS", "X26FDWDJ93066_LGL", "X26FDWDJ9G166_SBL"], (lo, hi))
            v.level(f"{key}-ledge", "아래칸", f"{where} 선반·봉", 1151, [shelf], 900, 1500, racks=[f"{key}-rail"])

    # middle shelf + rail: px 650..1210 at py 660 (1300 mm), a little higher than the side ledges
    with v.zone("bot-c", "가운데", "가운데 아래", "아래", dict(x=-30, w=1000, z=60, y0=300, y1=1450), "C"):
        cx, w = -30, 1210
        sx = w / 1001
        shelf = v.put("v4 선반봉", "c-ledge", [cx, 1300, PANEL_Z], scale=(sx, 1, 1))
        caps = [v.put("v4 볼캡", f"cap{i + 1}", [x, 1300, 250]) for i, x in enumerate((-315, 130))]
        lo, hi = cx - 484 * sx, cx + 484 * sx
        hook_y = 1300 + LEDGE_HOOK
        # black / beige shorts (pants cut short), brown / ivory fleece vests, black / white jackets
        mix = ["바지", "바지", "패딩", "패딩", "패딩", "패딩", "패딩", "패딩"]
        scales = [(1, 0.5, 1), (1, 0.5, 1)] + [(1, 1, 0.32)] * 6
        hung("c-rail", "아래칸", "가운데 옆걸이", "C", 1, lo + 70, 0, hook_y, mix, 6, 100,
             [None, None, None, None, "X26FDXDJ8C066_BKS", "X26FDWDJ9M066_IVS"], (lo, 40), scales)
        v.rack("c-face", "아래칸", "가운데 정면걸이", "패딩", "C", 9, [[230, hook_y - pad_h, RAIL_Z + 40]], 1, "패딩", 0,
               defaults=["X26FDWDJ9R066_DWS"])
        v.level("c-ledge", "아래칸", "가운데 선반·봉", 1300, [shelf] + caps, 1000, 1450, racks=["c-rail", "c-face"])

    # granite plinth (px 955..1165, front edge py 1420) with a white 반슬리 pair, toes to the camera
    with v.prop("plinth", "바닥", "좌대", "xz"):
        v.put("v4 좌대", "plinth", [230, 0, 700])
        for i, dx in enumerate((-75, 75)):
            v.product("운동화", f"S0{i + 1}", f"좌대 신발 {i + 1}", "신발", [230 + dx, 320, 700], 0, rot=V.I3,
                      default="DXSH4236N_WHS", mount="place")
    return v.scene([150, 1250, 4700], 40)
