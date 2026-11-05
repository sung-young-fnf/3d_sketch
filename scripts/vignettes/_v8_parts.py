"""
08 1층 중앙행거 부품 -> assets/F&F/국내-명동/[디스커버리 명동]/부품/v8_*.glb

The library caps / sweatshirt / duffel are plain white (or one brown); the photo's caps and tops come in many
colours, so this makes recoloured copies (same meshes, only the material colour changes):
  v8_볼캡_<색>      볼캡_모자_낱개 (6-panel ball cap) in the photo's cap colours
  v8_캠프캡_<색>    나일론 모자 (flat camp cap, photo row 2: white / orange / black / sky)
  v8_맨투맨_<색>    옷걸이&맨투맨 (sweatshirt on a hanger, the garment only; the metal hanger keeps its colour)
  v8_더플백         더플백 tinted dark brown (the brown Discovery duffel on the top shelf)
  v8_캡선반         [DX명동]스탠드 행거_판 in plain dark grey (wood texture dropped): the angled metal cap trays
  v8_두상           마네킹머리 & 모자 holds two capped heads side by side: one of them (the cap on a head stand)

The file name starts with "_" so build_vignettes.py (which loads scripts/vignettes/v*.py as scenes) skips it.

    python -X utf8 scripts/vignettes/_v8_parts.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_vignette_parts as P  # noqa: E402

FF = P.FF
OUT = P.OUT
M = os.path.join(FF, "＊소품", "의류&잡화")
BALLCAP = os.path.join(M, "모자", "볼캡_모자_낱개__8bce7cac.glb")
CAMPCAP = os.path.join(M, "모자", "나일론 모자__769a4f37.glb")
SWEAT = os.path.join(M, "의류", "옷걸이", "옷걸이&맨투맨__bcd34945.glb")
DUFFEL = os.path.join(M, "가방", "더플백__ZtJBT3pD.glb")
HEAD = os.path.join(FF, "＊소품", "마네킹", "마네킹머리 & 모자__ZtJBy0D9.glb")
BOARD = os.path.join(OUT, "[DX명동]스탠드 행거_판.glb")

# sRGB hex picked off 08_중앙행거.jpg (linearised below)
CAP = {"회색": "8c9294", "세이지": "6f8e86", "모브": "86707f", "검정": "1e1f22", "흰색": "e9e9e6", "주황": "e0752a",
       "하늘": "86b4d8", "스톤": "c9c8bd", "연그린": "a8b5a8", "그린": "6f8f74", "아이보리": "ddd8cc", "차콜": "55585c",
       "베이지": "cbb79c", "카키": "4c5e44", "네이비": "222a40", "브라운": "6b4a33"}
SWEATS = {"흰색": "ecebe6", "라일락": "c7aec9", "회색": "b4b6b8", "네이비": "1f2a44", "검정": "1f2024",
          "브라운": "4a3329", "하늘": "a9c3d6", "베이지": "cfc4b2", "핑크": "b884a8"}


def lin(hexs):
    c = [int(hexs[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [round(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92, 4) for v in c] + [1.0]


def recolor(src, dst, color, only=None, rough=None, plain=False):
    """copy src with the base colour factor of its materials (or the named ones) set to color"""
    g, bin_ = P.read_glb(src)
    for m in g["materials"]:
        if only and not any(m.get("name", "").startswith(o) for o in only):
            continue
        pbr = m.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorFactor"] = color
        if plain:
            pbr.pop("baseColorTexture", None)
        if rough is not None:
            pbr["roughnessFactor"], pbr["metallicFactor"] = rough, 0.0
    views = [(P.view_bytes(g, bin_, i), {k: v[k] for k in ("byteStride", "target") if k in v})
             for i, v in enumerate(g["bufferViews"])]
    P.write_glb(dst, g, views)


def main():
    for name, hexs in CAP.items():
        recolor(BALLCAP, os.path.join(OUT, f"v8_볼캡_{name}.glb"), lin(hexs), rough=0.85)
    for name in ("흰색", "주황", "검정", "하늘", "베이지", "회색"):
        recolor(CAMPCAP, os.path.join(OUT, f"v8_캠프캡_{name}.glb"), lin(CAP[name]), rough=0.7)
    for name, hexs in SWEATS.items():
        recolor(SWEAT, os.path.join(OUT, f"v8_맨투맨_{name}.glb"), lin(hexs), only=("Material.002", "[0130_Gainsboro]"),
                rough=0.95)
    recolor(DUFFEL, os.path.join(OUT, "v8_더플백.glb"), lin("3a2a20"))
    recolor(BOARD, os.path.join(OUT, "v8_캡선반.glb"), lin("6a6a6c"), rough=0.55, plain=True)
    P.subset(HEAD, os.path.join(OUT, "v8_두상.glb"), lambda lo, hi, name: lo[2] > 0)
    # the same head stand split: the bare head + neck (the cap is a swappable 모자 slot sitting on it), and its cap
    P.subset(HEAD, os.path.join(OUT, "v8_두상_머리.glb"), lambda lo, hi, name: lo[2] > 0 and lo[1] < 130)
    P.subset(HEAD, os.path.join(OUT, "v8_두상_캡.glb"), lambda lo, hi, name: lo[2] > 0 and lo[1] >= 130)


if __name__ == "__main__":
    main()
