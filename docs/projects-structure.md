# 프로젝트 탭 (`/ko/projects/*`) 구조

REA `capture_browser_scenario` 로 목록 → 프로젝트 상세 → 콘텐츠 하위 5탭 → 포트폴리오 →
AI 견적을 차례로 열어 네트워크를 뜨고, 응답은 API 로 직접 받아 형태를 확인했다. 2026-10-22.

> 2026-10-22 이후 archisketch 호출은 모두 `scripts/oxy.py` (Oxylabs 레지덴셜, 한국 출구 + 세션 고정)를 거친다.

---

## 1. 사이드바 — 프로젝트 그룹

```
프로젝트
  내 프로젝트  (▸ 펼침)
    프로젝트        /ko/projects/my
    공유 프로젝트    /ko/projects/shared
    전체 프로젝트    /ko/projects/all
```

가구/마감재/텍스처와 같은 셸을 쓴다. 우상단에 `＋ 새로운 프로젝트`.

## 2. 프로젝트 목록 `/ko/projects/my`

왼쪽 폴더 패널 + 오른쪽 카드 그리드.

- 상단 배너 카드 3개: `더 많은 프리미엄 기능` · `주간 업데이트 소식` · `사용법 배우기`
- 폴더 패널: `＋ 새로운 폴더`, `전체 프로젝트`, 사용자 폴더(예 `MLB VMD`), `휴지통`
- 필터 바: `전체 보기` / `북마크`, 우측에 검색 · 그리드/리스트 토글 · 정렬(`수정 최신순`)
- `전체 프로젝트 14개 중 14개의 프로젝트들`
- 첫 카드는 `새로운 프로젝트` (+ AI 입력창)
- 프로젝트 카드: 커버 이미지, 이름, `수정일: …`, 소유자 아바타+이름

### API

```
GET /project/api/v1/projects?projectDirectoryType=PERSONAL&offset=0&limit=14&sortType=UPDATED_DESC&status=ACTIVE
GET /project/api/v1/projects?projectDirectoryType=PERSONAL&offset=0&limit=20&status=DELETE   # 휴지통
GET /v2/categories/root/{userId}/PROJECT/individual                                          # 폴더 트리
```

응답:

```jsonc
{ "result": "SUCCESS",
  "data": {
    "content": [ {
      "id", "name",
      "images": [ { "type": "RENDER"|"DEFAULT"|"THUMBNAIL", "imageId", "url", "order" } ],
      "bookmarked": false,
      "ownerUser": { "id", "name", "email", "imageUrl" },
      "projectAccessUsers": [ { "id", "name", "email", "accessType": "EDIT" } ],   // 공유 대상
      "createdAt", "updatedAt"
    } ],
    "hasNext": false, "totalCount": 14 },
  "error": null }
```

- 커버 URL 은 `images[].url` 중 `type: DEFAULT`/`THUMBNAIL` 에 직접 들어 있다
  (`https://resources.archisketch.com/project-images/cover-images/...`).
- `type: RENDER` 는 `url` 이 비어 있고 `imageId` 만 있다 → §4 규칙으로 조립.

F&F 계정: ACTIVE **14**(강남사옥·MLB 성수 + Untitled 12), 휴지통 **23**.
공유 프로젝트는 `projectAccessUsers` 로 구분(한 건만 Yuna 에게 EDIT 공유).

## 3. 프로젝트 상세 `/ko/projects/{id}`

상단 배너(커버) 위에:

- `← ` 뒤로 · `N 개의 층 · 프로젝트 전체 면적 : NNN m² · 수정일 : … · 생성일 : …` · 이름 · `프로젝트 이름 변경`
- 우측 `에디터로 이동` · `more`(⋮) · `프로젝트 커버 변경`
- **탭 3개**: `콘텐츠` / `포트폴리오` / `AI 견적 Beta`

### 콘텐츠 탭 — 하위 5개

| 하위탭 | API | F&F 데이터 |
|---|---|---|
| **도면** | 프로젝트 상세의 `floorplans[]` (벡터) | 강남 3층 |
| **렌더샷** | `GET /v1/projects/{id}/renderings?status=all&page=0&limit=-1&charcteristic=ITEM&source=RENDER` | 강남 28, 성수 48 |
| **AI 스냅샷** | `…&source=AI_SNAP` | 0 (`no-renderings.png`) |
| **720 투어** | `GET /v1/projects/{id}/720-tours` | 0 (`no-tour.png`) |
| **AI 스타일러** | `GET /v2/diffusions/projects/{id}?page=0&size=10` | 0 |

데이터가 없으면 각 하위탭이 빈 상태 플레이스홀더를 보인다.

### 포트폴리오 탭

```
GET /v2/portfolio/{id}/project    → [] (비어 있음)
```
포토북(이미지 번들)도 있다: `GET /v1/image-bundles/project/{id}?page=0&size=12`
(강남에 `new_photobook_...` 1건).

### AI 견적 탭 (Beta)

```
GET /v1/users/estimate-settings/guidelines
GET /v1/users/reference-estimates
GET /v1/users/estimates?projectId={id}    → estimates: [] (비어 있음)
```

## 4. 렌더샷 — 이미지 URL · 다운로드

렌더 레코드의 `_id` 가 이미지 ID 다. 상태 `status: 2` 가 완료(COMPLETE).

```
썸네일    https://resources.archisketch.com/images/{id}/550xAUTO/{id}.png     (~225 KB)
중간      https://resources.archisketch.com/images/{id}/1600xAUTO/{id}.png
워터마크원본 https://resources.archisketch.com/images/{id}/{id}.png              (풀 해상도, 워터마크 有)
풀해상도   https://resources.archisketch.com/images/{id}/{W}x{H}/{id}.png        (resolution 그대로)
```

`{cdn}/images/{id}/550xAUTO/{id}.png` 가 번들의 조립 규칙이다
(`${cdnUrl}/images/${id}/550xAUTO/${id}.png`, status COMPLETE 일 때).

**다운로드 버튼**은 별도 엔드포인트를 친다 — 풀해상도 경로를 돌려준다:

```
POST /v1/projects/{id}/renderings/download   body { imageIds: [id, ...] }
  → { "path": "https://resources.archisketch.com/images/{id}/{W}x{H}/{id}.png" }
```

CDN 은 **프록시 경유로 토큰 없이 200**. 한 장 실측 3000×3000 PNG = 10.8 MB.

### 렌더 레코드 필드 (`renderings[]`)

```jsonc
{ "_id", "projectId", "floorplanId", "uuid", "type": 0, "status": 2,
  "resolution": {x,y}, "temperature", "position": {x,y,z}, "rotation": {x,y,z},
  "viewport": {min,max,width,height}, "renderSettingId",
  "watermark": {image, active}, "comment": {title, body},
  "items": [ {productId, position, archiId, isVisible, productType, ...} ],   // 화면에 찍힌 태그
  "autoFocus", "autoFurnitureLighting", "characteristic": "ITEM",
  "createdAt", "updatedAt" }
```

### 렌더 상세 패널 값 (화면의 `이미지 상세 정보`)

패널의 햇빛·간접조명·시야각 등은 레코드가 아니라 **별도 조회**에서 온다:

```
GET /v1/image/{imageId}/lightsettings
```

```jsonc
{ "camera": { "fov": 60, "focalLength": 15.12, "near": 2298,       // 시야각 · 카메라 클립
              "resolution": {x,y}, "position": {x,y,z}, "quaternion" },
  "light": { "interiorTemperature": 5800, "interiorLightIntensity": 40,   // 환경값 온도 · 간접조명
             "worldTemperature": 5000, "worldLightIntensity": 35,
             "intensity": 0.35, "year", "month", "time": 420, "orientation": 0 },  // 햇빛 강도·월·시간(분)·방위각
  "lightSource": { "id", "title": "2F", "items": [ {type:"spot", status, position, ...} ] },  // 배치 조명
  "dimension": {min, max} }
```

패널 매핑:
- `뷰 종류` ← 레코드 `type`/일인칭 여부, `해상도` ← `resolution`
- `카메라 높이` ← `camera.position.y`, `카메라 클립` ← `camera.near`, `시야각` ← `camera.fov`
- `햇빛` ← `light.month`/`time`(분, 420 = 07:00)/`intensity`/`orientation`
- `간접 조명` ← `light.interiorLightIntensity`
- `환경값` ← `light.worldTemperature`/`worldLightIntensity`/수평회전

## 5. 도면 (floorplan) — 벡터

프로젝트 상세 `floorplans[]` 의 각 층:

```jsonc
{ "id", "archiId", "title": "Floor 1"|"Floor 2"|"B1F", "area",
  "dimensions": {min,max}, "fpImageScale": {x,y},
  "corners":  [ {archiId, position:{x,y,z}} ],
  "walls":    [ {archiId, corners:[id,id], finishes:[{color,productId,...}]} ],
  "rooms":    [ {archiId, corners:[...], finish, ceiling} ],
  "items":    [ {archiId, productId, position:{x,y,z}, rotation, scale, meta:{editorType:{code}}} ],  // 배치 가구
  "columns":  [ ... ],
  "groupsV2", "finishItems", "dxfUrl" }
```

강남사옥 예: Floor1 코너 32·벽 34·방 3·배치 221, Floor2 코너 32·벽 37·방 7·배치 252, B1F 코너 4·배치 89.

**클론에서는** 템플릿 때처럼 `corners`+`walls` 로 평면 윤곽을 인라인 SVG 로 그리고,
`items[].position` 에 가구 썸네일/점을 얹는다. `fpImageScale` 로 축척을 맞춘다.

배치 가구의 `productId` 는 우리가 받아둔 glb 카탈로그와 매칭된다 —
143개 고유 중 **137개가 로컬 glb 로 연결**(강남 3층 기준). 즉 도면의 각 가구를 클릭하면
우리 3D 뷰어로 열 수 있다.

## 6. 클론 범위

| 화면 | 경로 | 내용 |
|---|---|---|
| 프로젝트 목록 | `/ko/projects/my` | 폴더 패널 + 카드 그리드(14) + 휴지통 뱃지 |
| 공유 프로젝트 | `/ko/projects/shared` | `projectAccessUsers` 있는 것만 |
| 프로젝트 상세 | `/ko/projects/{id}` | 헤더 + 콘텐츠(도면 SVG · 렌더샷 갤러리) / 포트폴리오 / AI 견적 |
| 렌더 상세 | 렌더샷 클릭 | 큰 이미지 + `이미지 상세 정보` 패널(lightsettings) + 다운로드 |

- 렌더샷 썸네일은 로컬(`assets/__프로젝트/...`), 없으면 CDN 폴백.
- 빈 하위탭(AI 스냅샷/720/스타일러/견적)은 원본처럼 빈 상태로.
- 도면·렌더 태그의 가구는 로컬 glb 뷰어로 연결.

## 7. 데이터 파일

| | |
|---|---|
| `data/projects.raw.json` | 목록(active+trash) + 폴더 |
| `data/projects/<pid>.json` | 프로젝트별 상세·5탭·렌더 lightsettings |
| `data/projects.json` | 웹앱용 정규화(빌드 스크립트) |
| `assets/__프로젝트/<이름>__<id8>/` | 커버 + 렌더 썸네일 |

수집: `scripts/collect_projects.py` (프록시 경유), 정규화: `scripts/build_projects.py`.

---

## 8. 전체 프로젝트 `/ko/projects/team` (2026-10-27)

클론의 프로젝트 메뉴를 원본 **전체 프로젝트** 하나로 바꿨다. `내 프로젝트`·`프로젝트`·`공유 프로젝트`는 없앴고
예전 주소(`/ko/projects/my|shared|all`)는 `/ko/projects/team` 으로 리다이렉트한다.

```
목록   GET /project/api/v1/projects?projectDirectoryType=ENTERPRISE&offset=0&limit=100&sortType=UPDATED_DESC&status=ACTIVE   → 57
폴더   GET /v2/categories/root/{EID}/PROJECT                → F&F / 국내(10) 중국(30) 대만(1) 홍콩(4)
소속   위 목록 + &directoryId={folderId}                     → 폴더별 프로젝트 (폴더 밖 Untitled 12)
```

- `projectDirectoryType=TEAM` 은 400. `/PROJECT/enterprise`·`/team` 은 404.
- **주의**: `/v2/categories/root/{id}/PROJECT/individual` 은 루트가 없으면 GET 인데도 새로 만든다.
  기업 ID 로 한 번 불러서 빈 `Project` 루트가 생겼다(2026-10-27). 다시 부르지 말 것.
- 상세 수집은 국내 10 만 했다 (`collect_projects.py --folder 국내`). 나머지는 `TODO.md`.
