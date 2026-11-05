---
name: store-assembly
description: 아키스케치 프로젝트(매장)를 three.js 3D 매장으로 조립하고 준공도면 PDF를 겹쳐 검증하고 렌더샷 시점에서 VMD 상품을 드래그 앤 드롭으로 배치할 수 있게 만든다. "이 매장 3D로 조립해줘", "준공도면 넣어서 매장 만들어", "렌더샷을 three.js로", "상품 끌어다 놓게", "3D 매장 보기 추가", 새 매장(중국·홍콩·대만 등) 적용 요청에 쓴다. fnf_3dsketch 저장소 전용.
---

# 매장 3D 조립

전체 근거와 함정은 `docs/store-assembly.md` 에 있다. **작업 전에 그 문서를 끝까지 읽는다.** 여기는 순서와 체크만.

## 순서

1. 프로젝트 id 확인: `data/projects.json` 또는 `data/projects/<id>.json`. 없으면
   `python scripts/collect_projects.py --folder <폴더>` (archisketch 호출은 전부 Oxylabs 경유 — `scripts/oxy.py`).
2. 전용 가구: `python scripts/fetch_custom_items.py <id>`
3. 준공도면이 있으면:
   - `tools/pdf2png` 에서 `node titles.mjs <pdf>` 로 평면도 페이지를 찾고 `render.mjs ... 2.0 <pages>` 로
     `assets/__프로젝트/<프로젝트폴더>/drawings/` 에 렌더.
   - 평면도마다 `crop.mjs` 로 외벽 바깥선 픽셀(left/top/right/bottom)을 읽는다. 축척 표기는 믿지 않는다.
   - 평면도의 입구·계단실·사선 벽이 아키스케치 방 다각형 어느 쪽인지 보고 방향을 정한다.
   - `data/drawings/<id>.json` 작성.
4. `python scripts/build_store_scene.py <id>` → `누락` 수 확인.
5. 웹 `/ko/projects/<id>` → `3D 매장 보기` 탭(또는 `/ko/projects/<id>/store`)에서 검증 (dev 서버는 사용자가 띄운다 — 3939 가 이미 떠 있으면 그대로 쓴다):
   - 렌더 시점 3~4개(가로/정사각/세로, 층 섞어서) + `렌더 비교` 오버레이
   - `window.__store.debugTop(true)` 로 위에서 + 준공도면 겹치기 (UI 는 시점 고정이라 버튼 없음)
   - 상품 표시 → 슬롯 번호로 상품 변경, 전체 렌더링 탭에서 회전 확인
   헤드리스 확인은 playwright-core + 설치된 Chrome, `window.__store` 핸들 사용.

## 틀리기 쉬운 것 (문서 §3·§5 요약)

- 배치 기준점 = 모델 바운딩박스 **중심** (라이브러리 glb 원점은 바닥).
- 회전 = 아키스케치 Euler 의 **전치**.
- `localTransform` 금지(그룹 상대값). `position/rotation/scale` 이 월드 값.
- 렌더 카메라: `lightSettings.camera` 의 position(층 기준)+level, quaternion, 세로 fov, **near(카메라 클립)**.
  `floorplanId` 는 floorplan `archiId`. 프레임 비율 = 렌더 해상도.
- 면적 > 1,000 m² 방, 높이 < 10 mm 벽, `(렌더링x)` 아이템은 빼거나 숨긴다.

## 상품

`data/vmd-products.json` 의 `root` (명동: `assets/F&F/국내-명동/[디스커버리 명동]/상품`) 아래에
`<카테고리>/<스타일 폴더>/<스타일코드_컬러>.glb` + 같은 이름 `.png` 를 넣으면 끝 (m 단위 glb). 폴더 = 상품 탭 트리.
카테고리별 걸기/놓기는 같은 파일의 `mount`.

## 교체 슬롯 (렌더에 진열된 상품을 번호로 바꾸기)

`data/vmd-slots/<id>.json` 에 규칙(렌더 번호 · 아이템 이름 · 화면 영역) → 빌드 → 시점에 `L01…` 배지. 자세한 건 문서 §9.
