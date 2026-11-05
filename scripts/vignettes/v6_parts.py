"""
06 1층 벽면우측2 부품 -> assets/F&F/국내-명동/[디스커버리 명동]/부품/v6_*.glb

  - v6_벽판      [DX명동]벽 행거_3-2 without its ledge, loop and arm: wood back, slotted uprights, top / bottom bands
  - v6_선반      the 3-2 ledge (wood board + frame + front rail + light), top at y 0 - a level that moves up / down
  - v6_고리      the 3-2 round loop on top (side-hung), v6_팔 the single face-out arm next to it
  - v6_포스터    the poster of the middle bay (crop of 06_벽면우측2_b.jpg)
  - v6_좌대      the granite shoe plinth (450 x 250 x 450, texture cropped from 06_벽면우측2.jpg)
  - v6_모자 스탠드  a grey head stand for the cap on the right upper shelf
  - v6_<옷>_<색>  store clothes (옷걸이&맨투맨, 옷걸이 & 바지, 후드티) with the body tinted to the photo's colours
Every cut part is moved so the panel back is at z 0 (the wall face).
This file is not a vignette: build_vignettes.py reports it as skipped (it has no build()).

    python -X utf8 scripts/vignettes/v6_parts.py
"""
import io
import os
import struct
import sys

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from build_vignette_parts import FF, OUT, WALL_HANGER, read_glb, view_bytes, write_glb, subset, panel  # noqa: E402

SHOTS = os.path.join(FF, "국내-명동", "[디스커버리 명동]", "매장연출")
CLOTHES = os.path.join(FF, "＊소품", "의류&잡화", "의류", "옷걸이")
BACK = 221  # 3-2 model z of the panel back -> 0

# body colour per name (sRGB hex, read off the photos)
COLORS = {
    "블랙": "1c1c1e", "네이비": "232a40", "차콜": "3a3c40", "그레이": "70737a", "라이트그레이": "c4c8cc",
    "베이지": "b49e78", "아이보리": "ddd6c6", "화이트": "eeeeec", "브라운": "4a3428", "블루": "3e5f94",
    "스카이": "86a8c8", "세이지": "bfc0ad",
}
# store garment -> its body materials (the hanger keeps its own colour)
CLOTH = {
    "맨투맨": ("옷걸이&맨투맨__bcd34945.glb", ("Material.002", "[0130_Gainsboro]1.001")),
    "바지": ("옷걸이 & 바지__ZtJEzVE4.glb", ("[0018_Brown].003",)),
    "후드티": ("후드티__ZuR2XtyA.glb", ("[Color M00].003",)),
}
# which colours each garment is made in (v6_wall_right2.py uses these)
MADE = {
    "맨투맨": ("블랙", "네이비", "차콜", "그레이", "베이지", "아이보리", "화이트", "브라운", "블루", "스카이", "세이지"),
    "바지": ("블랙", "네이비", "차콜", "그레이", "베이지", "아이보리"),
    "후드티": ("블랙", "베이지", "브라운", "라이트그레이"),
}


def lin(hexs):
    return [round(((int(hexs[i:i + 2], 16) / 255) ** 2.2), 4) for i in (0, 2, 4)] + [1]


def tint(src, dst, mats, hexs):
    g, bin_ = read_glb(src)
    views = [(view_bytes(g, bin_, i), {k: v[k] for k in ("byteStride", "target") if k in v})
             for i, v in enumerate(g["bufferViews"])]
    for m in g["materials"]:
        if m.get("name") in mats:
            pbr = m.setdefault("pbrMetallicRoughness", {})
            pbr.pop("baseColorTexture", None)
            pbr["baseColorFactor"] = lin(hexs)
            pbr["roughnessFactor"] = 0.75
    write_glb(dst, g, views)


def box_glb(dst, boxes, name):
    """boxes: list of ((cx, cy, cz), (w, h, d) mm, PIL image or sRGB hex). One material per box, UV 0..1 per face."""
    f32 = lambda a: struct.pack(f"<{len(a)}f", *a)
    u16 = lambda a: struct.pack(f"<{len(a)}H", *a) + (b"\0\0" if len(a) % 2 else b"")
    views, accs, prims, mats, texs, imgs = [], [], [], [], [], []
    faces = [((1, 0, 0), (0, 0, -1), (0, 1, 0)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
             ((0, 1, 0), (1, 0, 0), (0, 0, -1)), ((0, -1, 0), (1, 0, 0), (0, 0, 1)),
             ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0))]
    for (c, s, look) in boxes:
        h = [v / 2000 for v in s]
        cc = [v / 1000 for v in c]
        pos, nrm, uv, idx = [], [], [], []
        for n, u, v in faces:
            base = len(pos) // 3
            for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                p = [cc[k] + n[k] * h[k] + su * u[k] * h[k] + sv * v[k] * h[k] for k in range(3)]
                pos += p
                nrm += list(n)
                uv += [(su + 1) / 2, 1 - (sv + 1) / 2]
            idx += [base, base + 1, base + 2, base, base + 2, base + 3]
        lo = [cc[k] - h[k] for k in range(3)]
        hi = [cc[k] + h[k] for k in range(3)]
        a0 = len(accs)
        for data, n_, t, mn, mx, tgt in ((f32(pos), 24, "VEC3", lo, hi, 34962), (f32(nrm), 24, "VEC3", None, None, 34962),
                                         (f32(uv), 24, "VEC2", None, None, 34962), (u16(idx), 36, "SCALAR", None, None, 34963)):
            views.append((data, {"target": tgt}))
            a = {"bufferView": len(views) - 1, "componentType": 5123 if t == "SCALAR" else 5126, "count": n_, "type": t}
            if mn:
                a["min"], a["max"] = mn, mx
            accs.append(a)
        pbr = {"metallicFactor": 0, "roughnessFactor": 0.8}
        if isinstance(look, str):
            pbr["baseColorFactor"] = lin(look)
        else:
            buf = io.BytesIO()
            look.convert("RGB").save(buf, "JPEG", quality=88)
            views.append((buf.getvalue(), {}))
            imgs.append({"bufferView": len(views) - 1, "mimeType": "image/jpeg"})
            texs.append({"source": len(imgs) - 1, "sampler": 0})
            pbr["baseColorTexture"] = {"index": len(texs) - 1}
        mats.append({"name": f"{name}{len(mats)}", "pbrMetallicRoughness": pbr})
        prims.append({"attributes": {"POSITION": a0, "NORMAL": a0 + 1, "TEXCOORD_0": a0 + 2}, "indices": a0 + 3,
                      "material": len(mats) - 1})
    g = {"asset": {"version": "2.0", "generator": "fnf_3dsketch v6_parts"}, "scene": 0, "scenes": [{"nodes": [0]}],
         "nodes": [{"mesh": 0, "name": name}], "meshes": [{"primitives": prims}], "accessors": accs, "materials": mats}
    if imgs:
        g.update(textures=texs, images=imgs, samplers=[{"magFilter": 9729, "minFilter": 9987}])
    write_glb(dst, g, views)


def main():
    ledge = lambda lo, hi: lo[1] >= 1020 and hi[1] <= 1160
    top = lambda lo, hi: lo[1] >= 1940 and hi[1] <= 1990 and hi[0] - lo[0] < 600
    subset(WALL_HANGER, os.path.join(OUT, "v6_벽판.glb"),
           lambda lo, hi, n: not ledge(lo, hi) and not top(lo, hi), shift_mm=(0, 0, BACK))
    subset(WALL_HANGER, os.path.join(OUT, "v6_선반.glb"), lambda lo, hi, n: ledge(lo, hi), shift_mm=(0, -1151, BACK))
    subset(WALL_HANGER, os.path.join(OUT, "v6_고리.glb"), lambda lo, hi, n: top(lo, hi) and lo[0] > -100,
           shift_mm=(0, 0, BACK))
    subset(WALL_HANGER, os.path.join(OUT, "v6_팔.glb"), lambda lo, hi, n: top(lo, hi) and hi[0] < -200,
           shift_mm=(0, 0, BACK))

    # poster: middle bay of photo b, px of the 2400 x 1800 photo (its foot is hidden by the bags on the shelf)
    b = Image.open(os.path.join(SHOTS, "06_벽면우측2_b.jpg"))
    crop = b.crop((928, 326, 1474, 636)).resize((546 * 3, 310 * 3), Image.LANCZOS)
    panel(os.path.join(OUT, "v6_포스터.glb"), crop, 1070, 610, "v6_포스터")

    # granite plinth: the front face of the right plinth in photo a, tiled 2x2 so the speckle stays small
    a = Image.open(os.path.join(SHOTS, "06_벽면우측2.jpg"))
    g = a.crop((1110, 1450, 1310, 1560)).resize((256, 256), Image.LANCZOS)
    tile = Image.new("RGB", (512, 512))
    for i in range(4):
        tile.paste(g if i % 2 == 0 else g.transpose(Image.FLIP_LEFT_RIGHT), ((i % 2) * 256, (i // 2) * 256))
    box_glb(os.path.join(OUT, "v6_좌대.glb"), [((0, 125, 0), (450, 250, 450), tile)], "v6_좌대")
    # head stand: base, rod, head
    box_glb(os.path.join(OUT, "v6_모자 스탠드.glb"),
            [((0, 6, 0), (140, 12, 140), "9a9c9e"), ((0, 160, 0), (14, 300, 14), "b8babc"),
             ((0, 390, 0), (160, 200, 190), "8e9094")], "v6_모자 스탠드")

    for part, (src, mats) in CLOTH.items():
        for c in MADE[part]:
            tint(os.path.join(CLOTHES, src), os.path.join(OUT, f"v6_{part}_{c}.glb"), mats, COLORS[c])


if __name__ == "__main__":
    main()
