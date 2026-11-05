"""
카탈로그에서 이름으로 모델을 찾아 Blender 에 임포트하고 .blend 로 저장한다.
Blender 안에서 실행되는 스크립트다 (blender -b --python 이 파일 -- <glb> [<glb> ...] <out.blend>).

모델을 나란히 배치하고, 바닥·조명·카메라를 깔아 바로 보이게 한다.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT_BLEND = ARGS[-1]
PATHS = ARGS[:-1]

bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.length_unit = "METERS"

report = []
cursor_x = 0.0
GAP = 0.6

for path in PATHS:
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        report.append({"file": os.path.basename(path), "ok": False, "error": "no mesh"})
        continue

    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    tris = 0
    mats = set()
    for o in meshes:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
        for m in o.data.materials:
            if m:
                mats.add(m.name)
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    size = mx - mn

    # 바닥에 앉히고 X 축으로 나란히 밀어둔다
    roots = [o for o in new if o.parent is None]
    shift = Vector((cursor_x - mn.x, -(mn.y + mx.y) / 2, -mn.z))
    for r in roots:
        r.location += shift
    cursor_x += size.x + GAP

    name = os.path.splitext(os.path.basename(path))[0].split("__")[0]
    for o in roots:
        o.name = name
    report.append({"file": os.path.basename(path), "name": name, "ok": True,
                   "meshes": len(meshes), "tris": tris, "materials": sorted(mats),
                   "size_m": [round(v, 3) for v in size]})

total_w = max(cursor_x - GAP, 0.1)
max_h = max((r["size_m"][2] for r in report if r.get("ok")), default=2.0)

# --- 바닥 ---
bpy.ops.mesh.primitive_plane_add(size=max(total_w * 6, 12),
                                 location=(total_w / 2, 0, 0))
gnd = bpy.context.object
gnd.name = "ground"
m = bpy.data.materials.new("ground")
m.use_nodes = True
b = m.node_tree.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.22, 0.22, 0.23, 1)
b.inputs["Roughness"].default_value = 0.55
gnd.data.materials.append(m)

# --- 월드 ---
world = bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.05, 0.055, 0.065, 1)
bg.inputs[1].default_value = 1.0


def area(name, loc, rot, size_m, energy, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, "AREA")
    d.shape = "RECTANGLE"
    d.size = size_m
    d.size_y = size_m * 0.6
    d.energy = energy
    d.color = color
    ob = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


s = max(total_w, max_h)
cx, cz = total_w / 2, max_h / 2
area("key", (cx - 1.2 * s, -1.6 * s, max_h + 1.4 * s),
     (math.radians(52), 0, math.radians(-38)), 2.2 * s, 420 * s * s)
area("fill", (cx + 1.8 * s, -1.2 * s, max_h * 0.8),
     (math.radians(74), 0, math.radians(56)), 2.6 * s, 130 * s * s, (0.94, 0.96, 1.0))
area("rim", (cx + 0.2 * s, 2.0 * s, max_h + 1.0 * s),
     (math.radians(116), 0, math.radians(184)), 1.8 * s, 200 * s * s)

# --- 카메라 ---
cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 50
cam_d.sensor_width = 36
cam = bpy.data.objects.new("cam", cam_d)
bpy.context.collection.objects.link(cam)
scene.camera = cam
tgt = bpy.data.objects.new("target", None)
bpy.context.collection.objects.link(tgt)
tgt.location = (cx, 0, cz)
trk = cam.constraints.new("TRACK_TO")
trk.target = tgt
trk.track_axis = "TRACK_NEGATIVE_Z"
trk.up_axis = "UP_Y"
dist = max(total_w, max_h) * 2.1 + 1.0
cam.location = (cx + dist * 0.35, -dist, cz + max_h * 0.35)

scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.view_transform = "AgX"
scene.render.resolution_x = 1600
scene.render.resolution_y = 1000

os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

print("@@REPORT@@" + json.dumps({"blend": OUT_BLEND, "items": report}, ensure_ascii=False))
