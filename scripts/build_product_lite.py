"""
VMD 상품 웹용 가벼운 사본 -> assets/F&F/국내-명동/[디스커버리 명동]/상품_웹/<카테고리>/<스타일>/<stem>.glb

The painted product glbs (UniForge3D paint_texture) are ~50 MB each: ~0.9 M triangles and a 4K PNG. A wall with
30 of them downloads 1.6 GB and draws ~28 M triangles, so the web viewer (web/src/lib/scenes.ts getVmdProducts)
uses these copies instead: decimated to ~TRIS triangles, texture TEX px JPEG. The originals stay as they are
(Blender, library, re-painting). A copy is rebuilt only when its source is newer.
`-- items`: the same for every scene item glb over ITEM_MB in data/vignettes (the bare torso, the store 패딩, the
recoloured hoodies ...) -> assets/F&F/_웹/<path under assets/F&F>; build_vignettes.py put() then points at it.

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --factory-startup -P scripts/build_product_lite.py -- [part k/n]
"""
import os
import sys

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "F&F", "국내-명동", "[디스커버리 명동]", "상품")
DST = os.path.join(ROOT, "assets", "F&F", "국내-명동", "[디스커버리 명동]", "상품_웹")
TRIS = 60000
TEX = 1024
ITEM_MB = 8
FF = os.path.join(ROOT, "assets", "F&F")


def lite(src, dst):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    ratio = min(1.0, TRIS / max(tris, 1))
    for o in meshes:
        if ratio < 1:
            m = o.modifiers.new("lite", "DECIMATE")
            m.ratio = ratio
            m.use_collapse_triangulate = True
    for img in bpy.data.images:
        if img.size[0] > TEX or img.size[1] > TEX:
            img.scale(min(TEX, img.size[0]), min(TEX, img.size[1]))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True, export_image_format="JPEG",
                              export_image_quality=88, use_selection=False)
    print(f"lite {os.path.relpath(dst, ROOT)}  {tris} -> ~{int(tris * ratio)} tris  "
          f"{os.path.getsize(src) / 1e6:.1f} -> {os.path.getsize(dst) / 1e6:.1f} MB", flush=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    k, n = (int(args[1]), int(args[2])) if args[:1] == ["part"] else (0, 1)
    todo = []
    if args[:1] == ["items"]:
        import json
        for name in os.listdir(os.path.join(ROOT, "data", "vignettes")):
            with open(os.path.join(ROOT, "data", "vignettes", name), encoding="utf-8") as f:
                for v in json.load(f)["vignettes"]:
                    for it in v["floors"][0]["items"]:
                        src = os.path.join(ROOT, it["url"])
                        if "/_웹/" in it["url"] or not os.path.exists(src) or os.path.getsize(src) < ITEM_MB * 1e6:
                            continue
                        dst = os.path.join(FF, "_웹", os.path.relpath(src, FF))
                        if (src, dst) not in todo and (not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src)):
                            todo.append((src, dst))
    for d, _, files in os.walk(SRC) if args[:1] != ["items"] else ():
        for f in sorted(files):
            if f.lower().endswith(".glb"):
                src = os.path.join(d, f)
                dst = os.path.join(DST, os.path.relpath(src, SRC))
                if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
                    todo.append((src, dst))
    todo.sort()
    for i, (src, dst) in enumerate(todo):
        if i % n == k:
            try:
                lite(src, dst)
            except Exception as e:  # one broken file must not stop the rest
                print("!! failed", src, e, flush=True)


main()
