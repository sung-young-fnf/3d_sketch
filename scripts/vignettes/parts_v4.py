"""
매장연출 04 (1층 벽면좌측2) 부품 -> assets/F&F/국내-명동/[디스커버리 명동]/부품/v4_*.glb

(named parts_v4.py, not v4_parts.py: build_vignettes.py loads every scripts/vignettes/v*.py as a wall)

The wall is three [DX명동]벽 행거 modules (grey | wood | grey) whose ledges, top loop and arm sit at other
heights / widths than in the library fixture, so they are cut apart (same meshes, materials, textures):
  - v4_벽판_회색   [DX명동]벽 행거_3-1 frame + grey panel (made opaque dark grey), without its upper shelf, ledge + rail
  - v4_벽판_나무   [DX명동]벽 행거_3-2 frame + wood panel, without the top track / loop / arm and the ledge + rail
  - v4_선반봉      the 3-2 ledge (wood board, light, label strip) with the hanging rail under it; ledge top at y 0
  - v4_상단레일    the 3-2 top wall track with its two end brackets; track bottom at y 0
  - v4_고리        the 3-2 round loop bar + its 2 brackets; left bracket at x 0, bar top at y 0, back at z 0
  - v4_팔          the 3-2 single face-out arm + bracket; x centred, bar top at y 0, back at z 0
  - v4_포스터      the poster on the wood panel, cropped from the photo
  - v4_좌대        the granite plinth under the shoes, a box with the photo's stone (front face only, no shoes)

    python -X utf8 scripts/vignettes/parts_v4.py
"""
import io
import os
import struct
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from build_vignette_parts import FF, OUT, WALL_HANGER, panel, read_glb, subset, view_bytes, write_glb  # noqa: E402

GREY_HANGER = os.path.join(FF, "＊가구", "진열장", "의류 진열장", "행거", "[DX명동]벽 행거_3-1__1418a496.glb")
PHOTO = os.path.join(FF, "국내-명동", "[디스커버리 명동]", "매장연출", "04_벽면좌측2.jpg")


def ledge(lo, hi):
    """ledge set of a 벽 행거: board, light, label strip, rail, brackets (all within y 1020..1160)"""
    return lo[1] >= 1020 and hi[1] <= 1160


def box(dst, image, w_mm, h_mm, d_mm, name):
    """a w x h x d (mm) box, base at y 0, centred in x / z, the image on all 5 visible faces"""
    buf = io.BytesIO()
    image.convert("RGB").save(buf, "JPEG", quality=90)
    w, h, d = w_mm / 2000, h_mm / 1000, d_mm / 2000
    faces = [  # 4 corners (counter-clockwise seen from outside), normal
        ([(-w, 0, d), (w, 0, d), (w, h, d), (-w, h, d)], (0, 0, 1)),
        ([(w, 0, -d), (-w, 0, -d), (-w, h, -d), (w, h, -d)], (0, 0, -1)),
        ([(w, 0, d), (w, 0, -d), (w, h, -d), (w, h, d)], (1, 0, 0)),
        ([(-w, 0, -d), (-w, 0, d), (-w, h, d), (-w, h, -d)], (-1, 0, 0)),
        ([(-w, h, d), (w, h, d), (w, h, -d), (-w, h, -d)], (0, 1, 0)),
    ]
    pos, nrm, uv, idx = [], [], [], []
    for k, (cs, n) in enumerate(faces):
        for c in cs:
            pos += c
            nrm += n
        uv += [0, 1, 1, 1, 1, 0, 0, 0]
        idx += [4 * k, 4 * k + 1, 4 * k + 2, 4 * k, 4 * k + 2, 4 * k + 3]
    f32 = lambda a: struct.pack(f"<{len(a)}f", *a)
    u16 = lambda a: struct.pack(f"<{len(a)}H", *a)
    views = [(f32(pos), {"target": 34962}), (f32(nrm), {"target": 34962}), (f32(uv), {"target": 34962}),
             (u16(idx), {"target": 34963}), (buf.getvalue(), {})]
    g = {"asset": {"version": "2.0", "generator": "fnf_3dsketch parts_v4"}, "scene": 0,
         "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": name}],
         "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0}]}],
         "accessors": [{"bufferView": 0, "componentType": 5126, "count": len(pos) // 3, "type": "VEC3",
                        "min": [-w, 0, -d], "max": [w, h, d]},
                       {"bufferView": 1, "componentType": 5126, "count": len(nrm) // 3, "type": "VEC3"},
                       {"bufferView": 2, "componentType": 5126, "count": len(uv) // 2, "type": "VEC2"},
                       {"bufferView": 3, "componentType": 5123, "count": len(idx), "type": "SCALAR"}],
         "materials": [{"name": name, "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0,
                                                               "roughnessFactor": 0.75}}],
         "textures": [{"source": 0, "sampler": 0}], "samplers": [{"magFilter": 9729, "minFilter": 9987}],
         "images": [{"bufferView": 4, "mimeType": "image/jpeg"}]}
    write_glb(dst, g, views)


def opaque_grey(path, rgb=(0.12, 0.12, 0.125)):
    """the 3-1 panel is see-through glass in the library; the real one is a solid dark grey board"""
    g, bin_ = read_glb(path)
    for m in g["materials"]:
        if m.get("name", "").startswith("[Translucent Glass"):
            m.pop("alphaMode", None)
            m["name"] = "v4 회색 판"
            m["pbrMetallicRoughness"] = {"baseColorFactor": [*rgb, 1], "metallicFactor": 0, "roughnessFactor": 0.8}
    views = [(view_bytes(g, bin_, i), {k: v[k] for k in ("byteStride", "target") if k in v})
             for i, v in enumerate(g["bufferViews"])]
    write_glb(path, g, views)


def main():
    out = lambda n: os.path.join(OUT, f"{n}.glb")
    # 3-1: upper shelf (y 1590..1655) and the ledge set go; frame, uprights, grey panel stay
    subset(GREY_HANGER, out("v4_벽판_회색"),
           lambda lo, hi, name: not ledge(lo, hi) and not (lo[1] >= 1590 and hi[1] <= 1655))
    opaque_grey(out("v4_벽판_회색"))
    # 3-2: the top level (y 1920..1990: track, loop, arm, brackets) and the ledge set go
    subset(WALL_HANGER, out("v4_벽판_나무"), lambda lo, hi, name: not ledge(lo, hi) and not (lo[1] >= 1920 and hi[1] <= 1990))
    subset(WALL_HANGER, out("v4_선반봉"), lambda lo, hi, name: ledge(lo, hi), shift_mm=(0, -1151, 0))
    # top level of 3-2 (model mm): track x -493..501 z -145..-130 (+ end brackets 2.006 / 2.007, z -257..-130),
    # loop x -17..463 + brackets x -19..9 / 437..465 (z -147..99), arm x -284..-249 (z -147..112); bar tops at 1978..1985
    top = lambda lo, hi: lo[1] >= 1920 and hi[1] <= 1990
    subset(WALL_HANGER, out("v4_상단레일"), lambda lo, hi, name: top(lo, hi) and hi[0] - lo[0] > 600
           or top(lo, hi) and name.startswith("[Color A06]") and lo[2] < -200, shift_mm=(0, -1949, 0))
    subset(WALL_HANGER, out("v4_고리"), lambda lo, hi, name: top(lo, hi) and lo[0] >= -20 and hi[0] <= 466
           and hi[0] - lo[0] < 600, shift_mm=(19, -1978, 147))
    subset(WALL_HANGER, out("v4_팔"), lambda lo, hi, name: top(lo, hi) and lo[0] >= -290 and hi[0] <= -245,
           shift_mm=(266, -1985, 147))

    photo = Image.open(PHOTO)  # 2400 x 1800
    poster = photo.crop((873, 370, 1434, 698)).resize((561 * 3, 328 * 3), Image.LANCZOS)
    panel(out("v4_포스터"), poster, 1000, 585, "v4_포스터")
    # granite only: a strip of the plinth's front face (the top has the photo's own shoes on it - they would show
    # through under the 3D shoes), mirrored into a 420 x 240 tile
    strip = photo.crop((1160, 1680, 1380, 1735))
    stone = Image.new("RGB", (strip.width * 2, strip.height * 4))
    for r in range(4):
        for c in range(2):
            t = strip.transpose(Image.FLIP_LEFT_RIGHT) if c else strip
            stone.paste(t.transpose(Image.FLIP_TOP_BOTTOM) if r % 2 else t, (c * strip.width, r * strip.height))
    box(out("v4_좌대"), stone.resize((420, 240), Image.LANCZOS), 450, 320, 420, "v4_좌대")


if __name__ == "__main__":
    main()
