# fnf.archisketch.com — 로컬 클론

`docs/site-structure.md` 를 스펙으로 삼아 만든 Next.js 15 (App Router) 클론입니다.
**원본 API(`api.archisketch.com`)를 호출하지 않습니다.** 모든 데이터는 저장소 안의
로컬 파일에서 읽습니다.

```
fnf_3dsketch/
  data/     catalog.json, categories.json, finishes-textures.json,
            templates.json, projects.json                           (읽기 전용)
  assets/   다운로드된 .glb / .gltf / .png                           (읽기 전용)
  web/      ← 이 앱
```

## 실행

```bash
cd web
npm install
npm run dev          # http://127.0.0.1:3939
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버, **포트 3939** |
| `npm run build` | 프로덕션 빌드 (타입 체크 포함) |
| `npm start` | 빌드 결과 실행, 포트 3939 |
| `npm run typecheck` | `tsc --noEmit` |

> `next dev` 가 떠 있는 상태에서 `npm run build` 를 돌리면 둘이 같은 `.next` 를 쓰기 때문에
> 돌던 dev 서버가 500 을 뱉기 시작합니다. 빌드 뒤에는 dev 서버를 껐다 켜세요
> (필요하면 `rm -rf .next`).

데이터/에셋 경로는 기본적으로 `web/` 의 한 단계 위(`../data`, `../assets`)를 봅니다.
옮기려면 `ARCHI_DATA_DIR`, `ARCHI_ASSETS_DIR` 환경변수로 덮어쓰면 됩니다.

### 로그인

원본처럼 미인증 상태로 `/ko/...` 에 가면 **307** 로
`/ko/auth/sign-in?redirect_url=...` 에 보냅니다. 로그인 폼은 **시각적 재현**이고
아무 이메일/비밀번호(둘 다 비어 있지만 않으면)로 더미 쿠키(`enterprise-token`)가
발급됩니다. 실제 인증은 없습니다.

curl 로 확인할 때는 쿠키를 직접 주면 됩니다:

```bash
curl -b 'enterprise-token=x' http://127.0.0.1:3939/ko/enterprise-library/products/furniture
```

`/api/*` 는 미들웨어 대상이 아니므로 쿠키 없이도 열립니다.

## 구현된 화면

| 경로 | 상태 |
|---|---|
| `/` | `/ko/home-page` 로 리다이렉트 |
| `/ko/auth/sign-in` | 스펙 2절 폼 재현 (로고·이메일/비밀번호+Show·아이디 기억하기·로그인·회원가입/비밀번호 찾기·SNS 3종·copyright) |
| `/ko/auth/sign-up`, `/ko/auth/reset-password` | 로그인 화면 스타일의 "준비 중" |
| `/ko/home-page` | 셸 + 통계 카드 (총 제품 수 / 카테고리 수 / 다운로드된 모델 수 / 총 용량 + 마감재·텍스처) |
| **`/ko/enterprise-library/products/furniture`** | **완전 동작.** 폴더 트리(펼침·선택·개수), 필터 바, 상세 정보 패널(breadcrumb), `N 카테고리(들) M개의 제품`, 하위 카테고리 카드 → 제품 카드, 페이지네이션 + `30/60/120 / page` |
| **`/ko/sales/{id}`** | **완전 동작.** 상품 정보 표, 카테고리(들) breadcrumb 여러 줄, 이미지 스트립, 컴포넌트 표(치수·상태·로컬 파일), **3D 뷰어 + glb 다운로드** |
| `/ko/enterprise-library/products/finishes` | 51건. 트리 + 카드 그리드 + 상세 모달(PBR 맵 나란히, 맵별 다운로드) |
| `/ko/enterprise-library/products/texture-library` | 26건, 7개 하위 카테고리. 같은 패턴, 5개 맵 |
| **`/ko/templates/list`** | **내 템플릿.** 카드 그리드(1건) |
| **`/ko/templates/list?templateId={id}`** | **템플릿 상세.** 같은 경로에서 상세를 그립니다(원본과 같은 URL 모양) |
| `/ko/templates/manage` | 템플릿 관리. 수집된 템플릿 표 |
| `/ko/templates/tags` | 템플릿 태그. `tagGroups` 가 비어 있어 정직한 빈 상태 + 참고용 스타일 12종 |
| **`/ko/projects/my`** | **프로젝트 목록.** 폴더 패널(전체 프로젝트/MLB VMD/휴지통 23) + 배너 3개 + 카드 그리드(14 + 새 프로젝트 자리) |
| **`/ko/projects/shared`** | `sharedWith` 있는 1건만 |
| **`/ko/projects/all`** | 현재는 my 와 동일 |
| **`/ko/projects/[id]`** | **프로젝트 상세.** 커버 헤더 + 콘텐츠(도면 SVG·렌더샷 갤러리·렌더 상세 패널) / 포트폴리오 / AI 견적 Beta |
| 그 외 4절 사이드바 항목 전부 | 사이드바에 보이고 공용 "준비 중" 페이지로 이동 |

사이드바 그룹/순서는 스펙 4절 표를 따르되 **견적/상담 그룹은 통째로 뺐습니다**
(상담 관리 `/v3/order`, 전체 상담 관리 `/v3/order/all`, 고객 관리 `/v3/customers`,
채팅 `/chat` 과 그룹 제목까지). 남은 그룹은 프로젝트 / 라이브러리 / 인테리어 템플릿 /
도면 관리 / 운영 관리 / 지원 서비스 / 설정 입니다. 기업 라이브러리는 기본 펼침이고
그 아래 가구·마감재·텍스처가 있습니다.
헤더는 크레딧 5.6 · 언어 토글(표시만) · 알림 배지 26 · 아바타 + `에프앤에프 / fnf@archisketch.com`.

## API (Next.js Route Handlers)

백엔드는 별도 서버 없이 같은 앱의 route handler 이고, `catalog.json` /
`categories.json` / `finishes-textures.json` 을 **모듈 레벨 인메모리 인덱스**로 한 번만
올려 둡니다 (dev HMR 때 매 요청 재구성되지 않도록 `globalThis` 에 캐시).

| 엔드포인트 | 응답 |
|---|---|
| `GET /api/categories?type=FURNITURE\|FINISH\|TEXTURE` | `{ result: { type, rootId, count, root: <중첩 트리> } }` |
| `GET /api/categories/{id}` | `{ result: { …node, childDirectoryIds, children: [...] } }` |
| `GET /api/categories/path/{id}` | `{ result: [ {id,name,parentId,depth}, … ] }` (루트부터) |
| `GET /api/search/sale/v2?page&limit&sort&categoryIds&keyword` | `{ result: { data: [...], meta: {page,count,totalPage,totalCount} } }` |
| `GET /api/product/v1/sales/{id}/detail` | `{ result: { product, categories, componentDetails:[{component,modeling,local}] } }` |
| `GET /api/finishes?page&size&categoryId&keyword` | `{ data, page, size, count, totalCount, totalPages }` (평평한 봉투 — 원본 `/finishes/v1` 과 동일) |
| `GET /api/materials?page&size&categoryId&keyword` | 위와 같은 평평한 봉투 |
| `GET /api/templates?page&size&roomTypes&styles&statuses&keyword&sortBy` | 평평한 봉투 + `facets`. 무거운 배열(제품 85, 도면 코너)은 빼고 내려줍니다 |
| `GET /api/templates/{id}` | `{ data: { …, additionalImages, products, history, comments, floorplan:{…, geometry} } }` |
| `GET /api/projects?scope=my\|shared\|all&page&size&keyword&sortBy` | `{ result, data:{ content, totalCount, hasNext … }, meta:{ folders, trashCount } }` (원본 `/project/api/v1/projects` 봉투) |
| `GET /api/projects/{id}` | `{ result, data:{ …, floors:[{…, geometry, items[].hasLocalProduct}], renders:[{…, panel, full}] } }` |
| `GET /api/assets/{...path}` | `../assets` 에서 파일 스트리밍 |
| `GET /api/stats` | 홈 통계 |
| `POST /api/auth/sign-in` | 더미 세션 쿠키 발급 |

봉투 모양이 엔드포인트마다 다른 것은 **의도된 것**입니다 (스펙 6절).

- `sort`: `UPDATED_DESC`(기본) / `UPDATED_ASC` / `NAME_ASC` / `NAME_DESC` / `CREATED_DESC` / `CREATED_ASC`
- `categoryIds`: 콤마 구분. 기본은 `product.categoryIds` 에 **정확히 포함**된 것만 필터.
- `includeDescendants=1`: 원본에 없는 확장. 화면의 "카테고리 내 검색" 이 키워드가 있을 때만 붙입니다.
- 기본 페이지 크기 30, 화면 셀렉터는 30/60/120.
- **`page` 는 0-based** 입니다 (`/search/sale/v2`, `/finishes`, `/materials` 전부). 원본과 같습니다:
  `page=0` 이 첫 페이지, 마지막 페이지는 `totalPage - 1`, 그 너머는 0건.
  `meta.page` / `page` 는 끝을 넘겨도 **요청한 값을 그대로 echo** 합니다.
  `totalPage` 는 `ceil(totalCount / limit)` 라서 1,745건/30이면 59 입니다.
- **반면 화면 URL 은 1-based** 입니다 (`?page=1` 이 첫 페이지). 원본 사이트가 그렇기 때문에
  그대로 뒀고, 페이지 컴포넌트가 `apiPage = uiPage - 1` 로 변환합니다.

### 에셋 서빙

`assets/` 는 `public/` 밖에 있고 5~6 GB 이상이라 route handler 가
`fs.createReadStream` 으로 흘려보냅니다.

- Content-Type: `.glb → model/gltf-binary`, `.gltf → model/gltf+json`, `.png → image/png`, `.jpeg/.jpg`, `.bin`, `.usdz`
- `Content-Length`, `Accept-Ranges: bytes`, **HTTP Range(206) / 416** 지원
- `?download=1` 이면 `Content-Disposition: attachment`
- 경로 세그먼트를 URL 디코드 → **NFC 정규화** 한 뒤 `path.resolve` 결과가
  **assets 루트 안에 있는지 검증**하고, 벗어나면 403. (`%2e%2e%2f...` 류는 403 으로 확인)
- NFC 정규화를 하는 이유: 원본 API 가 NFD 를 줄 때가 있어서(10절) API 값으로 만든 링크가
  NFD 로 들어올 수 있는데, NTFS 는 준 대로 저장하므로 NFD 조회가 NFC 파일을 못 찾습니다.
  두 인코딩 모두 같은 파일을 서빙합니다.

### 한글 / 경로 주의

- 모든 이름·경로는 비교·검색 전에 **NFC 정규화** 합니다 (API 가 NFD 를 줄 때가 있음).
- 카테고리 이름에 `/` 가 들어갑니다(`BAG/ACC`, `펜스/판넬`, `D/P`, `장식/조형`, `벽/기둥`,
  `잡화 진열장(CAP/BAG/ACC)`). 경로 세그먼트를 슬래시 없는 문자열로 가정하지 않습니다.
- 한 제품이 여러 카테고리에 걸칩니다(1,745건 중 1,170건). 상세 화면은 소속 경로를 전부 보여줍니다.
- `categoryIds` 가 빈 제품 126건은 `categories.json` 에 없는 **가상 노드 `미분류 제품들`**
  (루트 `F&F` 의 첫 자식)로 묶입니다. 로컬 디렉터리는 `_미분류`.
- 컴포넌트의 로컬 파일 경로는 `assets/{product.localDir}/{component.stem}.{glb|gltf|png}`.

## 3D 뷰어

`three` + `GLTFLoader` + `OrbitControls` + `RoomEnvironment` IBL, 클라이언트 컴포넌트.

- **로컬 `.glb` 만 읽습니다.** 받아둔 `.gltf` 는 외부 `.bin` / `.png` 사이드카를 참조하는데
  그 파일들은 수집되지 않아 단독으로 열리지 않습니다. 상세 화면의 glTF 다운로드 버튼도
  "외부 텍스처 미포함" 이라고 명시합니다.
- `DRACOLoader` 를 붙여두긴 했지만(디코더는 `public/draco/gltf/`) 측정된 GLB 들은
  Draco 를 쓰지 않습니다. 디코더가 없어도 뷰어는 깨지지 않습니다.
- 바운딩 박스로 자동 프레이밍, 삼각형·메시·머티리얼 수와 실측 치수(m) + 등록 치수(mm) 표시.
- 로컬 파일이 아직 없으면 "로컬 .glb 파일이 아직 없습니다" 안내를 띄웁니다.

## 썸네일

카드 썸네일은 로컬 PNG(`/api/assets/...`)를 먼저 쓰고, 아직 다운로드되지 않았으면
원본 CDN `previewUrl` 로 떨어집니다. `onError` 폴백도 걸려 있어 다운로드가 진행 중이어도
화면이 비지 않습니다.

## 인테리어 템플릿

템플릿은 `data/templates.json` 1건(`MLB 성수` / `성수 매장`)입니다.

- 목록 카드 클릭 → `?templateId={id}` 로 같은 경로에서 상세를 그립니다. 원본이 그런 URL 구조라
  그대로 뒀습니다.
- 평면도는 `floorplan.corners` 17개(mm, x/z 평면)로 **인라인 SVG** 를 그립니다. viewBox 는
  **코너 좌표의 실제 범위**(18,889 × 15,761 mm)에 맞춥니다 — `floorplan.dimensions` 는
  ±100 m 고정 박스라 그걸로 맞추면 도면이 점처럼 줄어듭니다.
- 추가 이미지 2장은 3840×2160(15.7 MB / 3.8 MB)이라 `loading="lazy"` + 명시적 `width`/`height`
  로 레이아웃 점프를 막았습니다. 별도 리사이즈는 넣지 않았습니다.
- 제품 85종 중 **2종**(`운동화 2`, `모자 2`)은 로컬 이미지가 없어(CDN 403) `remoteImage` 로
  떨어지고, 그것도 실패하면 행이 깨지지 않게 자리표시만 남습니다.
- `수정기록` 은 기본 접힘, `코멘트` 는 기본 펼침입니다(`<details>` 네이티브). 코멘트 입력과
  `코멘트 등록` 버튼은 다른 쓰기 동작과 마찬가지로 비활성입니다.

## 프로젝트

`data/projects.json` 14건(강남사옥 3층·28렌더, MLB 성수 1층·48렌더, Untitled 12). 커버 14장과
렌더 썸네일 101장 모두 로컬에 있습니다.

- 목록: 폴더 패널(전체 프로젝트 · 사용자 폴더 `MLB VMD` · 휴지통 23) + 정적 배너 3개 + 카드 그리드.
  첫 카드는 `새로운 프로젝트` 자리, 나머지 14장은 커버·이름·수정일·소유자. 공유 프로젝트는 `공유` 배지.
- 공유 목록은 `sharedWith` 비지 않은 1건(Yuna 에게 EDIT)만.
- 상세: 커버 배너 + `N 개의 층 · 프로젝트 전체 면적 : 약 NNN m² · 수정일 · 생성일`. 면적은
  코너 폴리곤에서 계산한 근사치라 `약` 을 붙였습니다. 탭 콘텐츠/포트폴리오/AI 견적 Beta.
- **도면**: 층마다 `corners`+`walls` 로 인라인 SVG. viewBox 는 **코너 범위**에 맞춥니다
  (`dimensions` 는 ±50 m 박스라 쓰면 도면이 점이 됨). `items` 를 점으로 얹고, 로컬 glb 카탈로그에
  매칭되는 가구는 빨간 점 + `/ko/sales/{id}` 링크로 엽니다. 강남 B1F(면적 0)도 좌표로 잘 그립니다.
- **렌더샷**: 로컬 썸네일 갤러리 → 클릭하면 큰 이미지 + `이미지 상세 정보` 패널(`render.panel` 의
  lightsettings 값: 카메라 높이/클립/시야각, 햇빛 월·시간·강도·방위각, 간접조명, 환경값) + `full`
  해상도로 가는 `다운로드` 버튼.
- **AI 스냅샷 / 720 투어 / AI 스타일러 / 포트폴리오 / AI 견적**: 데이터가 없어 정직한 빈 상태.

주의: 배치 가구 `productId` 와 우리 glb 카탈로그의 교집합은 작습니다(강남 126개 중 id 로 매칭 4개 —
스펙의 137/143 은 archiId 기준이고 우리 카탈로그 키와 다릅니다). 매칭되는 것만 3D 로 열 수 있다고
표시하고, 나머지는 점으로만 그립니다. 과장하지 않았습니다.

## 원본과 다른 점 / 한계

- 추적 스크립트(GTM·GA·Meta Pixel·Clarity·Datadog·Channel.io·Stripe·Naver Maps) 전부 없음.
- 인증은 로컬 더미. 권한(`roleKey`) 필터링은 하지 않고 메뉴에 툴팁으로만 표시.
- 3D 뷰어와 glb/gltf 다운로드는 **원본에 없는 기능**입니다 (원본은 이미지만 받을 수 있음 — 스펙 8·11절).
- 브랜드, 제품 구매 링크, 최신 판매량(`includeStat`)은 로컬 데이터에 없어 `-` 로 둡니다.
- 사이드바 "새로운 카테고리", "업로드", "엑셀 추출하기", "이름 수정" 등 쓰기 동작은 전부 비활성.
- 마감재 51건 중 PBR 맵 세트를 가진 것은 12건이고, 그중 normal 7/12 · roughness 6/12 ·
  metalness 11/12 만 받아졌습니다(원본 CDN 403). 나머지 39건은 애초에 original/preview 뿐입니다.
  화면에서 숨기지 않고 "미수집" 플레이스홀더와 배너로 드러냅니다. 텍스처 26건은 5개 맵 전부 수집됨.
- 페이지는 API route 를 fetch 하지 않고 같은 인메모리 인덱스 함수를 서버 컴포넌트에서
  직접 호출합니다(자기 자신에게 HTTP 를 치지 않기 위해). API route 는 같은 함수를 노출합니다.

## 스택

Next.js 15.5.28 / React 19.2.9 / TypeScript 5.9.3 / three 0.186.1.
의존성은 전부 정확한 버전으로 고정되어 있습니다. Tailwind·컴포넌트 라이브러리 없음 —
`src/app/globals.css` 한 장과 평범한 클래스 이름만 씁니다.
