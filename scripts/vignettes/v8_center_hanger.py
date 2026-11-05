"""
사진 08 (08_중앙행거.jpg + 08_중앙행거_b.jpg): the 1층 centre fixture, again one long side (3 bays, posts 1300 mm apart)
of [DX명동]스탠드 행거, rebuilt as the _b view shows it (left -> right):
  왼쪽 칸   wood shelf 1600 (brown duffel + cap on a head stand) / wood shelf 1250 (반슬리 sneakers)
            + rail 1000: side-hung tops / pants with two face-outs on arms in front
  가운데 칸 top rail 1950: side-hung navy / white sweatshirts + a black face-out on an arm
            + rail 1050: side-hung tops (black, navy, grey, white, lilac ...)
  오른쪽 칸 4 angled grey cap trays (front edge 1600 / 1170 / 740 / 310, 18 deg) with a front and a back row of caps
            in the photo's colours (ball caps; row 2 = flat camp caps)
Scale: photo _b, middle bay posts 865 -> 1430 px (display 2000 px wide) = 1300 mm -> about 2.3 mm/px at the fixture;
heights from the post (2700 mm) and the floor line.
Recoloured caps / sweatshirts / duffel / trays: scripts/vignettes/_v8_parts.py (부품/v8_*.glb).
"""
import math

MD = "assets/F&F/국내-명동/[디스커버리 명동]"
LIBM = "assets/F&F/＊소품"


def build(V):
    part = lambda name: f"{MD}/부품/v8_{name}.glb"
    caps = ("회색", "세이지", "모브", "검정", "흰색", "주황", "하늘", "스톤", "연그린", "그린", "아이보리", "차콜",
            "베이지", "카키", "네이비", "브라운")
    sweats = ("흰색", "라일락", "회색", "네이비", "검정", "브라운", "하늘", "베이지", "핑크")
    V.LIB.update({f"v8 볼캡 {c}": part(f"볼캡_{c}") for c in caps})
    V.LIB.update({f"v8 캠프캡 {c}": part(f"캠프캡_{c}") for c in ("흰색", "주황", "검정", "하늘", "베이지", "회색")})
    V.LIB.update({f"v8 맨투맨 {c}": part(f"맨투맨_{c}") for c in sweats})
    V.LIB.update({"v8 더플백": part("더플백"), "v8 캡선반": part("캡선반"),
                  "v8 두상 모자": part("두상"), "v8 두상 머리": part("두상_머리"), "v8 두상 캡": part("두상_캡"),
                  "v8 바지": f"{LIBM}/의류&잡화/의류/옷걸이/옷걸이 & 바지__ZtJEzVE4.glb"})

    v = V.Vignette("v8", "08 1층 중앙행거", "08_중앙행거.jpg", width=6000, depth=7000, floor_color="c9c8c4")
    Z = 1200  # upright plane (double-sided fixture, like 03)
    to_x = V.rot_y(-90)
    side = V.rot_y(90)
    v.put("스탠드 행거", "frame", [0, 0, Z], rot=to_x)
    bay = {"왼쪽 칸": -1300, "가운데 칸": 0, "오른쪽 칸": 1300}
    hook = lambda p: V.bbox(V.LIB[p])[1][1]
    inner = 600  # bay centre -> inner face of a post

    def mul(a, b):
        return [[sum(a[r][k] * b[k][c] for k in range(3)) for c in range(3)] for r in range(3)]

    def board(key, x, top, depth=380):
        lay = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]
        b = v.put("스탠드 판", f"{key}-board", [x, top - 12.5, Z - 40 + depth / 2], rot=lay,
                  scale=(25 / 18, 1190 / 2400, depth / 100))
        arms = [v.put("스탠드 팔", f"{key}-arm{i}", [x + dx, top - 25 - 18, Z + 100], rot=to_x) for i, dx in
                enumerate((-540, 540))]
        return [b, *arms]

    def rail(key, x, y):
        return v.put("스탠드 봉", key, [x, y, Z], rot=to_x)

    def hung(key, group, label, prefix, first, x0, x1, y, mix, count, gap, defaults=()):
        """side-hung garments (shoulder to the camera) on the bay rail at y, one part per garment"""
        n = len(mix)
        bay_x = (x0 + x1) / 2
        xs = [x0 + (x1 - x0) * k / (n - 1) for k in range(n)]
        bar = y + 25
        v.rack(key, group, label, list(mix), prefix, first, [[x, bar - hook(m), Z] for x, m in zip(xs, mix)], count,
               "패딩", 90, gap=gap, rot=side, scale=[(1, 1, 1)] * n, line=[[x0, bar, Z], [x1, bar, Z]],
               defaults=defaults, swapDepth=V.SIDE_DEPTH, bounds=(bay_x - inner - x0, bay_x + inner - x0))

    def face_arm(key, slot, label, x, y, p, reach=1.8):
        """a face-out on a 스탠드 팔 stretched toward the camera, hook at the arm tip"""
        y += 115  # the arm sits above the rail tube (as 03's hero arm)
        arm = v.put("스탠드 팔", f"{key}-arm", [x, y + 18, Z + 121 * reach - 8], rot=to_x, scale=(reach, 1, 1))
        top = y + 25
        it = v.product(p, slot, label, "패딩", [x, top - hook(p), Z + 242 * reach - 40], 0)
        return [arm, it]

    with v.zone("l", "왼쪽 칸", "왼쪽 칸", "전체", dict(x=-1300, w=1190, z=Z - 40, y0=250, y1=2400, stand=True), "L"):
        # ---------------------------------------------------------------- 왼쪽 칸
        x = bay["왼쪽 칸"]
        top = board("l-top", x, 1600)
        bag = v.product("v8 더플백", "G01", "왼쪽 칸 위 선반 더플백", "가방", [x - 220, 1600, Z + 160], 0,
                        scale=(1.05,) * 3, mount="place")
        head = v.put("v8 두상 머리", "head", [x + 300, 1600, Z + 140], rot=V.rot_y(90), scale=(1.15,) * 3)
        # its cap: a 모자 slot (a swapped cap sits on the head where this one's brim-down edge is)
        cap = v.product("v8 두상 캡", "H01", "왼쪽 칸 위 선반 두상 모자", "모자", [x + 300, 1600, Z + 140], 90,
                        rot=V.rot_y(90), scale=(1.15,) * 3, mount="place")
        v.level("l-top", "왼쪽 칸", "위 선반", 1600, top + [bag, head, cap], 1300, 2200)
        mid = board("l-mid", x, 1250)
        shoes = [v.product("운동화", f"S0{i + 1}", f"왼쪽 칸 아래 선반 신발 {i + 1}", "신발", [x + dx, 1250, Z + 170], 90,
                           rot=V.SHOE_ROT, default="DXSH4236N_BES") for i, dx in enumerate((-330, -110))]
        v.level("l-mid", "왼쪽 칸", "아래 선반", 1250, mid + shoes, 900, 1550)
        mix = ["v8 바지", "v8 바지", "v8 맨투맨 브라운", "v8 맨투맨 흰색", "v8 바지", "v8 맨투맨 네이비",
               "v8 맨투맨 네이비", "v8 바지", "v8 맨투맨 베이지", "v8 맨투맨 검정"]
        hung("l-rail", "왼쪽 칸", "옆걸이", "L", 1, x - 560, x + 560, 1000, mix, 7, 110)
        fo = face_arm("l-fo1", "L11", "왼쪽 칸 정면걸이 1", x - 250, 1000, "v8 맨투맨 베이지")
        fo += face_arm("l-fo2", "L12", "왼쪽 칸 정면걸이 2", x + 200, 1000, "v8 맨투맨 네이비", reach=2.4)
        v.level("l-rail", "왼쪽 칸", "봉·정면걸이", 1000, [rail("l-rail-bar", x, 1000)] + fo, 800, 1300, racks=["l-rail"])

    with v.zone("c", "가운데 칸", "가운데 칸", "전체", dict(x=0, w=1190, z=Z - 40, y0=250, y1=2400, stand=True), "C"):
        # ---------------------------------------------------------------- 가운데 칸
        x = bay["가운데 칸"]
        mix = ["v8 맨투맨 네이비", "v8 맨투맨 네이비", "v8 맨투맨 흰색", "v8 맨투맨 흰색", "v8 맨투맨 회색", "v8 맨투맨 하늘"]
        hung("c-top", "가운데 칸", "위 옆걸이", "C", 1, x - 560, x - 60, 1950, mix, 4, 110)
        fo = face_arm("c-fo", "C07", "가운데 칸 위 정면걸이", x + 300, 1950, "v8 맨투맨 검정", reach=2.2)
        v.level("c-top", "가운데 칸", "위 봉·정면걸이", 1950, [rail("c-top-bar", x, 1950)] + fo, 1700, 2300, racks=["c-top"])
        mix = ["v8 맨투맨 검정", "v8 맨투맨 네이비", "v8 맨투맨 회색", "v8 맨투맨 회색", "v8 맨투맨 흰색", "v8 맨투맨 흰색",
               "v8 맨투맨 검정", "v8 맨투맨 검정", "v8 맨투맨 라일락", "v8 맨투맨 핑크", "v8 맨투맨 흰색", "v8 맨투맨 흰색",
               "v8 맨투맨 흰색", "v8 맨투맨 네이비", "v8 맨투맨 라일락", "v8 맨투맨 흰색"]
        hung("c-rail", "가운데 칸", "아래 옆걸이", "C", 8, x - 560, x + 560, 1050, mix, 14, 75)
        v.level("c-rail", "가운데 칸", "아래 봉", 1050, [rail("c-rail-bar", x, 1050)], 850, 1400, racks=["c-rail"])

    with v.zone("r", "오른쪽 칸", "오른쪽 칸", "전체", dict(x=1300, w=1190, z=Z - 40, y0=250, y1=2400, stand=True), "K"):
        # ---------------------------------------------------------------- 오른쪽 칸: angled cap trays
        x = bay["오른쪽 칸"]
        a = math.radians(18)
        c, s = math.cos(a), math.sin(a)
        tilt = [[1, 0, 0], [0, c, -s], [0, s, c]]  # model +z (front) tips down
        lay = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]
        depth = 420
        rows = (  # (front row, back row) left -> right, as in the photo top -> bottom
            (1600, "볼캡", ("회색", "세이지", "모브", "검정"), ("하늘", "네이비", "스톤", "검정")),
            (1170, "캠프캡", ("흰색", "주황", "검정", "하늘"), ("베이지", "회색", "하늘", "검정")),
            (740, "볼캡", ("스톤", "연그린", "그린", "검정"), ("베이지", "카키", "주황", "네이비")),
            (310, "볼캡", ("검정", "하늘", "아이보리", "차콜"), ("네이비", "회색", "브라운", "검정")),
        )
        for i, (yf, kind, front, back) in enumerate(rows):
            zb = Z - 40
            hb = yf + depth * s
            surf = [x, (yf + hb) / 2, zb + depth * c / 2]  # middle of the tray top
            b = v.put("v8 캡선반", f"cap{i + 1}-tray", [surf[0], surf[1] - 12.5 * c, surf[2] - 12.5 * s],
                      rot=mul(tilt, lay), scale=(25 / 18, 1190 / 2400, depth / 100))
            arms = [v.put("스탠드 팔", f"cap{i + 1}-arm{k}", [x + dx, hb - 40, Z + 60], rot=to_x) for k, dx in
                    enumerate((-540, 540))]
            items = [b, *arms]
            for row, (vv, cols) in enumerate(((95, front), (-110, back))):
                for k, col in enumerate(cols):
                    u = -435 + 290 * k
                    p = [surf[0] + u, surf[1] - s * vv, surf[2] + c * vv]
                    n = len([s for s in v.slots if s["id"].startswith("K")]) + 1
                    items.append(v.product(f"v8 {kind} {col}", f"K{n:02d}", f"모자 선반 {i + 1} {'앞' if row == 0 else '뒤'}줄 {k + 1}",
                                           "모자", p, 0, rot=tilt, scale=(1.05,) * 3, mount="place", tilt=18))
            v.level(f"cap{i + 1}", "오른쪽 칸", f"모자 선반 {i + 1}", yf, items, max(150, yf - 350), min(2000, yf + 350))

    return v.scene([0, 1350, Z + 3700], 40)
