"""
매장연출 부품 -> assets/F&F/국내-명동/[디스커버리 명동]/부품/

The real walls in the reference photos use pieces the library only has inside bigger
fixtures, so they are cut out of those fixtures (same meshes, materials and textures):
  - [DX명동]신발 받침          one shoe pad + bracket of [DX명동]신발 진열대
  - [DX명동]신발 진열대 하부   one 1 m wood + mirror base of [DX명동]신발 진열대
  - 흰 타공판                 [FITTING ROOM] 타공판 with its turquoise paint turned white
  - [DX명동]벽 행거_3-2_고리없음  [DX명동]벽 행거_3-2 without the round loop and the single arm on top (패딩 월 middle panel)
  - 포스터_반슬리 / 포스터_퍼지뮬  the two posters of photo 02, cropped onto a flat panel
  - [DX명동]스탠드 행거_한면 3칸  one long side, 3 bays, of [DX명동]스탠드 행거 (wood posts, slotted uprights, top
                              beam) without its rails and arms - those are separate parts that move up / down:
    [DX명동]스탠드 행거_봉 (one bay's rail), [DX명동]스탠드 행거_팔 (the short face-out arm), [DX명동]스탠드 행거_판 (one
    wood post, laid flat and stretched into a shelf board in build_vignettes.py)
  - 포스터_글로시  the poster of photo 03
  - 옷걸이  the metal hanger of 옷걸이&맨투맨 (hook top at y 0): the viewer hangs VMD clothes without their own hook on it
  - 바지걸이  the clip-bar pants hanger of 옷걸이 & 바지 (hook top at y 0): VMD 팬츠 / 스커트 hang on it

    python -X utf8 scripts/build_vignette_parts.py
"""
import io
import json
import math
import os
import struct

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = os.path.join(ROOT, "assets", "F&F")
OUT = os.path.join(FF, "국내-명동", "[디스커버리 명동]", "부품")
SHOE_DISPLAY = os.path.join(FF, "국내-명동", "[디스커버리 명동]", "가구", "[DX명동]신발 진열대__7db02b22.glb")
WALL_HANGER = os.path.join(FF, "＊가구", "진열장", "의류 진열장", "행거", "[DX명동]벽 행거_3-2__8b36bb17.glb")
PEGBOARD = os.path.join(FF, "＊가구", "펜스_판넬", "[FITTING ROOM] 타공판__ZtN_f4IE.glb")
STAND_HANGER = os.path.join(FF, "국내-명동", "[디스커버리 명동]", "가구", "[DX명동]스탠드 행거__0ebf7bad.glb")
PHOTO_CENTER = os.path.join(FF, "국내-명동", "[디스커버리 명동]", "매장연출", "03_중앙행거.png")
SWEAT_ON_HANGER = os.path.join(FF, "＊소품", "의류&잡화", "의류", "옷걸이", "옷걸이&맨투맨__bcd34945.glb")
PANTS_ON_HANGER = os.path.join(FF, "＊소품", "의류&잡화", "의류", "옷걸이", "옷걸이 & 바지__ZtJEzVE4.glb")
PHOTO_SHOES = os.path.join(FF, "국내-명동", "[디스커버리 명동]", "매장연출", "02_신발월.png")


# ------------------------------------------------------------------ glb io
def read_glb(path):
    with open(path, "rb") as f:
        b = f.read()
    n = struct.unpack("<I", b[12:16])[0]
    g = json.loads(b[20:20 + n])
    off = 20 + n
    blen = struct.unpack("<I", b[off:off + 4])[0]
    return g, b[off + 8:off + 8 + blen]


def view_bytes(g, bin_, i):
    v = g["bufferViews"][i]
    o = v.get("byteOffset", 0)
    return bin_[o:o + v["byteLength"]]


def write_glb(path, g, views):
    """views: list of (bytes, extra bufferView fields); rebuilds buffers/bufferViews."""
    blob = bytearray()
    g["bufferViews"] = []
    for data, extra in views:
        while len(blob) % 4:
            blob.append(0)
        g["bufferViews"].append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), **extra})
        blob += data
    while len(blob) % 4:
        blob.append(0)
    g["buffers"] = [{"byteLength": len(blob)}]
    js = json.dumps(g, ensure_ascii=False, separators=(",", ":")).encode("utf8")
    js += b" " * (-len(js) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(out)
    print("wrote", os.path.relpath(path, ROOT), f"{len(out) / 1e6:.1f} MB")


def mat_mul(a, b):
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]


def node_matrix(n):
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


def mesh_nodes(g):
    """(node world matrix, mesh index) for every mesh node of the default scene"""
    out = []
    def visit(i, parent):
        n = g["nodes"][i]
        m = mat_mul(parent, node_matrix(n))
        if "mesh" in n:
            out.append((m, n["mesh"]))
        for c in n.get("children", []):
            visit(c, m)
    for i in g["scenes"][g.get("scene", 0)]["nodes"]:
        visit(i, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    return out


def prim_box_mm(g, m, prim):
    acc = g["accessors"][prim["attributes"]["POSITION"]]
    lo, hi = [1e18] * 3, [-1e18] * 3
    for cx in (acc["min"][0], acc["max"][0]):
        for cy in (acc["min"][1], acc["max"][1]):
            for cz in (acc["min"][2], acc["max"][2]):
                p = [(m[r] * cx + m[4 + r] * cy + m[8 + r] * cz + m[12 + r]) * 1000 for r in range(3)]
                lo = [min(a, b) for a, b in zip(lo, p)]
                hi = [max(a, b) for a, b in zip(hi, p)]
    return lo, hi


def subset(src, dst, keep, shift_mm=(0, 0, 0)):
    """copy the primitives keep(lo_mm, hi_mm, material_name) says yes to, moved by shift_mm"""
    g, bin_ = read_glb(src)
    out = {"asset": {"version": "2.0", "generator": "fnf_3dsketch build_vignette_parts"},
           "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "meshes": [], "accessors": [],
           "materials": [], "textures": [], "images": [], "samplers": g.get("samplers", [])}
    views, view_map, acc_map, mat_map, tex_map, img_map = [], {}, {}, {}, {}, {}

    def copy_view(i):
        if i not in view_map:
            v = g["bufferViews"][i]
            extra = {k: v[k] for k in ("byteStride", "target") if k in v}
            view_map[i] = len(views)
            views.append((view_bytes(g, bin_, i), extra))
        return view_map[i]

    def copy_acc(i):
        if i not in acc_map:
            a = dict(g["accessors"][i])
            a["bufferView"] = copy_view(a["bufferView"])
            acc_map[i] = len(out["accessors"])
            out["accessors"].append(a)
        return acc_map[i]

    def copy_tex(i):
        if i not in tex_map:
            t = dict(g["textures"][i])
            s = t["source"]
            if s not in img_map:
                im = dict(g["images"][s])
                im["bufferView"] = copy_view(im["bufferView"])
                img_map[s] = len(out["images"])
                out["images"].append(im)
            t["source"] = img_map[s]
            tex_map[i] = len(out["textures"])
            out["textures"].append(t)
        return tex_map[i]

    def fix_tex_refs(o):
        if isinstance(o, dict):
            return {k: ({**v, "index": copy_tex(v["index"])} if k.endswith("Texture") and isinstance(v, dict) and "index" in v
                        else fix_tex_refs(v)) for k, v in o.items()}
        if isinstance(o, list):
            return [fix_tex_refs(v) for v in o]
        return o

    def copy_mat(i):
        if i not in mat_map:
            mat_map[i] = len(out["materials"])
            out["materials"].append(fix_tex_refs(g["materials"][i]))
        return mat_map[i]

    for m, mi in mesh_nodes(g):
        prims = []
        for prim in g["meshes"][mi]["primitives"]:
            lo, hi = prim_box_mm(g, m, prim)
            name = g["materials"][prim["material"]].get("name", "") if "material" in prim else ""
            if not keep(lo, hi, name):
                continue
            p = {"attributes": {k: copy_acc(v) for k, v in prim["attributes"].items()}}
            if "indices" in prim:
                p["indices"] = copy_acc(prim["indices"])
            if "material" in prim:
                p["material"] = copy_mat(prim["material"])
            if "mode" in prim:
                p["mode"] = prim["mode"]
            prims.append(p)
        if prims:
            mm = list(m)
            for k in range(3):
                mm[12 + k] += shift_mm[k] / 1000
            out["scenes"][0]["nodes"].append(len(out["nodes"]))
            out["nodes"].append({"mesh": len(out["meshes"]), "matrix": mm})
            out["meshes"].append({"primitives": prims})
    for k in ("textures", "images", "samplers"):
        if not out[k]:
            out.pop(k)
    write_glb(dst, out, views)


# ------------------------------------------------------------------ flat textured panel
def panel(dst, image, w_mm, h_mm, name):
    """a w x h (mm) front-facing (+Z) board, 20 mm thick, image on the front"""
    buf = io.BytesIO()
    image.convert("RGB").save(buf, "PNG")
    w, h, d = w_mm / 2000, h_mm / 2000, 0.01
    # front quad with the image, plain back quad
    pos = [-w, -h, d, w, -h, d, w, h, d, -w, h, d]
    nrm = [0, 0, 1] * 4
    uv = [0, 1, 1, 1, 1, 0, 0, 0]
    idx = [0, 1, 2, 0, 2, 3]
    bpos = [w, -h, -d, -w, -h, -d, -w, h, -d, w, h, -d]
    bnrm = [0, 0, -1] * 4
    bidx = [0, 1, 2, 0, 2, 3]
    f32 = lambda a: struct.pack(f"<{len(a)}f", *a)
    u16 = lambda a: struct.pack(f"<{len(a)}H", *a) + (b"\0\0" if len(a) % 2 else b"")
    views = [(f32(pos), {"target": 34962}), (f32(nrm), {"target": 34962}), (f32(uv), {"target": 34962}),
             (u16(idx), {"target": 34963}), (f32(bpos), {"target": 34962}), (f32(bnrm), {"target": 34962}),
             (u16(bidx), {"target": 34963}), (buf.getvalue(), {})]
    acc = lambda v, n, t, mn=None, mx=None: {k: x for k, x in {"bufferView": v, "componentType": 5126 if t != "SCALAR" else 5123,
                                                             "count": n, "type": t, "min": mn, "max": mx}.items() if x is not None}
    g = {"asset": {"version": "2.0", "generator": "fnf_3dsketch build_vignette_parts"}, "scene": 0,
         "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": name}],
         "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0},
                                    {"attributes": {"POSITION": 4, "NORMAL": 5}, "indices": 6, "material": 1}]}],
         "accessors": [acc(0, 4, "VEC3", [-w, -h, d], [w, h, d]), acc(1, 4, "VEC3"), acc(2, 4, "VEC2"), acc(3, 6, "SCALAR"),
                       acc(4, len(bpos) // 3, "VEC3", [-w, -h, -d], [w, h, d]), acc(5, len(bpos) // 3, "VEC3"),
                       acc(6, len(bidx), "SCALAR")],
         "materials": [{"name": name, "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 0.6}},
                       {"name": "frame", "pbrMetallicRoughness": {"baseColorFactor": [0.85, 0.85, 0.83, 1], "metallicFactor": 0, "roughnessFactor": 0.7}}],
         "textures": [{"source": 0, "sampler": 0}], "samplers": [{"magFilter": 9729, "minFilter": 9987}],
         "images": [{"bufferView": 7, "mimeType": "image/png"}]}
    write_glb(dst, g, views)


def white_pegboard(dst):
    g, bin_ = read_glb(PEGBOARD)
    views = []
    for i, v in enumerate(g["bufferViews"]):
        data = view_bytes(g, bin_, i)
        if any(im.get("bufferView") == i for im in g["images"]):
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            r, gg, b, a = im.split()
            # keep the holes (alpha) and the metal's light/shade, drop the turquoise paint
            lum = Image.merge("RGB", (r, gg, b)).convert("L").point(lambda x: min(255, 205 + x // 5))
            im = Image.merge("RGBA", (lum, lum, lum, a))
            out = io.BytesIO()
            im.save(out, "PNG")
            data = out.getvalue()
        views.append((data, {k: v[k] for k in ("byteStride", "target") if k in v}))
    g["materials"][0]["name"] = "흰 타공판"
    write_glb(dst, g, views)


def main():
    # one pad of the left display column (x -764, shelf y 1053): pad, bracket, screws
    subset(SHOE_DISPLAY, os.path.join(OUT, "[DX명동]신발 받침.glb"),
           lambda lo, hi, name: lo[0] >= -850 and hi[0] <= -680 and 1045 <= lo[1] and hi[1] <= 1075 and hi[2] < -20
           and name.startswith("[Aluminum]"),
           shift_mm=(764, -1053, 0))
    # right base unit: wood box + mirror front
    subset(SHOE_DISPLAY, os.path.join(OUT, "[DX명동]신발 진열대 하부.glb"),
           lambda lo, hi, name: lo[0] >= -5 and hi[1] <= 305 and (name.startswith("Wood") or name.startswith("[Mirror")),
           shift_mm=(-500, 0, 0))
    white_pegboard(os.path.join(OUT, "흰 타공판.glb"))
    # top level (y 1949-1985): drop the loop, the arm and their brackets, keep the full-width wall track
    subset(WALL_HANGER, os.path.join(OUT, "[DX명동]벽 행거_3-2_고리없음.glb"),
           lambda lo, hi, name: not (lo[1] >= 1940 and hi[1] <= 1990 and hi[0] - lo[0] < 600))
    # posters: crops of the reference photo (poster boxes in px of the 776 x 432 photo)
    photo = Image.open(PHOTO_SHOES)
    sx, sy = photo.width / 776, photo.height / 432
    for name, box in (("포스터_반슬리", (82, 85, 204, 140)), ("포스터_퍼지뮬", (570, 85, 692, 140))):
        crop = photo.crop((round(box[0] * sx), round(box[1] * sy), round(box[2] * sx), round(box[3] * sy)))
        crop = crop.resize((crop.width * 4, crop.height * 4), Image.LANCZOS)
        panel(os.path.join(OUT, f"{name}.glb"), crop, 760, 340, name)

    # 스탠드 행거 (model mm): the +x side runs along z, posts at z -2600 / -1300 / 0 / 1300 / 2600, upright plane x 1060.
    # Bays z -1300..2600 -> one side of 3 bays, upright plane at x 0, middle bay centred on z 0
    rails = lambda lo, hi, name: name.startswith(("[Aluminum]3", "투명 아크릴", "[Aluminum]6"))
    subset(STAND_HANGER, os.path.join(OUT, "[DX명동]스탠드 행거_한면 3칸.glb"),
           lambda lo, hi, name: lo[0] >= 1000 and lo[2] >= -1360 and hi[2] <= 2660 and not rails(lo, hi, name),
           shift_mm=(-1060, 0, -650))
    # rail of the bay z 0..1300 (bent tube 1300 high + its clear track): bar bottom at y 0, centred
    subset(STAND_HANGER, os.path.join(OUT, "[DX명동]스탠드 행거_봉.glb"),
           lambda lo, hi, name: lo[0] >= 1000 and 1290 <= lo[1] and hi[1] <= 1480 and lo[2] >= 20 and hi[2] <= 1290
           and rails(lo, hi, name), shift_mm=(-1060, -1300, -653))
    # face-out arm (plates + 235 mm bar across the upright plane) at z 683, y 2310
    subset(STAND_HANGER, os.path.join(OUT, "[DX명동]스탠드 행거_팔.glb"),
           lambda lo, hi, name: name.startswith("[Aluminum]6") and lo[0] >= 900 and 660 <= lo[2] and hi[2] <= 705,
           shift_mm=(-1070, -2312, -683))
    # one wood post (18 x 2400 x 100), centred
    subset(STAND_HANGER, os.path.join(OUT, "[DX명동]스탠드 행거_판.glb"),
           lambda lo, hi, name: name.startswith("Wood") and 1090 <= lo[0] and hi[0] <= 1112 and -50 <= lo[2] and hi[2] <= 60
           and hi[1] - lo[1] > 2000 and lo[2] > -47,
           shift_mm=(-1102, -1300, -4))
    # hanger: 430 wide, hook top 894 -> 0, shoulders ~120 below it
    subset(SWEAT_ON_HANGER, os.path.join(OUT, "옷걸이.glb"),
           lambda lo, hi, name: name.startswith("Aluminum_Anodized_DarkGray"), shift_mm=(0, -894, -20))
    # pants hanger (clip bar): 320 wide, hook top 949 -> 0; the waist it grips starts 113 below the hook top
    subset(PANTS_ON_HANGER, os.path.join(OUT, "바지걸이.glb"),
           lambda lo, hi, name: lo[1] > 700, shift_mm=(2, -949, 7))
    photo = Image.open(PHOTO_CENTER)
    sx = photo.width / 475  # poster box in px of the 475 wide photo
    crop = photo.crop(tuple(round(v * sx) for v in (180, 36, 294, 114)))
    crop = crop.resize((crop.width * 6, crop.height * 6), Image.LANCZOS)
    panel(os.path.join(OUT, "포스터_글로시.glb"), crop, 1150, 790, "포스터_글로시")


if __name__ == "__main__":
    main()
