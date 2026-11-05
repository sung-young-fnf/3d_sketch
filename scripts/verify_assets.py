"""
내려받은 .glb 를 전수 검사한다.

구조 검사(빠름, 전부):  glTF 매직 / 버전 / 선언 길이 == 실제 크기 / JSON·BIN 청크 파싱 /
                       Draco 확장 선언 여부 / mesh·material·image·triangle 수
임포트 검사(느림, 표본): --blender 를 주면 표본을 Blender 헤드리스로 실제 임포트해본다.

결과: data/verify-report.json  (+ 콘솔 요약)
"""

import argparse
import collections
import io
import json
import os
import random
import struct
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def inspect(path):
    """구조만 본다. 문제가 있으면 'error' 키가 붙는다."""
    size = os.path.getsize(path)
    out = {"bytes": size}
    if size < 20:
        return {**out, "error": "too small"}
    with open(path, "rb") as f:
        head = f.read(12)
        magic, version, declared = struct.unpack("<4sII", head)
        if magic != b"glTF":
            return {**out, "error": f"bad magic {magic!r}"}
        out["version"] = version
        if declared != size:
            return {**out, "error": f"declared {declared} != actual {size}"}
        gltf = None
        off = 12
        while off < size:
            f.seek(off)
            hdr = f.read(8)
            if len(hdr) < 8:
                return {**out, "error": "truncated chunk header"}
            clen, ctype = struct.unpack("<II", hdr)
            if off + 8 + clen > size:
                return {**out, "error": "chunk overruns file"}
            if ctype == JSON_CHUNK:
                try:
                    gltf = json.loads(f.read(clen).decode("utf-8"))
                except Exception as e:  # noqa: BLE001
                    return {**out, "error": f"bad JSON chunk: {e}"}
            elif ctype not in (BIN_CHUNK,):
                out.setdefault("unknown_chunks", []).append(hex(ctype))
            off += 8 + clen
    if gltf is None:
        return {**out, "error": "no JSON chunk"}
    tris = 0
    for m in gltf.get("meshes", []):
        for p in m.get("primitives", []):
            if "indices" in p:
                tris += gltf["accessors"][p["indices"]]["count"] // 3
    out.update({
        "meshes": len(gltf.get("meshes", [])),
        "materials": len(gltf.get("materials", [])),
        "images": len(gltf.get("images", [])),
        "textures": len(gltf.get("textures", [])),
        "nodes": len(gltf.get("nodes", [])),
        "triangles": tris,
        "draco": "KHR_draco_mesh_compression" in gltf.get("extensionsUsed", []),
        "generator": (gltf.get("asset") or {}).get("generator"),
    })
    return out


BLENDER_SNIPPET = r'''
import bpy, sys, json
paths = sys.argv[sys.argv.index("--")+1:]
out = []
for p in paths:
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=p)
        objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        tris = 0
        for o in objs:
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
        out.append({"path": p, "ok": True, "meshes": len(objs), "tris": tris,
                    "images": len(bpy.data.images), "materials": len(bpy.data.materials)})
    except Exception as e:
        out.append({"path": p, "ok": False, "error": str(e)})
print("@@BLENDER@@" + json.dumps(out))
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blender", type=int, default=0, help="Blender 로 실제 임포트해볼 표본 수")
    ap.add_argument("--seed", type=int, default=20261020)
    a = ap.parse_args()

    files = []
    for dp, _, fs in os.walk(ASSETS):
        for f in fs:
            if f.lower().endswith(".glb"):
                files.append(os.path.join(dp, f))
    files.sort()
    print(f"glb {len(files)}개 구조 검사")

    results, bad = {}, []
    total = 0
    stats = collections.Counter()
    for i, p in enumerate(files, 1):
        r = inspect(p)
        rel = os.path.relpath(p, ROOT).replace("\\", "/")
        results[rel] = r
        total += r["bytes"]
        if "error" in r:
            bad.append((rel, r["error"]))
        else:
            stats["draco"] += bool(r["draco"])
            stats["with_textures"] += bool(r["images"])
            stats["triangles"] += r["triangles"]
        if i % 250 == 0:
            print(f"  {i}/{len(files)}")

    print(f"\n구조 OK {len(files)-len(bad)}/{len(files)}   합계 {total/1e9:.2f} GB")
    print(f"  Draco 압축 {stats['draco']}   텍스처 내장 {stats['with_textures']}   "
          f"삼각형 합계 {stats['triangles']:,}")
    gens = collections.Counter(r.get("generator") for r in results.values() if "error" not in r)
    for g, n in gens.most_common(5):
        print(f"  generator: {g}  x{n}")
    if bad:
        print(f"\n문제 {len(bad)}건:")
        for rel, err in bad[:20]:
            print(f"  {err:38} {rel}")

    report = {"total_files": len(files), "total_bytes": total, "bad": bad, "files": results}

    if a.blender and files:
        ok_files = [os.path.join(ROOT, p) for p, r in results.items() if "error" not in r]
        random.seed(a.seed)
        sample = random.sample(ok_files, min(a.blender, len(ok_files)))
        print(f"\nBlender 임포트 표본 {len(sample)}개")
        snippet = os.path.join(ROOT, "data", "_blender_check.py")
        open(snippet, "w", encoding="utf-8").write(BLENDER_SNIPPET)
        proc = subprocess.run([BLENDER, "-b", "--factory-startup", "--python", snippet, "--", *sample],
                              capture_output=True, text=True, encoding="utf-8", errors="replace")
        line = next((l for l in proc.stdout.splitlines() if l.startswith("@@BLENDER@@")), None)
        if line:
            imported = json.loads(line[len("@@BLENDER@@"):])
            good = [x for x in imported if x["ok"]]
            print(f"  임포트 성공 {len(good)}/{len(imported)}")
            for x in imported:
                if not x["ok"]:
                    print(f"  FAIL {x['path']}: {x['error'][:120]}")
            report["blender"] = imported
        else:
            print("  Blender 출력 파싱 실패")
            report["blender_stderr"] = proc.stderr[-2000:]
        os.remove(snippet)

    out = os.path.join(ROOT, "data", "verify-report.json")
    json.dump(report, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\n→ {out}")


if __name__ == "__main__":
    main()
