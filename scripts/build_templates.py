"""data/templates.raw.json → data/templates.json (웹앱용)

라벨은 원본 i18n(ko.json) 키를 그대로 따른다:
  published/template_published=등록 완료 · displaying=전시 중 · template_add_image=템플릿 추가 이미지
  interior_style=인테리어 스타일 · timeline=수정기록 · comment=코멘트 · space_info=공간 정보
  interior_total_price=전체 인테리어 가격 · templateList=내 템플릿 · templateTags=템플릿 태그
"""

import io
import json
import os
import sys
import unicodedata

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")

STYLE_KO = {
    "KOREAN_AND_ASIAN": "한국&아시아", "MODERN": "모던", "NATURAL": "내추럴",
    "NORDIC": "북유럽", "CLASSIC": "클래식", "VINTAGE": "빈티지",
    "INDUSTRIAL": "인더스트리얼", "MINIMAL": "미니멀", "FRENCH": "프렌치",
    "UNIQUE": "유니크", "LOVELY": "러블리", "PROVENCE": "프로방스",
}

# editorTypeCode → 분류 (제품 목록 그룹핑용)
TYPE_KO = {10: "마감재", 20: "가구/소품", 40: "조명", 51: "문", 58: "창문"}


def nfc(s):
    return unicodedata.normalize("NFC", s or "")


def main():
    raw = json.load(open(os.path.join(D, "templates.raw.json"), encoding="utf-8"))

    room_ko = {}
    for r in (raw.get("roomTypes") or {}).get("data", []):
        room_ko[r["symbol"]] = nfc((r.get("i18n") or {}).get("ko") or r["symbol"])

    templates = []
    for rec in raw["templates"]:
        s = rec["summary"]
        local = rec.get("localImages") or {}
        renders = rec.get("renderImages") or {}

        # 도면 벡터 (SVG 로 그릴 수 있게 코너만 꺼낸다)
        floorplan = None
        detail = rec.get("detail")
        if isinstance(detail, list) and detail and detail[0].get("floorplan"):
            try:
                fp = json.loads(detail[0]["floorplan"])
                floorplan = {
                    "archiId": fp.get("archiId"),
                    "version": fp.get("version"),
                    "areaMm2": fp.get("area"),
                    "dimensions": fp.get("dimensions"),
                    "corners": [
                        {"id": c.get("archiId"), "x": c["position"]["x"], "z": c["position"]["z"]}
                        for c in fp.get("corners", []) if c.get("position")
                    ],
                }
            except (ValueError, KeyError, TypeError):
                floorplan = None

        products = []
        for p in s.get("products", []):
            url = p.get("image") or ""
            products.append({
                "id": p["_id"],
                "name": nfc(p.get("name")),
                "brandName": p.get("brandName"),
                "count": p.get("count", 0),
                "price": p.get("price"),
                "editorTypeCode": p.get("editorTypeCode"),
                "typeLabel": TYPE_KO.get(p.get("editorTypeCode"), "기타"),
                "remoteImage": url,
                "localImage": local.get(url),
            })

        area_m2 = s.get("roomSize") or 0
        templates.append({
            "id": s["_id"],
            "projectId": s.get("projectId"),
            "name": nfc(s.get("name")),
            "description": nfc(s.get("description")),
            "status": s.get("status"),
            "statusLabel": "등록 완료" if s.get("status") == "PUBLISHED" else "임시 저장",
            "displaying": not s.get("isPrivate", False),
            "scope": s.get("scope"),
            "styles": [{"code": c, "label": STYLE_KO.get(c, c)} for c in (s.get("styles") or [])],
            "roomType": s.get("roomType"),
            "roomTypeLabel": room_ko.get(s.get("roomType"), s.get("roomType")),
            "areaM2": round(area_m2, 1),
            "areaPyeong": round(area_m2 / 3.305785, 0),
            "totalPrice": {"value": 0, "unit": "KRW"},
            "useCount": s.get("useCount", 0),
            "likeCount": s.get("likeCount", 0),
            "owner": {"name": nfc((s.get("user") or {}).get("name")),
                      "email": (s.get("user") or {}).get("email")},
            "createdAt": s.get("createdAt"),
            "updatedAt": s.get("updatedAt"),
            # 표지 이미지는 별도 필드가 없다. 추가 이미지 첫 장을 표지로 쓴다.
            "coverImage": next(
                (os.path.relpath(v["path"], ROOT).replace("\\", "/") if os.path.isabs(v["path"])
                 else v["path"].split("fnf_3dsketch/")[-1] for v in renders.values()), None),
            "additionalImages": [
                {"id": iid, "remote": v["url"],
                 "local": os.path.relpath(v["path"], ROOT).replace("\\", "/")
                 if os.path.isabs(v["path"]) else v["path"].split("fnf_3dsketch/")[-1],
                 "bytes": v["bytes"], "resolution": "3840x2160", "badge": "4K"}
                for iid, v in renders.items()
            ],
            "products": products,
            "productCount": len(products),
            "history": (rec.get("history") or {}).get("modifications") or [],
            "comments": (rec.get("comments") or {}).get("comments") or [],
            "floorplan": floorplan,
            "localDir": rec.get("localDir"),
        })

    out = {
        "enterpriseId": raw.get("enterpriseId"),
        "templates": templates,
        "roomTypes": [
            {"symbol": r["symbol"], "code": r.get("code"),
             "label": nfc((r.get("i18n") or {}).get("ko") or r["symbol"]),
             "isTemplateSupported": r.get("isTemplateSupported")}
            for r in (raw.get("roomTypes") or {}).get("data", [])
        ],
        "styles": [{"code": k, "label": v} for k, v in STYLE_KO.items()],
        "tagGroups": raw.get("tagGroups") or [],
    }
    p = os.path.join(D, "templates.json")
    json.dump(out, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    t = templates[0] if templates else None
    print(f"templates {len(templates)}  roomTypes {len(out['roomTypes'])}  "
          f"tagGroups {len(out['tagGroups'])}")
    if t:
        print(f"  {t['name']} · {t['statusLabel']} · {t['roomTypeLabel']} "
              f"{t['areaM2']}m²/{t['areaPyeong']:.0f}평 · 제품 {t['productCount']} · "
              f"추가이미지 {len(t['additionalImages'])} · "
              f"도면 코너 {len(t['floorplan']['corners']) if t['floorplan'] else 0}")
    print(f"→ {p}")


if __name__ == "__main__":
    main()
