"""
다운로드가 끝난 뒤 폴더 이름을 원본 사이드바와 맞춘다.

왜 필요한가
  - 사이트의 "미분류 제품들" 은 실제 카테고리가 아니라 categoryIds 가 빈 제품을 모아 보여주는
    가상 노드다. build_catalog.py 는 그런 제품을 `_미분류` 로 떨어뜨린다 → 사진과 맞게 고친다.
  - 원본 `*가구` `*조명` 같은 이름의 `*` 는 Windows 파일명에 못 쓴다. `_가구` 로 받아둔 것을
    전각 별표 `＊`(U+FF0A) 로 바꿔 사진과 같은 모양이 되게 한다. (`--ascii` 로 끄면 `_` 유지)

catalog.json 의 localDir 도 같이 고쳐서 웹앱이 가리키는 경로가 어긋나지 않게 한다.
멱등하다 — 여러 번 돌려도 안전하다.
"""

import argparse
import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
CATALOG = os.path.join(ROOT, "data", "catalog.json")

STAR = "＊"  # ＊ fullwidth asterisk


def merge_dir(src, dst):
    """src 를 dst 로 옮긴다. dst 가 이미 있으면 안쪽 파일 단위로 합친다."""
    if not os.path.isdir(src):
        return 0
    if not os.path.exists(dst):
        os.renames(src, dst)
        return 1
    moved = 0
    for name in os.listdir(src):
        s, d = os.path.join(src, name), os.path.join(dst, name)
        if os.path.isdir(s):
            moved += merge_dir(s, d)
        elif not os.path.exists(d):
            os.makedirs(dst, exist_ok=True)
            os.replace(s, d)
            moved += 1
    if os.path.isdir(src) and not os.listdir(src):
        os.rmdir(src)
    return moved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ascii", action="store_true",
                    help="`_가구` 를 그대로 둔다 (전각 별표로 바꾸지 않음)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    # 원본 사이드바에서 "미분류 제품들" 은 F&F 아래에 달린다. 받을 때는 최상위 `_미분류` 로
    # 떨어지므로 F&F 안으로 들여보낸다.
    renames = [("_미분류", "F&F/미분류 제품들")]
    if not a.ascii:
        fnf = os.path.join(ASSETS, "F&F")
        if os.path.isdir(fnf):
            for name in sorted(os.listdir(fnf)):
                if name.startswith("_") and os.path.isdir(os.path.join(fnf, name)):
                    renames.append((f"F&F/{name}", f"F&F/{STAR}{name[1:]}"))

    for src_rel, dst_rel in renames:
        src, dst = os.path.join(ASSETS, *src_rel.split("/")), os.path.join(ASSETS, *dst_rel.split("/"))
        if not os.path.isdir(src):
            continue
        print(f"{'[dry] ' if a.dry_run else ''}{src_rel}  ->  {dst_rel}")
        if not a.dry_run:
            merge_dir(src, dst)

    if a.dry_run or not os.path.exists(CATALOG):
        return

    cat = json.load(open(CATALOG, encoding="utf-8"))
    changed = 0
    for p in cat["products"]:
        d = p.get("localDir") or ""
        for src_rel, dst_rel in renames:
            if d == src_rel or d.startswith(src_rel + "/"):
                p["localDir"] = dst_rel + d[len(src_rel):]
                changed += 1
                break
    json.dump(cat, open(CATALOG, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"catalog.json localDir {changed}건 갱신")


if __name__ == "__main__":
    main()
