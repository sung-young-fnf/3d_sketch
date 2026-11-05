"""
매장연출 07 (1층 벽면 RUN&FIT) 부품 -> assets/F&F/국내-명동/[디스커버리 명동]/부품/v7_*.glb

Cut from [DX명동]벽 행거_1단 (one 1250 mm bay of the 명동 wall system: slotted uprights, wood back panel,
a rail and a canopy board on top), all shifted so the back of the uprights is at z 0 (= wall face):
  v7_벽 행거_기둥     the two uprights (posts + slotted strips), bottom at y 0
  v7_벽판_나무        the wood back panel, bottom at y 0 (bays 1 / 3)
  v7_벽판_흰          the same panel painted off-white (bays 2 / 4 and the grey strip on top)
  v7_봉              the rail + its two brackets, bar top at y 0
  v7_선반             the canopy wood board + its brackets, board top at y 0 (used as a shelf)
Store clothes / caps tinted to the photo's colours (same meshes, garment material recoloured):
  v7_맨투맨_<색>  (옷걸이&맨투맨), v7_티셔츠_<색> (옷걸이 & 의류), v7_볼캡_<색> (볼캡_모자_낱개)
Panels cropped from the reference photo 07_벽면_런앤핏.jpg:
  v7_포스터_액자, v7_포스터_런앤핏 (image slots), v7_사인_런앤핏, v7_조형_산, v7_조형_D
  v7_좌대  a 1 m granite box (texture = the plinth in the photo), scaled per plinth

    python -X utf8 scripts/vignettes/v7_parts.py
"""
import copy
import io
import os
import struct
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from build_vignette_parts import FF, OUT, panel, read_glb, subset, view_bytes, write_glb  # noqa: E402

BAY = os.path.join(FF, "＊가구", "진열장", "의류 진열장", "행거", "[DX명동]벽 행거_1단__0065a3da.glb")
CLOTHES = os.path.join(FF, "＊소품", "의류&잡화")
PHOTO = os.path.join(FF, "국내-명동", "[디스커버리 명동]", "매장연출", "07_벽면_런앤핏.jpg")

# sRGB hex of the garments in the photo
COLORS = {
    "회색": "8a8984", "카키": "77736a", "브라운": "4b3b31", "블랙": "1f2023", "네이비": "262b3a",
    "연하늘": "c8d4df", "하늘": "7ea3c6", "오렌지": "d4862c", "라임": "b9cf3c", "화이트": "ebe8e1",
    "크림": "ded8c8", "핑크": "c4a0bf", "토프": "6c645a", "베이지": "b4a890",
}


def lin(hexrgb):
    c = [int(hexrgb[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c] + [1.0]


def recolor(src, dst, pick, rgba):
    """copy a glb with the materials pick(index, material) says yes to painted rgba (linear), texture dropped"""
    g, bin_ = read_glb(src)
    g = copy.deepcopy(g)
    for i, m in enumerate(g.get("materials", [])):
        if pick(i, m):
            pbr = m.setdefault("pbrMetallicRoughness", {})
            pbr.pop("baseColorTexture", None)
            pbr["baseColorFactor"] = rgba
            m.pop("emissiveTexture", None)
            m.pop("emissiveFactor", None)
    views = [(view_bytes(g, bin_, i), {k: v[k] for k in ("byteStride", "target") if k in v})
             for i, v in enumerate(g["bufferViews"])]
    write_glb(dst, g, views)


def box(dst, image, name):
    """1000 mm cube, bottom centre at the origin, the image on every face"""
    buf = io.BytesIO()
    image.convert("RGB").save(buf, "JPEG", quality=90)
    pos, nrm, uv, idx = [], [], [], []
    faces = [((1, 0, 0), (0, 0, -1), (0, 1, 0)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 1, 0), (1, 0, 0), (0, 0, -1)),
             ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0))]
    for n, u, v in faces:
        base = len(pos) // 3
        for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            p = [0.5 * (n[k] + su * u[k] + sv * v[k]) for k in range(3)]
            p[1] += 0.5
            pos += p
            nrm += list(n)
            uv += [(su + 1) / 2, (1 - sv) / 2]
        idx += [base, base + 1, base + 2, base, base + 2, base + 3]
    f32 = lambda a: struct.pack(f"<{len(a)}f", *a)
    u16 = lambda a: struct.pack(f"<{len(a)}H", *a)
    views = [(f32(pos), {"target": 34962}), (f32(nrm), {"target": 34962}), (f32(uv), {"target": 34962}),
             (u16(idx), {"target": 34963}), (buf.getvalue(), {})]
    g = {"asset": {"version": "2.0", "generator": "fnf_3dsketch v7_parts"}, "scene": 0, "scenes": [{"nodes": [0]}],
         "nodes": [{"mesh": 0, "name": name}],
         "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0}]}],
         "accessors": [{"bufferView": 0, "componentType": 5126, "count": 24, "type": "VEC3",
                        "min": [-0.5, 0, -0.5], "max": [0.5, 1, 0.5]},
                       {"bufferView": 1, "componentType": 5126, "count": 24, "type": "VEC3"},
                       {"bufferView": 2, "componentType": 5126, "count": 24, "type": "VEC2"},
                       {"bufferView": 3, "componentType": 5123, "count": 36, "type": "SCALAR"}],
         "materials": [{"name": name, "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0,
                                                                "roughnessFactor": 0.8}}],
         "textures": [{"source": 0, "sampler": 0}], "samplers": [{"magFilter": 9729, "minFilter": 9987}],
         "images": [{"bufferView": 4, "mimeType": "image/jpeg"}]}
    write_glb(dst, g, views)


def main():
    o = lambda n: os.path.join(OUT, f"{n}.glb")
    Z = 276  # back of the uprights (model z -276) -> wall face
    # uprights: the tall posts / slotted strips (not the wood panel, not the acrylic top)
    subset(BAY, o("v7_벽 행거_기둥"), lambda lo, hi, n: hi[1] - lo[1] > 2000 and not n.startswith(("Wood", "투명")),
           shift_mm=(0, 0, Z))
    subset(BAY, o("v7_벽판_나무"), lambda lo, hi, n: n == "Wood 56", shift_mm=(0, -80, Z))
    recolor(o("v7_벽판_나무"), o("v7_벽판_흰"), lambda i, m: True, lin("e4e2dc"))
    # rail (bar y 1592-1622) + brackets
    subset(BAY, o("v7_봉"), lambda lo, hi, n: lo[1] >= 1560 and hi[1] <= 1630, shift_mm=(0, -1622, Z))
    # canopy board (y 2037-2067) + its two small brackets
    subset(BAY, o("v7_선반"), lambda lo, hi, n: n == "Wood 56.001" or (lo[1] >= 2005 and hi[1] <= 2066 and hi[0] - lo[0] < 10),
           shift_mm=(0, -2067, Z))

    garment = lambda i, m: not m.get("name", "").startswith("Aluminum")
    for c, hx in COLORS.items():
        recolor(os.path.join(CLOTHES, "의류", "옷걸이", "옷걸이&맨투맨__bcd34945.glb"), o(f"v7_맨투맨_{c}"), garment, lin(hx))
    for c in ("화이트", "라임", "토프"):
        # 옷걸이 & 의류: material 0 = the T-shirt, 1 = the hanger
        recolor(os.path.join(CLOTHES, "의류", "옷걸이", "옷걸이 & 의류__ZtI__VoE.glb"), o(f"v7_티셔츠_{c}"),
                lambda i, m: i == 0, lin(COLORS[c]))
    for c in ("블랙", "베이지", "라임", "화이트"):
        recolor(os.path.join(CLOTHES, "모자", "볼캡_모자_낱개__8bce7cac.glb"), o(f"v7_볼캡_{c}"), lambda i, m: True, lin(COLORS[c]))

    # photo crops (boxes in px of the 2400 x 1800 photo; measured on a 2000 wide view, x 1.2)
    photo = Image.open(PHOTO)
    crop = lambda b: photo.crop(tuple(round(v * 1.2) for v in b))
    up = lambda im, k=3: im.resize((im.width * k, im.height * k), Image.LANCZOS)
    panel(o("v7_포스터_액자"), up(crop((302, 600, 474, 826))), 540, 710, "v7_포스터_액자")
    panel(o("v7_포스터_런앤핏"), up(crop((782, 610, 995, 760))), 670, 470, "v7_포스터_런앤핏")
    panel(o("v7_사인_런앤핏"), up(crop((172, 762, 334, 830))), 510, 215, "v7_사인_런앤핏")
    panel(o("v7_조형_산"), up(crop((462, 655, 612, 828))), 470, 545, "v7_조형_산")
    panel(o("v7_조형_D"), up(crop((1026, 768, 1150, 838))), 390, 220, "v7_조형_D")
    box(o("v7_좌대"), up(crop((1060, 1392, 1205, 1440)), 4), "v7_좌대")


if __name__ == "__main__":
    main()
