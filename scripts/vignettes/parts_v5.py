"""
05 1층 벽면좌측1 부품 -> assets/F&F/국내-명동/[디스커버리 명동]/부품/v5_*.glb

The wall is the 01 padding wall's system: rounded back panels with slotted uprights, grey ([DX명동]벽 행거_3-1)
and wood ([DX명동]벽 행거_3-2) alternating. The shelves / rails / top loop sit at other heights than in the
library pieces, so they are cut apart (same meshes, materials, textures) and moved as levels in build():
  - v5_회색판   3-1 without its two shelves (bare grey panel + uprights)
  - v5_나무판   3-2 without its shelf and without the round loop + single arm on top (keeps the wall track)
  - v5_선반     the shelf of 3-2 (wood ledge, light, brackets, the hanging bar under it): ledge top at y 0
  - v5_고리     the round loop + single arm of 3-2 (with their brackets): bar top at y 0
  - v5_포스터_1..4  the four AIRWELL posters of the photo, cropped onto flat panels
All are shifted so the back of the panel is at z 0 (the wall face).

    python -X utf8 scripts/vignettes/parts_v5.py  (not v*.py: build_vignettes.py loads those as scenes)
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from build_vignette_parts import FF, OUT, WALL_HANGER, panel, subset  # noqa: E402

GREY = os.path.join(FF, "＊가구", "진열장", "의류 진열장", "행거", "[DX명동]벽 행거_3-1__1418a496.glb")
PHOTO = os.path.join(FF, "국내-명동", "[디스커버리 명동]", "매장연출", "05_벽면좌측1.jpg")

shelf = lambda lo, hi, name: lo[1] >= 1020 and hi[1] <= 1160          # ledge 1120-1151 + the bar under it
top_shelf = lambda lo, hi, name: lo[1] >= 1590 and hi[1] <= 1655      # 3-1 glass shelf
loop = lambda lo, hi, name: (lo[1] >= 1940 and hi[1] <= 1990 and hi[0] - lo[0] < 600
                             and lo[0] > -490 and hi[0] < 490)        # loop, arm, their brackets (not the track ends)


def main():
    subset(GREY, os.path.join(OUT, "v5_회색판.glb"),
           lambda lo, hi, n: not shelf(lo, hi, n) and not top_shelf(lo, hi, n), shift_mm=(0, 0, 240))
    subset(WALL_HANGER, os.path.join(OUT, "v5_나무판.glb"),
           lambda lo, hi, n: not shelf(lo, hi, n) and not loop(lo, hi, n), shift_mm=(0, 0, 221))
    subset(WALL_HANGER, os.path.join(OUT, "v5_선반.glb"), shelf, shift_mm=(0, -1151, 221))
    subset(WALL_HANGER, os.path.join(OUT, "v5_고리.glb"), loop, shift_mm=(0, -1978, 221))
    # posters: boxes in px of the 2400 x 1800 photo, size in mm (photo ~2.2 mm / px at the shelf front)
    photo = Image.open(PHOTO)
    for i, (box, w, h) in enumerate((((278, 723, 492, 998), 470, 605), ((450, 753, 620, 998), 375, 540),
                                     ((1235, 723, 1418, 985), 405, 580), ((1412, 748, 1572, 985), 352, 520)), 1):
        crop = photo.crop(box)
        crop = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
        panel(os.path.join(OUT, f"v5_포스터_{i}.glb"), crop, w, h, f"v5_포스터_{i}")


if __name__ == "__main__":
    main()
