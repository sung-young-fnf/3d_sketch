"""
착장 토르소: UniForge3D torso glbs -> one shared model frame (docs/store-assembly.md §10)

  bare torso    -> assets/.../[디스커버리 명동]/부품/토르소.glb            (the 패딩 월 item, slot M01)
  dressed torso -> assets/.../[디스커버리 명동]/상품/착장/<style>/<style>_<color>.glb  (M01 상품 변경)
                   only for a dressed torso generated from images; the 착장 in use are dressed from the product
                   glb itself by scripts/blender_dress_torso.py (same colours and shape as the product)

UniForge3D normalises every mesh to 1 m tall, so a dressed torso (hood, puffer volume) comes out at
another scale than the bare one. Both stand on the same round base, so a dressed glb is scaled until
its base disc matches the bare torso's and moved onto it; the bare torso is scaled to real size
(TORSO_SCALE). Result: metres, +Y up, +Z front, base bottom centre at the origin, so the viewer
(SceneItem.fit "model") puts a dressed torso exactly where the bare one stands.

    <python with numpy> scripts/build_torso.py <torso.glb> [<dressed.glb> <style folder> <style_color>] ...
"""
import json
import os
import struct
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(ROOT, "assets", "F&F", "국내-명동", "[디스커버리 명동]")
TORSO_SCALE = 1.1  # neck to hip ~0.74 m, arms ~0.66 m wide (photo 01: ~1.7x the 460 mm backpack)


def read_glb(path):
    d = open(path, "rb").read()
    n = struct.unpack("<I", d[12:16])[0]
    g = json.loads(d[20:20 + n])
    m = struct.unpack("<I", d[20 + n:24 + n])[0]
    return g, d[28 + n:28 + n + m]


def write_glb(path, g, bin_):
    js = json.dumps(g, ensure_ascii=False, separators=(",", ":")).encode("utf8")
    js += b" " * (-len(js) % 4)
    bin_ += b"\0" * (-len(bin_) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(bin_), 0x004E4942) + bin_)


def positions(g, bin_):
    acc = g["accessors"][g["meshes"][0]["primitives"][0]["attributes"]["POSITION"]]
    bv = g["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return np.frombuffer(bin_, np.float32, acc["count"] * 3, off).reshape(-1, 3)


def base_disc(v):
    """centre (x, z), radius and bottom y of the stand's round base"""
    lo = v[:, 1].min()
    b = v[v[:, 1] < lo + 0.01]
    return tuple(float(x) for x in ((b[:, 0].max() + b[:, 0].min()) / 2, (b[:, 2].max() + b[:, 2].min()) / 2, (b[:, 0].max() - b[:, 0].min()) / 2, lo))


def place(src, dst, scale, frame):
    """write src with a root transform: scale, then base centre / bottom (raw units) to the origin"""
    g, bin_ = read_glb(src)
    cx, cz, _, lo = frame
    root = {"name": "torso_frame", "children": list(g["scenes"][g.get("scene", 0)]["nodes"]),
            "matrix": [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, -cx * scale, -lo * scale, -cz * scale, 1]}
    g["nodes"].append(root)
    g["scenes"][g.get("scene", 0)]["nodes"] = [len(g["nodes"]) - 1]
    write_glb(dst, g, bin_)
    v = positions(g, bin_)
    print(os.path.relpath(dst, ROOT), "size m", ((v.max(0) - v.min(0)) * scale).round(3))


def main():
    torso = sys.argv[1]
    g, b = read_glb(torso)
    t_frame = base_disc(positions(g, b))
    place(torso, os.path.join(MD, "부품", "토르소.glb"), TORSO_SCALE, t_frame)
    args = sys.argv[2:]
    for dressed, style, name in zip(args[0::3], args[1::3], args[2::3]):
        g, b = read_glb(dressed)
        d_frame = base_disc(positions(g, b))
        scale = TORSO_SCALE * t_frame[2] / d_frame[2]  # same base disc as the bare torso
        place(dressed, os.path.join(MD, "상품", "착장", style, f"{name}.glb"), scale, d_frame)


if __name__ == "__main__":
    main()
