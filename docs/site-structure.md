# fnf.archisketch.com 구조 분석

REA(`capture_browser_scenario` + 번들 JS 정적 분석)로 2026-10-20 에 뜬 내용.
계정 `fnf@archisketch.com` (role 3, `ENTERPRISE_PRO_PLAN`), 기업 ID `ZtDxN1y583722F9F0E74FA2`.

클론(`web/`)은 이 문서를 스펙으로 삼는다.

---

## 1. 호스트 구성

| 호스트 | 역할 |
|---|---|
| `fnf.archisketch.com` | 대시보드 셸. **Next.js App Router + Turbopack**, 경로가 `/{locale}/...` 로 시작 |
| `libs.archisketch.com` | 정적 번들 `/dashboard/prod/{buildSha}/_next/static/chunks/*.js`, 폰트(Pretendard), i18n `/translations/dashboard/prod/{ko,en}.json` |
| `api.archisketch.com` | REST API (여러 서비스가 경로 프리픽스로 갈림) |
| `resources.archisketch.com` | 3D 에셋·텍스처 CDN. **객체 단위 공개**, 디렉터리 리스팅은 403 |
| `i.archisketch.com` | 이미지 리사이즈 CDN. `?f=webp&w=512` 쿼리로 변환 |

서드파티: GTM, GA, Meta Pixel, MS Clarity, Datadog RUM, Channel.io, Stripe, Naver Maps.
→ **클론에서는 전부 뺀다.**

## 2. 인증

```
POST https://api.archisketch.com/login
     {"email": "...", "password": "..."}
  → { user: {...}, token: <JWT>, refreshToken: <JWT> }
```

이후 모든 호출에 **`Authorization: Bearer <token>`**.
소문자 `Authorization: <token>`, `x-access-token`, `token` 헤더는 전부 401.

브라우저 쪽 저장:

| 저장소 | 키 | 비고 |
|---|---|---|
| localStorage | `token` | `enterprise-token` 쿠키와 값이 같다 |
| cookie (`.archisketch.com`) | `enterprise-token`, `refresh-token`, `last-origin`, `locale` | |
| localStorage | `persist:root` | redux-persist |

미인증 상태로 보호 경로에 가면 **307** → `/{locale}/auth/sign-in?redirect_url=<원래 경로>`.
로그인 직후 1회 `/{locale}/tutorial-setting` 로 보낸 뒤 홈으로 간다.

### 로그인 화면 구성
`img auth-logo` · 언어 토글 · `h1 로그인` · 텍스트박스 `* 이메일` / `* 비밀번호`(+Show 토글) ·
체크박스 `아이디 기억하기` · 버튼 `로그인` · 링크 `회원가입`(`/ko/auth/sign-up`) ·
`비밀번호 찾기`(`/ko/auth/reset-password`) · 구분선 `SNS로 시작하기` + 구글/네이버/카카오 버튼 ·
`ⓒ 2026. Archisketch Inc. All rights reserved.`

## 3. 라우트 맵

번들에서 통째로 뽑은 원본(모든 경로 앞에 `/{locale}` 이 붙는다):

```js
projects:            /projects/{team,my,shared,bookmarked,settings,ai-styler-gallery,write-portfolio}
                     /projects/{projectId}
home-page:           /home-page
personal-library:    /personal-library/{model,ai-furniture}
enterprise-library:  /enterprise-library/products/{furniture,finishes,texture-library}
                     /enterprise-library/part/{sale,parameter,component,modeling}
                     /enterprise-library/{brand-manager,advanced-settings,custom-field,product-tag}
                     /enterprise-library/file , /enterprise-library/file/upload
templates:           /templates/{list,manage,tags}
settings:            /settings/{partners,connection,customize}
invoice:             /invoice , /invoice/management
기타:                /floorplan /product-order /render-studio /announcements
                     /account-management /data-analytics /agent /avo /ai-swap /chat
                     /v3/order /v3/order/all /v3/customers
제품 상세:            /sales/{productId}
```

## 4. 사이드바 (번들의 메뉴 정의 그대로)

`roleKey` 로 권한 필터가 걸린다 (`/auth/v1/authorizations/users/me/resources` 응답과 대조).

| 그룹 | key | i18n label | roleKey | 경로 |
|---|---|---|---|---|
| — | homePage | getStart | page/HOME_PAGE | /home-page |
| — | Agent | Archisketch AI | — | /agent |
| — | Avo | aiFinishing | page/AVO | /avo |
| 프로젝트 | myProjects | myProjects | — | *(서브메뉴)* |
| | myProjects | projects | — | /projects/my |
| | sharedProjects | sharedProjects | — | /projects/shared |
| | teamProjects | teamProjects | page/PROJECTS_TEAM | /projects/team |
| | aiStylerGallery | aiStylerGallery | — | /projects/ai-styler-gallery |
| 견적/상담 | Consultation | consultationV3 | page/ORDER_V3 | /v3/order |
| | ConsultationAll | allConsultations | page/ORDER_V3_ALL | /v3/order/all |
| | CustomerList | customerList | — | /v3/customers |
| | chat | chat | page/CHAT | /chat |
| 라이브러리 | personalLibrary | personalLibrary | page/PERSONAL_LIBRARY_FURNITURE | /personal-library/model |
| | **Enterprise Library** | enterpriseLibrary | page/ENTERPRISE_LIBRARY | *(서브메뉴)* |
| | **furniture** | **furnitureLibrary** | page/ENTERPRISE_LIBRARY | **/enterprise-library/products/furniture** |
| | finishes | finishLibrary | page/ENTERPRISE_LIBRARY | /enterprise-library/products/finishes |
| | textureLibrary | textureLibrary | page/ENTERPRISE_LIBRARY | /enterprise-library/products/texture-library |
| | Enterprise Library - Part | customFurnitureLibrary | page/SALE_LIBRARY | *(서브메뉴)* |
| | sale / component / modeling / parameter | productLibrary / componentLibrary / modelingLibrary / parameterLibrary | page/SALE_LIBRARY 등 | /enterprise-library/part/* |
| | advancedSettings | advancedLibrarySettings | page/ENTERPRISE_ADVANCED_SETTINGS | /enterprise-library/advanced-settings |
| 인테리어 템플릿 | templateList / manageTemplates / templateTags | | | /templates/* |
| 도면 관리 | floorplanManagement | | page/FLOORPLAN_MANAGEMENT | /floorplan |
| 운영 관리 | accountManagement | | page/ACCOUNT_MANAGEMENT | /account-management |
| 지원 서비스 | 3dModelingService | | page/MODELING_SERVICE | /product-order |
| | renderStudio | | page/RENDER_STUDIO | /render-studio |
| 설정 | settings → customizations | | page/CUSTOMIZE | /settings/customize |

헤더 우측: `크레딧 5.6` · 언어 토글 · 채팅/알림 아이콘(배지 26) · 아바타 + `에프앤에프 / fnf@archisketch.com`.

> 사이드바 항목은 `<a href>` 가 아니라 `<button>` + `router.push` 다. DOM 에 링크가 없고,
> 첫 로그인 온보딩 오버레이가 포인터를 먹어서 **클릭 재생이 타임아웃난다.** 분석도 클론 E2E 도
> URL 로 직접 이동하는 편이 안전하다.

## 5. 셸 공통 부트스트랩 호출

어느 페이지를 열어도 먼저 이 순서로 돈다. 클론도 같은 모양의 엔드포인트를 둔다.

```
GET /v1/public/enterprise/url/{slug}            # 로그인 전, 테넌트 브랜딩
GET /auth/v1/authorizations/users/me/resources  # roleKey 권한 목록
GET /v1/enterprise/{eid}
GET /v1/public/enterprise/{eid}
GET /v1/user/me
GET /v1/notification/uncheck-count
GET /v1/external/channels?enterpriseId={eid}
GET /v1/connect/plugins/me/active
GET /v1/subscription-quotas
GET /v1/subscription-quotas/plans/ENTERPRISE_PRO_PLAN
GET /payment/v1/credit/balance
```

## 6. 기업 라이브러리 3종 — 데이터 소스

카테고리는 셋 다 같은 서비스를 타고 `type` 만 다르다.

```
GET /v2/categories/root/{eid}/{FURNITURE|FINISH|TEXTURE}
GET /v2/categories/root/{eid}/{type}/partners
GET /v2/categories/type/{type}/allowed
GET /v2/categories/{categoryId}          # childDirectoryIds 로 재귀하면 전체 트리
GET /v2/categories/path/{categoryId}     # breadcrumb
```

| 라이브러리 | 목록 API | 루트 카테고리 | 규모 |
|---|---|---|---|
| **가구** | `GET /search/sale/v2?page=&limit=&sort=UPDATED_DESC&enterpriseIds={eid}[&categoryIds=][&parametricFilter=NON_PARAMETRIC]` | `ZtDxN2vF95C5BA5F88B48D5` | 카테고리 300, 제품 **1,745**, 컴포넌트 1,747 |
| 마감재 | `GET /finishes/v1?enterpriseId={eid}&categoryId=&page=&size=&sort=updatedAt,desc[&name=&code=&sku=]` | `ZtDxN_77FEE9A378CEC4872` | **51** |
| 텍스처 | `GET /v1/materials/{eid}/byCategories?categories={ids}&page=&size=&sort=updatedAt,desc&keyword=` | `ZtDxOBQC44338BBECB34356` (etc/Paint/Metal/Wood/Floor/Wall/Stone) | |

제품 상세:
```
GET /product/v1/sales/{productId}/detail?includeStat=true
GET /product/v2/components/{componentId}/bom/flat?depth=1
GET /v1/brand/{eid}?sortBy=nameAsc
```

### 페이징 응답 형태 차이 (클론에서 맞춰야 함)

```jsonc
// /search/sale/v2
{ "result": { "data": [...], "meta": { "page", "count", "totalPage", "totalCount" } } }

// /finishes/v1, /v1/materials/.../byCategories
{ "data": [...], "page", "size", "count", "totalCount", "totalPages" }
```

> `/finishes/v1` 는 화면이 뜰 때 `page=NaN` 으로 한 번 더 쏜다(원본 버그). 흉내 낼 필요 없다.

## 7. 가구 라이브러리 화면

`/ko/enterprise-library/products/furniture?page=1[&category={id}]`

- 헤더 `가구` + 도움말 `?`
- 필터 바: 정렬 기준 콤보 / 검색어 / `search` / `필터 초기화` / **`업로드`**
- 좌측 **폴더 트리** (`새로운 카테고리` 버튼, 항목마다 `more` 메뉴) — 사진의 그 트리
- 우측 상단 **상세 정보** 패널: `엑셀 추출하기` · `이름 수정` · `에디터 비노출` · `하위 카테고리 생성`,
  표에 `이름`(+에디터 노출 여부) / `경로`(breadcrumb 링크)
- `N 카테고리(들) M개의 제품` · 카테고리 내 검색 · 정렬(`수정 최신순`)
- 카드 그리드: 하위 카테고리 카드(폴더 아이콘 + 이름 + 수정일) → 제품 카드
  (`Options: n | Items: m`, 체크박스, `ellipsis` 메뉴, 썸네일, 이름) → `/ko/sales/{productId}` 로 링크
- 하단 페이지네이션 + `30 / page`

## 8. 제품 상세 화면 `/ko/sales/{productId}`

- `h4 {제품명}`
- **상품 정보**: `picture` · **`download`** · `수정`
  표 = 상품명(+언어별) / 브랜드 / 제품 구매 링크 / 태그 / 상품 코드 / 상품 통화 / 최신 판매량 / 생성일 / 수정일
- **카테고리(들)**: 소속 카테고리마다 breadcrumb (한 제품이 여러 경로에 걸린다)
- **제품 정보**: 이미지 썸네일 스트립 + `download` · **`3D 모델링 확인하기`** · `3D 모델링 변경` ·
  `공유/임베드` · `컴포넌트 ID 복사` · `수정`, 표 = 부품 이름 / 부품 코드 / …

> **중요:** `download` 버튼의 i18n 키는 `downloadrepresentativeImage`("대표 이미지 다운로드") 와
> `downloadThumb`("썸네일 다운로드") 다. **UI 로는 3D 모델을 받을 수 없다.**
> 모델 URL 은 아래 상세 API 응답 안에만 있다.

## 9. 3D 에셋 — 실제 파일이 있는 곳

`/product/v1/sales/{id}/detail` 응답:

```jsonc
componentDetails[].component.arAsset.android.url  // …/RENDER/{ts}/{mid}.glb   ← 이게 핵심
componentDetails[].component.arAsset.ios.url      // …/RENDER/{ts}/{mid}.usdz
componentDetails[].component.dxfAsset             // 대개 null
componentDetails[].modeling.editorAsset.url       // …/EDITOR/{ts}/{mid}.gltf  (KTX2 계열)
componentDetails[].modeling.renderAsset.url       // …/RENDER/{ts}/{mid}.gltf
componentDetails[].modeling.decimateAsset.url     // …/DECIMATE/…  → CDN 403
componentDetails[].modeling.images[]              // …/IMAGE/{ts}/{mid}_0..5.png
```

**URL 조립 지름길** — 목록 응답의 `components.records[].previewImage` 가
`…/modelings/{mid}/IMAGE/{ts}/{mid}_1.png` 라서 같은 `{mid}/{ts}` 로
`…/modelings/{mid}/RENDER/{ts}/{mid}.glb` 를 만들 수 있다. 상세 API 1,745회가 필요 없다.

경로 스킴이 두 가지다:

| 스킴 | 예 | 수 |
|---|---|---|
| 신 `modelings/{mid}/{KIND}/{ts}/{mid}.{ext}` | `/modelings/38e4…/RENDER/1784534845378/38e4….glb` | 1,577 |
| 구 `product/{pid}/{dd-mm-yyyy_hh-mm-ss}/{Render\|3d\|decimated}/{pid}.{ext}` | `/product/ZtJEzVE…/23-12-2025_02-40-42/Render/ZtJEzVE….glb` | 149 |
| 모델 없음 (렌더링 FAILED 20 / PROCESSING 1) | | 21 |

**CDN 은 토큰 없이 200.**

### `.glb` vs `.gltf` — 같은 모델이 아니다 (전수 검사 결과)

| | `.glb` (arAsset.android) | `.gltf` (modeling.renderAsset) |
|---|---|---|
| 자체 포함 | **예.** 텍스처가 bufferView 에 들어 있다 | **아니오.** `.bin` + 개별 `.png` 를 외부 참조 (표본 200/200) |
| 단독 사용 | 바로 열린다 | 사이드카 없으면 **안 열린다** |
| 크기 | 평균 ~6 MB (같은 모델 4.1 MB) | 45 KB (껍데기) |
| **단위** | **미터** — API `dimensionMm` ÷ 1000 과 6/6 일치 | **밀리미터** — 1000배 크게 들어온다 |
| 확장 | `KHR_materials_emissive_strength`(163/400), `KHR_texture_transform`(23/400), 없음(229/400) | |

> **`.glb` 를 쓴다.** `.gltf` 는 `scripts/download_gltf_sidecars.py` 로 사이드카를 마저 받아야
> 열리고, 열어도 단위가 mm 라 1/1000 스케일을 줘야 한다.

> **Draco 아니다.** 처음 조사 때 표본 하나의 `.gltf` 가 `KHR_draco_mesh_compression` 을 쓰길래
> 전부 Draco 인 줄 알았으나, GLB 400개를 다시 보니 **Draco 를 쓰는 건 0개**다.
> 평범한 `GLTFLoader` 로 열린다.

생성기는 두 가지가 섞여 있다 — `Khronos glTF Blender I/O v4.1.63` (481) / `v5.2.40` (180).
머티리얼명은 보존돼 있다: `[Steel Brushed Stainless]`, `Aluminium Satin Black`, `Emissive1`, `[Mirror 01]`, `[Color M08]`.
전체 용량은 처음 어림한 5~6 GB 보다 크다 — 600개 시점에 이미 3.6 GB 라 **약 10 GB** 로 간다.

마감재는 PBR 맵이 따로 들어 있다:
`textureImages.{original,preview,albedo,normal,roughness,metalness,height,emissive,paintColor}`.

## 10. 레이트 리밋 / 함정

- 목록 API 는 **429 Too Many Requests** 가 난다. 페이지 간 1.5 s, 상세 1.1 s + 지수 백오프로 통과.
- CDN 은 제한이 느슨하다 (37개 연속 420 MB 무사).
- API 가 돌려주는 한글이 **NFD(자모 분리)** 일 때가 있다. 파일명·비교 전에 `NFC` 정규화 필수.
- 카테고리 이름에 `/` 가 들어간다(`BAG/ACC`). 경로로 쓸 때 한 단계 더 중첩된다.
- 한 제품이 **여러 카테고리**에 속한다. 폴더 저장은 첫 번째(또는 필터에 맞는) 경로 하나만 쓴다.
- `api.archisketch.com/openapi/docs/api` 는 세션 JWT 로 **401**. Open API 키(`/auth/api/v1/open-api/keys`,
  화면은 `설정 › 연동`)가 별도 스킴이다. 장기 연동은 이쪽이 정식 경로다.

## 11. 클론 범위

`web/` 에서 만드는 것 (로컬 데이터 전용, 원본 API 는 호출하지 않는다):

| 화면 | 경로 | 상태 |
|---|---|---|
| 로그인 | `/ko/auth/sign-in` | 폼 UI 재현, 로컬 더미 세션 |
| 홈 | `/ko/home-page` | 셸 + 통계 카드 |
| **가구 라이브러리** | `/ko/enterprise-library/products/furniture` | **완전 동작** — 트리/검색/정렬/페이징/카드 |
| **제품 상세** | `/ko/sales/{id}` | **완전 동작** — 정보/카테고리/이미지/3D 뷰어 |
| 마감재 | `/ko/enterprise-library/products/finishes` | 목록 (51건) |
| 텍스처 | `/ko/enterprise-library/products/texture-library` | 목록 |
| 그 외 메뉴 | | 사이드바에 보이되 "준비 중" |

원본과 다르게 가는 점: 추적 스크립트 없음 · 인증은 로컬 더미 · 3D 뷰어는 원본에 없는 기능이지만
로컬 glb 를 확인하려면 필요하므로 넣는다 · `download` 는 이미지뿐 아니라 **glb/gltf 도** 내려준다.
