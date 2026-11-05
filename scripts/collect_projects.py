"""
프로젝트 탭 데이터 수집 — 전부 Oxylabs 프록시(oxy.Client) 경유.

원본 `/ko/projects/team` (전체 프로젝트, 기업 스코프 57개) 기준.
  목록   GET /project/api/v1/projects?projectDirectoryType=ENTERPRISE&...
  폴더   GET /v2/categories/root/{EID}/PROJECT       → F&F / 국내(10)·중국(30)·대만(1)·홍콩(4)
  소속   목록 API 에 &directoryId={folderId}           → 폴더별 프로젝트
  ※ /v2/categories/root/{id}/PROJECT/individual 는 루트가 없으면 GET 인데도 새로 만든다. 부르지 말 것.

  --folder 국내   그 폴더 프로젝트만 상세·이미지까지 받는다 (목록·폴더는 항상 전부).

받는 것:
  data/projects.raw.json      기업 목록(ACTIVE) + 폴더 트리 + 폴더 소속(folderOf)
  data/projects/<pid>.json     프로젝트별 상세(층·도면 벡터) + 콘텐츠 5탭 + 렌더별 lightsettings

이미지(assets/__프로젝트/<프로젝트명>__<id8>/):
  cover.*                      프로젝트 커버
  render_<n>__<imgId>.jpg      렌더샷 썸네일 (1600폭) — 그리드·뷰어용

렌더 원본(최대 수 GB)은 URL 만 기록하고 받지 않는다. 필요하면 --full 로 받는다.
"""

import argparse
import io
import json
import os
import re
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oxy import Client  # noqa: E402

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
EID = "ZtDxN1y583722F9F0E74FA2"
USER = "ZtDxOCG7A9404279E82457D"
BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
nfc = lambda s: unicodedata.normalize("NFC", s or "")


def safe(name, limit=50):
    return (BAD.sub("_", nfc(name).strip()).rstrip(". ") or "unnamed")[:limit]


def img_url(image_id, size="1600xAUTO"):
    return f"https://resources.archisketch.com/images/{image_id}/{size}/{image_id}.png"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="렌더 원본(풀해상도)도 받는다")
    ap.add_argument("--thumb", default="550xAUTO", help="썸네일 크기 (기본 550xAUTO)")
    ap.add_argument("--folder", help="이 이름으로 시작하는 폴더의 프로젝트만 상세 수집 (예: 국내)")
    a = ap.parse_args()

    c = Client()
    print("출구 IP", c.ip()["ip"], "/ 세션", c.session_id)

    lst = "/project/api/v1/projects?projectDirectoryType=ENTERPRISE&offset=0&limit=100&sortType=UPDATED_DESC"
    out = {"enterpriseId": EID, "userId": USER, "scope": "ENTERPRISE"}
    out["folders"] = c.get(f"/v2/categories/root/{EID}/PROJECT")
    act = c.get(lst + "&status=ACTIVE")
    out["active"] = act["data"]
    tr = c.get(lst + "&status=DELETE")
    out["trash"] = tr["data"]

    folder_of = {}
    for root in out["folders"]["rootDirectories"]:
        for ch in root["childDirectories"]:
            members = c.get(lst + f"&status=ACTIVE&directoryId={ch['id']}")["data"]["content"]
            for m in members:
                folder_of[m["id"]] = ch["id"]
            print(f"  폴더 {nfc(ch['name'])}: {len(members)}")
            time.sleep(0.4)
    out["folderOf"] = folder_of

    rows = act["data"]["content"]
    print(f"ACTIVE {len(rows)} / 휴지통 {tr['data'].get('totalCount')}")
    if a.folder:
        want = {ch["id"] for root in out["folders"]["rootDirectories"]
                for ch in root["childDirectories"] if nfc(ch["name"]).startswith(a.folder)}
        rows = [p for p in rows if folder_of.get(p["id"]) in want]
        print(f"--folder {a.folder}: 상세 수집 {len(rows)}개")

    os.makedirs(os.path.join(DATA, "projects"), exist_ok=True)
    total_imgs = 0

    for p in rows:
        pid = p["id"]
        name = nfc(p["name"])
        folder = os.path.join(ROOT, "assets", "__프로젝트", f"{safe(name)}__{pid[:8]}")

        rec = {"id": pid, "name": name, "localDir": os.path.relpath(folder, ROOT).replace("\\", "/")}
        rec["detail"] = c.get(f"/project/api/v1/projects/{pid}?type=VIEW")
        time.sleep(0.5)

        # 콘텐츠 5탭
        rec["renders"] = c.get(f"/v1/projects/{pid}/renderings"
                               "?status=all&page=0&limit=-1&charcteristic=ITEM&source=RENDER")
        time.sleep(0.4)
        rec["aiSnaps"] = c.get(f"/v1/projects/{pid}/renderings"
                               "?status=all&page=0&limit=-1&charcteristic=ITEM&source=AI_SNAP")
        time.sleep(0.4)
        rec["tours"] = c.get(f"/v1/projects/{pid}/720-tours")
        rec["styler"] = c.get(f"/v2/diffusions/projects/{pid}?page=0&size=50")
        rec["bundles"] = c.get(f"/v1/image-bundles/project/{pid}?page=0&size=50")
        rec["portfolio"] = c.get(f"/v2/portfolio/{pid}/project")
        rec["estimates"] = c.get(f"/v1/users/estimates?projectId={pid}")
        time.sleep(0.4)

        # 커버
        cover = next((i["url"] for i in p["images"]
                      if i["type"] == "DEFAULT" and i.get("url")), None) \
            or next((i["url"] for i in p["images"] if i.get("url")), None)
        if cover:
            ext = os.path.splitext(cover.split("?")[0])[1] or ".png"
            st, n = c.download(cover, os.path.join(folder, "cover" + ext))
            rec["coverLocal"] = os.path.relpath(os.path.join(folder, "cover" + ext), ROOT).replace("\\", "/") if st in ("ok", "skip") else None
            total_imgs += st == "ok"

        # 렌더샷 썸네일 + lightsettings
        lights = {}
        rlist = rec["renders"].get("renderings", [])
        for n_i, r in enumerate(rlist, 1):
            iid = r["_id"]
            if r.get("status") == 2:  # COMPLETE
                dest = os.path.join(folder, f"render_{n_i}__{iid}.jpg")
                st, _ = c.download(img_url(iid, a.thumb), dest)
                total_imgs += st == "ok"
                if a.full:
                    full = os.path.join(folder, f"render_{n_i}__{iid}_full.png")
                    res = r.get("resolution") or {}
                    size = f"{int(res.get('x', 0))}x{int(res.get('y', 0))}"
                    c.download(img_url(iid, size), full)
                try:
                    lights[iid] = c.get(f"/v1/image/{iid}/lightsettings")
                except Exception as e:  # noqa: BLE001
                    lights[iid] = {"error": str(e)}
                time.sleep(0.25)
        rec["lightSettings"] = lights

        json.dump(rec, open(os.path.join(DATA, "projects", pid + ".json"), "w", encoding="utf-8"),
                  ensure_ascii=False)
        print(f"  {name[:20]:20} 층 {len(rec['detail']['data'].get('floorplans') or [])} "
              f"렌더 {len(rlist)} 썸네일완료 · lightsettings {len(lights)}")
        time.sleep(0.6)

    json.dump(out, open(os.path.join(DATA, "projects.raw.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    print(f"\n이미지 {total_imgs}장 받음 → data/projects.raw.json + data/projects/<pid>.json")


if __name__ == "__main__":
    main()
