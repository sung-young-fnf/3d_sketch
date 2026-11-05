"""
프로젝트 도면에 놓인 '프로젝트 전용' 가구(items[].customPath)를 받는다 — Oxylabs 프록시 경유.

customPath 는 에디터에서 치수·재질을 바꾼 사본이라 가구 라이브러리 glb 와 다르다.
  https://resources.archisketch.com/<customPath>          (.gltf, 외부 .bin/이미지 참조)
gltf 가 가리키는 buffers[].uri / images[].uri 도 같은 폴더 기준으로 같이 받는다.

저장: assets/__프로젝트/<프로젝트폴더>/custom/<customPath 그대로>

사용:
    python scripts/fetch_custom_items.py Z_qVQjfBCDE9007CAF64124
"""

import io
import json
import os
import posixpath
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oxy import Client  # noqa: E402

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDN = "https://resources.archisketch.com/"


def main():
    pid = sys.argv[1]
    rec = json.load(open(os.path.join(ROOT, "data", "projects", pid + ".json"), encoding="utf-8"))
    base = os.path.join(ROOT, *rec["localDir"].split("/"), "custom")
    paths = sorted({it["customPath"] for f in rec["detail"]["data"]["floorplans"]
                    for it in f.get("items") or [] if it.get("customPath")})
    print(f"customPath {len(paths)}종")
    if not paths:
        return

    c = Client(login=False)
    print("출구 IP", c.ip()["ip"])
    ok = fail = 0
    for cp in paths:
        dest = os.path.join(base, *cp.split("/"))
        st, _ = c.download(CDN + cp, dest)
        if st not in ("ok", "skip"):
            print("  실패", st, cp)
            fail += 1
            continue
        gltf = json.load(open(dest, encoding="utf-8"))
        folder = posixpath.dirname(cp)
        side = [b.get("uri") for b in gltf.get("buffers", [])] + [i.get("uri") for i in gltf.get("images", [])]
        for uri in side:
            if not uri or uri.startswith("data:"):
                continue
            rel = posixpath.normpath(posixpath.join(folder, urllib.parse.unquote(uri)))
            s2, _ = c.download(CDN + urllib.parse.quote(rel), os.path.join(base, *rel.split("/")))
            if s2 not in ("ok", "skip"):
                print("  사이드카 실패", s2, rel)
                fail += 1
        ok += 1
    print(f"완료 {ok} / 실패 {fail} → {os.path.relpath(base, ROOT)}")


if __name__ == "__main__":
    main()
