"""
착장 토르소 step 1: the 4 dressed views (front / back / left / right) for UniForge3D (docs/store-assembly.md §10)

GPT image (god-tibo-imagen) gets the bare-torso photo of each view + the product's official front/back cut
(dcs-ai get_kr_products_color_images, image_seq 23 = front, 24 = back, GENERAL) and dresses the torso.
The front is made first; back / left / right then also get that dressed front so all four match.

    python scripts/torso_dress_views.py <torso views dir> <product front> <product back> <out dir>

torso views dir: torso1.png front, torso2.png back, torso3.png / torso4.png sides (the 토르소 사진).
out dir gets front.png back.png left.png right.png.
"""
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

GTI = os.environ.get("GTI_CLI", r"C:\Users\Admin\3d-test\god-tibo-imagen\src\cli\generate.js")
MODEL = os.environ.get("GTI_MODEL", "gpt-6-astra")  # gpt-5.4 (the CLI default) is refused for ChatGPT accounts

FRONT = (
    "Image 1 is a white headless male mannequin torso on a metal stand, seen from the front. Images 2 and 3 are the "
    "front and back of a hooded down puffer jacket (product photos). Dress the mannequin from image 1 in exactly this "
    "jacket, worn naturally: zipped up and closed, hood down resting behind the neck, sleeves on the arms with the "
    "mannequin's white hands coming out of the cuffs in the same pose. Keep every jacket detail exactly as in images "
    "2-3 (colour, sheen, quilting baffles, seams, logo patch position, cuffs, length). Keep the mannequin's neck, hands, "
    "metal pole and round base, and the exact same camera angle, scale and framing as image 1. Pure white background, "
    "even soft studio light, no shadows, entire object visible with margin, nothing cropped. Photorealistic product photo."
)
OTHER = (
    "Image 1 is a white headless male mannequin torso on a metal stand, seen from {view}. Images 2 and 3 are the front "
    "and back of a hooded down puffer jacket. Dress the mannequin from image 1 in exactly this jacket, seen from {view} "
    "as in image 1. Image 4 shows this mannequin already dressed in the jacket from the front - match that dressed look "
    "exactly (same jacket fit, volume, length, colour, hood down behind the neck, white hands out of the cuffs). Keep "
    "every jacket detail from images 2-3. Keep the mannequin's neck, hands, metal pole and round base, and the exact "
    "same camera angle, scale and framing as image 1. Pure white background, even soft studio light, no shadows, entire "
    "object visible with margin, nothing cropped. Photorealistic product photo."
)
VIEWS = {
    "back": ("torso2.png", "the back"),
    "left": ("torso3.png", "its side (profile, chest pointing to the left of the frame)"),
    "right": ("torso4.png", "its side (profile, chest pointing to the right of the frame)"),
}


def gen(prompt, images, out):
    cmd = ["node", GTI, "--model", MODEL, "--size", "1024x1536", "--output", out, "--prompt", prompt]
    for im in images:
        cmd += ["--image", im]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode or not os.path.exists(out):
        raise RuntimeError(f"{out}: {r.stderr[-400:]}")
    print("ok", out, flush=True)


def main():
    torso, front, back, out = sys.argv[1:5]
    os.makedirs(out, exist_ok=True)
    dressed_front = os.path.join(out, "front.png")
    gen(FRONT, [os.path.join(torso, "torso1.png"), front, back], dressed_front)
    with ThreadPoolExecutor(3) as ex:
        for f in [ex.submit(gen, OTHER.format(view=view), [os.path.join(torso, src), front, back, dressed_front],
                            os.path.join(out, f"{name}.png")) for name, (src, view) in VIEWS.items()]:
            f.result()


if __name__ == "__main__":
    main()
