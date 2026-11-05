"""
착장 토르소, dressed in Blender from the product's own glb (docs/store-assembly.md §10)

The product glb (상품/패딩/...) goes onto the bare torso (부품/토르소.glb, scripts/build_torso.py)
untouched - same mesh, same texture - so the dressed torso looks exactly like the product:
  * the jacket is moved (not scaled) so its shoulder line sits on the torso's shoulders, centred on the chest
  * pose "straight" (default): the jacket is not deformed at all; the torso's hands are turned to hang
    down and put into the cuffs, and the whole figure is raised (the pole stretched) so the hands clear
    the shelf (HIP + HAND_CLEAR)
  * pose "bent": the sleeves are bent at the torso's elbows towards its wrists and bunched (UVs untouched)
    - the product meshes have sleeve and body fused, so the hip sides crumple: kept for comparison only
  * the torso keeps only its neck (above NECK_Y), its hands (out of the cuffs) and its pole / base: the body
    and arms inside would poke through the jacket
Output: one glb in the torso frame (metres, +Y up, +Z front, base bottom centre at the origin), used by the
패딩 월 slot M01 (SceneItem.fit "model").

    blender -b -P scripts/blender_dress_torso.py -- <torso.glb> <product.glb> <out.glb> [<preview.png>] [bent]
"""
import math
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

TORSO_SHOULDER_Y = 0.95  # torso frame, m: top of the shoulders
NECK_Y = 0.93  # torso frame, m: body below this (down to the pole) is dropped
POLE_TOP = 0.30
# torso arm (right side, +x; mirrored for the left), torso frame m - measured on 부품/토르소.glb
ELBOW = (0.28, 0.60)  # x, y; z = the sleeve's own centre
WRIST = (0.22, 0.48, 0.10)
HAND = (0.33, 0.47, 0.14, 0.105)  # hand faces: y between, |x| over, z over (the hip front stays under 0.10)
SLEEVE_X = (0.19, 0.23)  # |x| where the jacket turns from body into sleeve (smooth)
ELBOW_BAND = 0.04  # +- y around the elbow where the bend fades in
CUFF_EXTRA = 0.015  # cuff ends this far past the wrist
HIP = 0.363  # torso frame, m: hip = the shelf top in the store (패딩 월 M01 clips below it)
HAND_CLEAR = -0.07  # straight pose: hand bottoms this far over the hip (below: the shelf hides the fingertips, the hood stays under the top bar)
WRIST_INSET = 0.06  # straight pose: wrist this far up inside the cuff


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    for o in meshes:  # bake the node chain into the vertices
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.data.objects if o not in before and o.type != "MESH"]:
        bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    return meshes


def gl(v):
    """Blender (Z up, -Y front after the glTF importer) -> glTF frame (Y up, +Z front)"""
    return Vector((v.x, v.z, -v.y))


def shoulder_y(obj):
    """garment shoulder line (glTF y): where the outline narrows from the body width into the hood"""
    ys = sorted(gl(v.co).y for v in obj.data.vertices)
    lo, hi = ys[0], ys[-1]
    width = []
    for i in range(40):
        a = lo + (hi - lo) * i / 40
        xs = [gl(v.co).x for v in obj.data.vertices if a <= gl(v.co).y < a + (hi - lo) / 40]
        width.append((a, max(xs) - min(xs) if xs else 0))
    body = max(w for _, w in width)
    return next(a for a, w in width if a > lo + (hi - lo) * 0.5 and w < body * 0.8)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    torso_path, product_path, out_path = argv[:3]
    preview = argv[3] if len(argv) > 3 else None
    pose = argv[4] if len(argv) > 4 else "straight"
    bpy.ops.wm.read_factory_settings(use_empty=True)

    torso = import_glb(torso_path)[0]
    jacket = import_glb(product_path)

    chest = [gl(v.co) for v in torso.data.vertices if 0.75 < gl(v.co).y < 0.9]
    tz = (max(p.z for p in chest) + min(p.z for p in chest)) / 2  # chest centre, front to back

    # torso: neck + pole / base only
    bm = bmesh.new()
    bm.from_mesh(torso.data)
    def keep(c):
        lo, hi, hx, hz = HAND
        return not POLE_TOP < c.y < NECK_Y or (lo < c.y < hi and abs(c.x) > hx and c.z > hz)
    gone = [f for f in bm.faces if not keep(gl(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(torso.data)
    bm.free()

    # jacket: shoulders onto the torso's, centred on the chest
    j = jacket[0]
    pts = [gl(v.co) for v in j.data.vertices]
    sy = shoulder_y(j)
    cx = (max(p.x for p in pts) + min(p.x for p in pts)) / 2
    cz = (max(p.z for p in pts) + min(p.z for p in pts)) / 2
    move = Vector((-cx, TORSO_SHOULDER_Y - sy, tz - cz))  # glTF frame
    for o in jacket:
        o.location += Vector((move.x, -move.z, move.y))  # back to Blender axes
    print("jacket shoulder", round(sy, 3), "move", [round(x, 3) for x in move])
    for o in jacket:
        apply_location(o)
        if pose == "bent":
            bend_sleeves(o)
    if pose != "bent":
        hang_hands(torso, jacket)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", use_selection=True, export_apply=True)

    if preview:
        render(preview)


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def apply_location(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    obj.select_set(False)


def get_gl(obj):
    co = np.empty(len(obj.data.vertices) * 3, np.float32)
    obj.data.vertices.foreach_get("co", co)
    b = co.reshape(-1, 3)
    return np.stack([b[:, 0], b[:, 2], -b[:, 1]], 1).astype(np.float64)


def set_gl(obj, p):
    b = np.stack([p[:, 0], -p[:, 2], p[:, 1]], 1).astype(np.float32)
    obj.data.vertices.foreach_set("co", b.ravel())
    obj.data.update()


def rotation(a, d):
    """3x3 rotation turning unit vector a onto unit vector d (Rodrigues)"""
    k = np.cross(a, d)
    sn, cs = np.linalg.norm(k), float(a @ d)
    if sn < 1e-9:
        return np.eye(3)
    k = k / sn
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + sn * K + (1 - cs) * K @ K


def hang_hands(torso, jacket):
    """straight pose: hands turned down into the cuffs, everything raised so the hands show over the hip"""
    apply_location(torso)
    t = get_gl(torso)
    jp = [get_gl(o) for o in jacket]
    allj = np.concatenate(jp)
    # all that is left between the pole and the neck is the two hands (whole faces, so no vertex stays behind)
    hands = (t[:, 1] > POLE_TOP - 0.1) & (t[:, 1] < NECK_Y - 0.05) & (np.abs(t[:, 0]) > 0.05)
    down = np.array([0.0, -1.0, 0.0])
    for s in (-1, 1):
        # cuff: bottom of the sleeve on this side
        sl = allj[(allj[:, 0] * s) > 0.24]
        yb = sl[:, 1].min()
        ring = allj[((allj[:, 0] * s) > 0.20) & (allj[:, 1] < yb + 0.03)]
        cuff = np.array([(ring[:, 0].min() + ring[:, 0].max()) / 2, yb + WRIST_INSET, (ring[:, 2].min() + ring[:, 2].max()) / 2])
        e = np.array([s * ELBOW[0], ELBOW[1], 0.0])
        w = np.array([s * WRIST[0], WRIST[1], WRIST[2]])
        R = rotation((w - e) / np.linalg.norm(w - e), down)  # forearm -> straight down
        m = hands & (np.sign(t[:, 0]) == s)
        t[m] = (t[m] - w) @ R.T + cuff
    raise_ = max(0.0, HIP + HAND_CLEAR - t[hands, 1].min())
    # neck + hands + jacket up; the pole stretched to meet them
    up = t[:, 1] > POLE_TOP
    pole = (t[:, 1] > 0.03) & ~up
    t[pole, 1] = 0.03 + (t[pole, 1] - 0.03) * (POLE_TOP - 0.03 + raise_) / (POLE_TOP - 0.03)
    t[up, 1] += raise_
    set_gl(torso, t)
    for o, p in zip(jacket, jp):
        p[:, 1] += raise_
        set_gl(o, p)
    print("hands hung, raised", round(raise_, 3))


def bend_sleeves(obj):
    """turn the sleeves below the elbow towards the torso's wrists (glTF frame maths on the Blender mesh)"""
    p = get_gl(obj)
    side = np.sign(p[:, 0])
    ax = np.abs(p[:, 0])
    w = smooth(ax, *SLEEVE_X) * smooth(-p[:, 1], -(ELBOW[1] + ELBOW_BAND), -(ELBOW[1] - ELBOW_BAND))
    sleeve = (w > 0) & (ax > SLEEVE_X[0])
    zc = float(np.median(p[sleeve & (np.abs(p[:, 1] - ELBOW[1]) < 0.03), 2])) if sleeve.any() else 0.0
    out = p.copy()
    for s in (-1, 1):
        m = sleeve & (side == s)
        e = np.array([s * ELBOW[0], ELBOW[1], zc])
        wr = np.array([s * WRIST[0], WRIST[1], WRIST[2]])
        d = wr - e
        length = np.linalg.norm(d) + CUFF_EXTRA
        d /= np.linalg.norm(d)
        a = np.array([0.0, -1.0, 0.0])
        # rotation a -> d (Rodrigues)
        k = np.cross(a, d)
        sn, cs = np.linalg.norm(k), float(a @ d)
        k = k / sn
        K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
        R = np.eye(3) + sn * K + (1 - cs) * K @ K
        r = p[m] - e
        t = r @ a  # distance down the sleeve below the elbow
        cuff = t[t > 0].max() if (t > 0).any() else 1.0
        squash = np.where(t > 0, t * (length / cuff), t)  # forearm part bunched to the wrist
        bent = e + (r - np.outer(t, a)) @ R.T + np.outer(squash, d)
        out[m] = p[m] + w[m][:, None] * (bent - p[m])
    set_gl(obj, out)


def render(path):
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    scn.display.shading.light = "STUDIO"
    scn.display.shading.color_type = "TEXTURE"
    scn.render.resolution_x, scn.render.resolution_y = 1200, 900
    scn.world = bpy.data.worlds.new("w")
    scn.world.color = (1, 1, 1)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 1.3
    scn.collection.objects.link(cam)
    scn.camera = cam
    for i, yaw in enumerate((0, 90)):
        a = math.radians(yaw)
        cam.location = Vector((3 * math.sin(a), -3 * math.cos(a), 0.75))
        cam.rotation_euler = (math.radians(90), 0, a)
        scn.render.filepath = path.replace(".png", f"_{i}.png")
        bpy.ops.render.render(write_still=True)


main()
