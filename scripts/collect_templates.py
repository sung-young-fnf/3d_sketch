"""
인테리어 템플릿(내 템플릿 / 템플릿 태그) 데이터와 이미지를 수집한다.

REA 로 확인한 엔드포인트:
  GET /v1/template/enterprise?styles=&roomTypes=&statuses=&sortBy=updatedDesc&page=&size=
  GET /v1/template/enterprise/candidates?page=&size=
  GET /v1/template/{id}            상세
  GET /v1/template/{id}/bound      공간 정보 · 도면
  GET /v1/template/{id}/history    수정기록
  GET /v1/template/{id}/comments   코멘트
  GET /v1/image/byIds?imageIds=a,b&mlMeta=true   템플릿 추가 이미지
  GET /v1/room-types?enterpriseId=&useCommonTypes=true&useRoomTypeOrders=true
  GET /v1/tagGroups?targetResource=TEMPLATE

출력:
  data/templates.raw.json
  assets/__템플릿/<템플릿명>__<id8>/{cover,image_1,image_2,plan_*}.png
"""

import io
import json
import os
import random
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.archisketch.com"
EID = "ZtDxN1y583722F9F0E74FA2"
BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe(name, limit=60):
    name = BAD.sub("_", unicodedata.normalize("NFC", name or "").strip()).rstrip(". ")
    return (name or "unnamed")[:limit]


def login():
    # account from Shop-vmd-blender/.env (admin_id / admin_password), never in the code
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from oxy import _env
    env = _env()
    body = json.dumps({"email": env["admin_id"], "password": env["admin_password"]}).encode()
    req = urllib.request.Request(API + "/login", data=body,
                                 headers={"Content-Type": "application/json",
                                          "Origin": "https://fnf.archisketch.com"})
    with urllib.request.urlopen(req, timeout=40) as f:
        return json.loads(f.read().decode("utf-8"))["token"]


def get(tok, path, tries=5):
    for a in range(tries):
        try:
            req = urllib.request.Request(API + path,
                                         headers={"Authorization": "Bearer " + tok,
                                                  "Origin": "https://fnf.archisketch.com"})
            with urllib.request.urlopen(req, timeout=40) as f:
                return json.loads(f.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503):
                time.sleep(2 ** a + random.random())
                continue
            print(f"  HTTP {e.code} {path[:90]}")
            return None
        except Exception as e:  # noqa: BLE001
            if a == tries - 1:
                print(f"  ERR {e} {path[:90]}")
                return None
            time.sleep(2 ** a)
    return None


def fetch_file(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "skip", os.path.getsize(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    try:
        with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
            while True:
                chunk = r.read(1 << 16)
                if not chunk:
                    break
                f.write(chunk)
        os.replace(tmp, dest)
        return "ok", os.path.getsize(dest)
    except urllib.error.HTTPError as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        return f"http{e.code}", 0
    except Exception:  # noqa: BLE001
        if os.path.exists(tmp):
            os.remove(tmp)
        return "error", 0


def urls_in(obj, found=None):
    """중첩 구조 어디에 있든 resources/i.archisketch 이미지 URL 을 끌어모은다."""
    if found is None:
        found = []
    if isinstance(obj, dict):
        for v in obj.values():
            urls_in(v, found)
    elif isinstance(obj, list):
        for v in obj:
            urls_in(v, found)
    elif isinstance(obj, str) and obj.startswith("http") and "archisketch.com" in obj:
        if re.search(r"\.(png|jpe?g|webp)(\?|$)", obj, re.I):
            found.append(obj)
    return found


def main():
    tok = login()
    print("logged in")

    out = {"enterpriseId": EID, "templates": [], "roomTypes": None, "tagGroups": None,
           "candidates": None}

    out["roomTypes"] = get(tok, f"/v1/room-types?enterpriseId={EID}"
                                "&useCommonTypes=true&useRoomTypeOrders=true")
    out["tagGroups"] = get(tok, "/v1/tagGroups?targetResource=TEMPLATE")
    out["candidates"] = get(tok, "/v1/template/enterprise/candidates?page=0&size=100")

    # 목록 (페이지 전부)
    listing, page = [], 0
    while True:
        d = get(tok, "/v1/template/enterprise?styles=&roomTypes=&statuses="
                     f"&sortBy=updatedDesc&page={page}&size=24")
        if not d:
            break
        rows = d if isinstance(d, list) else d.get("data") or []
        listing += rows
        if len(rows) < 24:
            break
        page += 1
        time.sleep(1.0)
    print(f"templates: {len(listing)}")

    downloads = []
    for t in listing:
        tid = t["_id"]
        rec = {"summary": t}
        for key, path in (("detail", f"/v1/template/{tid}"),
                          ("bound", f"/v1/template/{tid}/bound"),
                          ("history", f"/v1/template/{tid}/history"),
                          ("comments", f"/v1/template/{tid}/comments")):
            rec[key] = get(tok, path)
            time.sleep(0.6)
        ids = t.get("imageIds") or []
        if ids:
            q = urllib.parse.quote(",".join(ids))
            rec["images"] = get(tok, f"/v1/image/byIds?imageIds={q}&mlMeta=true")
            time.sleep(0.6)

        folder = os.path.join(ROOT, "assets", "__템플릿",
                              f'{safe(t.get("name"))}__{tid[:8]}')
        seen, local = set(), {}
        for src_key in ("summary", "detail", "bound", "images"):
            for u in urls_in(rec.get(src_key)):
                if u in seen:
                    continue
                seen.add(u)
                base = os.path.basename(urllib.parse.urlparse(u).path) or "image.png"
                dest = os.path.join(folder, safe(f"{src_key}__{base}", 90))
                status, n = fetch_file(u, dest)
                downloads.append((status, n))
                local[u] = os.path.relpath(dest, ROOT).replace("\\", "/")
                time.sleep(0.2)
        rec["localImages"] = local
        rec["localDir"] = os.path.relpath(folder, ROOT).replace("\\", "/")
        out["templates"].append(rec)
        print(f'  {t.get("name")}  이미지 {len(local)}장')

    p = os.path.join(ROOT, "data", "templates.raw.json")
    json.dump(out, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    ok = sum(1 for s, _ in downloads if s == "ok")
    skip = sum(1 for s, _ in downloads if s == "skip")
    fail = len(downloads) - ok - skip
    mb = sum(n for _, n in downloads) / 1e6
    print(f"\n이미지 ok {ok} / skip {skip} / fail {fail}, {mb:.1f} MB")
    print(f"→ {p}")


if __name__ == "__main__":
    main()
