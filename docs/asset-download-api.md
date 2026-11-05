# Archisketch 에셋 API 다운로드 가이드

`fnf.archisketch.com` 테넌트에서 3D 모델(`.glb`/`.gltf`/`.usdz`), 마감재·텍스처 PBR 맵,
템플릿 렌더 이미지를 API 로 받는 방법. 전부 실제로 돌려서 확인한 내용이다.

> **대시보드 UI 로는 3D 모델을 못 받는다.** 상세 화면의 다운로드 버튼 두 개는 i18n 키가
> `downloadrepresentativeImage`("대표 이미지 다운로드")와 `downloadThumb`("썸네일 다운로드")라
> **이미지뿐**이다. 모델 파일은 그 화면이 호출하는 **API 응답 안에만** 들어 있다.

---

## 0. 한눈에

| 단계 | 하는 일 |
|---|---|
| 1 | `POST /login` 으로 JWT 받기 |
| 2 | 목록 API 로 제품/컴포넌트 수집 (`Authorization: Bearer` 필요) |
| 3 | 응답에서 `.glb` URL 을 조립하거나 상세 API 에서 꺼내기 |
| 4 | **CDN 에서 토큰 없이** 파일 받기 |

핵심 두 가지:

- **인증이 필요한 건 API 뿐이고 CDN 은 공개다.** `resources.archisketch.com` 의 객체는
  `Authorization` 헤더 없이 200 이 떨어진다. 대신 디렉터리 리스팅은 403 이라 URL 을 모르면 못 긁는다.
- **목록 API 한 번으로 glb URL 을 조립할 수 있다.** 제품마다 상세 API 를 때릴 필요가 없다
  (1,745 번 → 18 번).

---

## 1. 로그인

```bash
curl -s -X POST https://api.archisketch.com/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://fnf.archisketch.com" \
  -d '{"email":"...","password":"..."}'
```

응답의 `token` 이 JWT 다 (`refreshToken` 도 같이 온다).

이후 **모든** 호출에:

```
Authorization: Bearer <token>
```

> 소문자 없이 `Authorization: <token>`, `x-access-token`, `token` 헤더는 전부 **401**.
> `Bearer` 접두사가 있어야 한다.

응답에서 같이 챙길 값:

| 값 | 쓰임 |
|---|---|
| `user.enterpriseId` | 모든 목록 API 의 필수 파라미터 (F&F = `ZtDxN1y583722F9F0E74FA2`) |
| `user._id` | 일부 사용자 스코프 API |

---

## 2. 가구 — 3D 모델 (`.glb`)

### 2-1. 목록

```bash
GET /search/sale/v2
      ?page=0&limit=100
      &sort=UPDATED_DESC
      &enterpriseIds={eid}
      [&categoryIds={categoryId}]
      [&parametricFilter=NON_PARAMETRIC]
```

```jsonc
{ "result": {
    "data": [ { "id", "name", "categoryIds": [...],
                "components": { "records": [ {
                    "id",
                    "previewImage": "https://resources.archisketch.com/modelings/{mid}/IMAGE/{ts}/{mid}_1.png",
                    "dimension": { "mmWidth", "mmDepth", "mmHeight" },
                    "modeling": { "renderingStatus": "COMPLETED" }
                } ] } } ],
    "meta": { "page": 0, "count": 100, "totalPage": 18, "totalCount": 1745 } } }
```

**`page` 는 0-based.** 화면 URL(`?page=1`)은 1-based라 헷갈리기 쉽다.

### 2-2. glb URL 조립 ← 이게 지름길

`previewImage` 경로에 `{mid}`(modelingId)와 `{ts}`(타임스탬프)가 그대로 박혀 있다.
같은 값으로 모델 URL 이 만들어진다.

```
preview : https://resources.archisketch.com/modelings/{mid}/IMAGE/{ts}/{mid}_1.png
glb     : https://resources.archisketch.com/modelings/{mid}/RENDER/{ts}/{mid}.glb
gltf    : https://resources.archisketch.com/modelings/{mid}/RENDER/{ts}/{mid}.gltf
usdz    : https://resources.archisketch.com/modelings/{mid}/RENDER/{ts}/{mid}.usdz
```

```python
import re
PAT = re.compile(r'https://resources\.archisketch\.com/modelings/([0-9a-f]{32})/IMAGE/(\d+)/')
m = PAT.match(component["previewImage"])
if m:
    mid, ts = m.groups()
    glb = f"https://resources.archisketch.com/modelings/{mid}/RENDER/{ts}/{mid}.glb"
```

무작위 30건 HEAD 테스트 → 30/30 성공. 전체 1,726건 실다운로드 → **실패 0**.

### 2-3. 상세 API (구 경로 제품용)

경로 스킴이 두 가지다.

| 스킴 | 예 | 수 |
|---|---|---|
| 신 `modelings/...` | `/modelings/38e4…/RENDER/1784534845378/38e4….glb` | 1,577 |
| 구 `product/{pid}/{dd-mm-yyyy_hh-mm-ss}/...` | `/product/ZtJEzVE…/23-12-2025_02-40-42/Render/ZtJEzVE….glb` | 149 |
| 모델 없음 (렌더링 FAILED 20 · PROCESSING 1) | | 21 |

구 경로는 `previewImage` 가 `/product/...` 로 시작해 조립이 안 되므로 상세 API 로 꺼낸다.

```bash
GET /product/v1/sales/{productId}/detail?includeStat=true
```

```jsonc
componentDetails[].component.arAsset.android.url   // .glb   ← 실제 쓸 것
componentDetails[].component.arAsset.ios.url       // .usdz
componentDetails[].component.dxfAsset              // 대개 null
componentDetails[].modeling.editorAsset.url        // /EDITOR/.../{mid}.gltf (KTX2 계열)
componentDetails[].modeling.renderAsset.url        // /RENDER/.../{mid}.gltf
componentDetails[].modeling.decimateAsset.url      // → CDN 403
componentDetails[].modeling.images[]               // {mid}_0..5.png
```

### 2-4. 받기

```bash
# 토큰 없이 받아진다
curl -o model.glb "https://resources.archisketch.com/modelings/{mid}/RENDER/{ts}/{mid}.glb"
```

### 2-5. 카테고리 트리

```bash
GET /v2/categories/root/{eid}/FURNITURE      # 루트 + 1단계 children
GET /v2/categories/{categoryId}              # childDirectoryIds 로 재귀 → 전체 300개
GET /v2/categories/path/{categoryId}         # breadcrumb
GET /v2/categories/type/FURNITURE/allowed
```

---

## 3. `.glb` vs `.gltf` — 같은 모델이 아니다

| | `.glb` | `.gltf` |
|---|---|---|
| 자체 포함 | **예** (텍스처가 bufferView 에 내장) | **아니오** — `.bin` + 개별 `.png` 외부 참조 |
| 단독 사용 | 바로 열림 | **사이드카 없으면 안 열림** |
| 크기 | 같은 모델 4.1 MB | 45 KB (껍데기) |
| 단위 | **미터** (API `dimensionMm` ÷ 1000 과 일치) | **밀리미터** (1000배로 들어옴) |
| 압축 | Draco **아님** (`KHR_materials_emissive_strength` / `KHR_texture_transform` / 없음) | 일부 Draco |

**결론: `.glb` 를 써라.**

`.gltf` 가 꼭 필요하면 사이드카를 마저 받아야 한다. 기준 경로는 **gltf URL 의 디렉터리**다.

```python
base = gltf_url.rsplit("/", 1)[0] + "/"
d = json.load(open(local_gltf))
for coll in ("buffers", "images"):
    for item in d.get(coll, []):
        uri = item.get("uri")
        if uri and not uri.startswith("data:") and "://" not in uri:
            download(base + urllib.parse.quote(urllib.parse.unquote(uri)), ...)
```

실측: gltf 1,722개에 사이드카 **8,984개(4.53 GB)**. 받고 나면 1,722/1,722 단독 사용 가능.

---

## 4. 마감재 (FINISH) — PBR 맵

```bash
GET /finishes/v1
      ?enterpriseId={eid}
      &categoryId={cid}
      &page=0&size=30
      &sort=updatedAt,desc
      [&name=&code=&sku=]

GET /v2/categories/root/{eid}/FINISH
```

```jsonc
{ "data": [ {
    "id", "translatedNames": [{code:"ko", value}],
    "mappingDimension": { "width": 1024, "height": 1024, "unit": "mm" },
    "renderSettings": { "glossy", "bumpy" },
    "salesInfo": { "type": "WALLPAPER", ... },
    "textureImages": {
      "original":  { "url": ".../3d/high/..._col.png" },
      "preview":   { "url": ".../3d/low/..._col.png" },
      "albedo":    { "url": ... },
      "normal":    { "url": ... },
      "roughness": { "url": ... },
      "metalness": { "url": ... }
    } } ],
  "page", "size", "count", "totalCount", "totalPages" }
```

F&F 기준 51건. `original`/`preview` 는 51/51 다 있고, PBR 4종은 12건에만 달려 있다.
그 12건 중 일부는 CDN 이 **객체 단위로 403** 을 낸다 (normal 7/12, roughness 6/12, metalness 11/12).

---

## 5. 텍스처 머티리얼 (TEXTURE)

```bash
GET /v1/materials/{eid}/byCategories
      ?categories={categoryId}
      &page=0&size=30
      &sort=updatedAt,desc
      &keyword=

GET /v2/categories/root/{eid}/TEXTURE   # etc / Paint / Metal / Wood / Floor / Wall / Stone
```

```jsonc
{ "data": [ { "id", "name", "roughness", "normalScale",
    "material": {
      "previewImage":   { "url", "repeat", "offset", "center", "rotation" },
      "colorImage":     { "url", ... },
      "normalImage":    { "url", ... },
      "roughnessImage": { "url", ... },
      "metalImage":     { "url", ... }
    } } ] }
```

루트 카테고리로 조회하면 0건이다 — **하위 카테고리별로 조회**해야 한다. F&F 기준 26건, 5종 맵 전부 존재.

---

## 6. 인테리어 템플릿 — 4K 렌더

```bash
GET /v1/template/enterprise?styles=&roomTypes=&statuses=&sortBy=updatedDesc&page=0&size=24
GET /v1/template/{id}            # floorplan 벡터 JSON 포함
GET /v1/template/{id}/bound      # 공간 정보
GET /v1/template/{id}/history
GET /v1/template/{id}/comments
GET /v1/image/byIds?imageIds=a,b&mlMeta=true
GET /v1/room-types?enterpriseId={eid}&useCommonTypes=true&useRoomTypeOrders=true
GET /v1/tagGroups?targetResource=TEMPLATE
```

**렌더 이미지 URL 은 응답에 없다.** `/v1/image/byIds` 는 해상도·메타만 주고 파일 경로를 안 준다.
URL 은 `imageIds` 로 조립한다:

```
원본(3840×2160) : https://i.archisketch.com/images/{imageId}/{imageId}.png
리사이즈        : https://i.archisketch.com/images/{imageId}/{imageId}.png?f=jpeg&w=1280
```

`i.archisketch.com` 은 리사이즈 CDN 이라 `?f=webp|jpeg&w=<px>` 로 변환해서 받을 수 있다.
쿼리 없이 요청하면 원본이 온다.

제품 썸네일은 `template.products[].image` 에 URL 이 그대로 들어 있다.

---

## 7. 레이트 리밋 · 함정

| | |
|---|---|
| **목록 API 429** | 페이지 간 **1.5초**, 상세 **1.1초** + 지수 백오프로 통과. 간격 없이 돌리면 바로 429 |
| **CDN 은 느슨** | 1,726개 연속 8.75 GB 받는 동안 한 번도 안 막혔다. **프록시 불필요** |
| **403 은 객체 단위** | 같은 `modelings/{id}/` 아래에서 glb 는 200 인데 형제 gltf/png 만 403 이 날 수 있다. 폴더 권한이 아니다 |
| **NFD 한글** | API 가 자모 분리(NFD)로 줄 때가 있다. 파일명·비교 전에 **NFC 정규화** 필수 (NTFS 는 준 대로 저장해서 NFD 조회가 NFC 파일을 못 찾는다) |
| **이름 속 `/`** | `BAG/ACC` 같은 카테고리명이 있다. 경로로 쓸 때 치환하지 않으면 한 단계 더 중첩된다 |
| **다중 카테고리** | 한 제품이 여러 카테고리에 속한다. 하위 집계를 단순 덧셈하면 1,745개가 3,563개로 부풀어 오른다 — **제품 id 집합**으로 세라 |
| **용량** | glb 평균 5.1 MB, 최대 95 MB. 전체 **8.75 GB** (+gltf 사이드카 4.5 GB) |

---

## 8. 정식 경로 — Open API 키

번들에 `/auth/api/v1/open-api/key`, `/auth/api/v1/open-api/keys` 가 있고,
화면은 **설정 › 연동**에서 키를 발급한다.

```
https://api.archisketch.com/openapi/docs/api
```

이 문서는 **세션 JWT 로는 401** 이다. 별도 키 스킴이라는 뜻이다.
일회성 수집이 아니라 지속 연동이면 이쪽이 맞다.

---

## 9. 이 저장소의 구현

| 스크립트 | 하는 일 |
|---|---|
| `scripts/download_assets.py` | 가구 glb/gltf/png 일괄 (재개 가능, glb 헤더 검증, sha256, `--proxy`) |
| `scripts/download_gltf_sidecars.py` | gltf 의 `.bin`/텍스처 사이드카 |
| `scripts/download_finishes_textures.py` | 마감재·텍스처 맵 |
| `scripts/collect_templates.py` | 템플릿 데이터 + 4K 렌더 |
| `scripts/build_catalog.py` | raw → `catalog.json` / `categories.json` |
| `scripts/verify_assets.py` | 전수 구조 검사 + Blender 임포트 표본 |

계정은 `Shop-vmd-blender/.env`. 전체 구조는 `site-structure.md`.

> 대량 추출·사외 보관이 아키스케치와의 계약상 허용되는지는 기술 판단 밖이다.
> 확인 전에는 사내 보관만.
