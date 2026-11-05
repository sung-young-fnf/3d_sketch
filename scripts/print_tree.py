"""카테고리 트리를 원본 사이드바 순서대로 출력한다. 사진과 눈으로 대조하는 용도."""
import json, os, sys, io, argparse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ap = argparse.ArgumentParser()
ap.add_argument("--depth", type=int, default=3)
ap.add_argument("--out", default="")
a = ap.parse_args()

d = json.load(open(os.path.join(ROOT, "data", "categories.json"), encoding="utf-8"))
cats, root = d["categories"], d["rootId"]
cat2 = json.load(open(os.path.join(ROOT, "data", "catalog.json"), encoding="utf-8"))
uncat = sum(1 for p in cat2["products"] if not p["primaryCategoryId"])

lines = []
def walk(cid, depth=0):
    c = cats[cid]
    n = c["descendantProductCount"]
    lines.append(f'{"  " * depth}{"└ " if depth else ""}{c["name"]}'
                 f'{"" if depth > a.depth else f"   ({n})" if n else ""}')
    if depth >= a.depth:
        return
    for ch in c["childIds"]:
        if ch in cats:
            walk(ch, depth + 1)

walk(root)
lines.insert(1, f'  └ 미분류 제품들   ({uncat})   ← 가상 노드 (categoryIds 가 빈 제품)')
text = "\n".join(lines)
print(text)
if a.out:
    open(os.path.join(ROOT, a.out), "w", encoding="utf-8").write(text + "\n")
    print(f"\n→ {a.out}")
