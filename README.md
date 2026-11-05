# fnf_3dsketch

`fnf.archisketch.com`(F&F 테넌트)의 **기업 라이브러리를 로컬로 복제**한 것.
사이트 UI 클론 + 3D 에셋 전량 사본.

```
fnf_3dsketch/
├─ docs/
│  └─ site-structure.md      # 원본 사이트 구조 분석 (REA). 클론의 스펙
├─ data/
│  ├─ categories.json              # 가구 카테고리 트리 300개 (경로·제품수 포함)
│  ├─ catalog.json                 # 제품 1,745 / 컴포넌트 1,747 + 에셋 URL + 로컬 경로
│  ├─ finishes-textures.json       # 마감재 51 + 텍스처 머티리얼 26 (PBR 맵 경로 포함)
│  ├─ furniture-manifest.csv       # 가구를 표 형식으로 (엑셀로 보기용)
│  ├─ download-report.json         # 가구 다운로드 결과 (성공/실패/해시)
│  ├─ finishes-textures-report.json
│  └─ *.raw.json                   # API 원본 응답
├─ assets/                   # 내려받은 에셋. 폴더 = 원본 카테고리 트리
│  ├─ F&F/국내-[MLB 성수점]/SHOES/왼쪽 가구_신발 진열장__ZtEs0Iv3.glb
│  ├─ __마감재/F&F/…/<이름>__<id8>/{original,preview,albedo,normal,roughness,metalness}.png
│  └─ __텍스처/F&F/{Wood,Metal,Stone,Paint,Wall,Floor,etc}/…/{color,normal,roughness,metal,preview}Image.png
├─ scripts/
│  ├─ build_catalog.py             # raw → categories.json / catalog.json
│  ├─ build_finishes_textures.py   # raw → finishes-textures.json
│  ├─ download_assets.py           # 가구 glb/gltf/png 일괄 다운로드 (재개 가능)
│  ├─ download_finishes_textures.py
│  └─ finalize_tree.py             # 폴더명을 원본 사이드바와 맞춤 (아래 참고)
└─ web/                      # Next.js 클론 (프론트 + API Route Handlers)
```

## 빠르게 보기

```bash
cd web
npm install
npm run dev        # http://localhost:3939
```

## 다시 받기 / 이어받기

전부 재개 가능하고 멱등하다. 이미 있는 파일은 건너뛴다.

```bash
python scripts/download_assets.py            # 가구 glb/gltf/png
python scripts/download_assets.py --proxy    # CDN 이 막을 때만 (Oxylabs, .env 사용)
python scripts/download_gltf_sidecars.py     # gltf 의 외부 .bin / 텍스처
python scripts/download_finishes_textures.py # 마감재 · 텍스처 맵
python scripts/finalize_tree.py              # 폴더명을 원본 사이드바와 맞춤
python scripts/verify_assets.py --blender 20 # 전수 구조 검사 + 임포트 표본
```

프록시는 끝내 필요 없었다 — 1,726개를 연속으로 받는 동안 CDN 레이트리밋이 한 번도 걸리지
않았다. 막히는 건 목록 API(`/search/sale/v2` 등) 쪽이고 그건 백오프로 처리한다.

### `.glb` 를 써라

`.gltf` 는 외부 참조라 사이드카(`.bin` + 텍스처)가 있어야 열리고, 열어도 **단위가 mm** 다
(glb 는 m). 사이드카는 받아뒀으므로 지금은 둘 다 열리지만, 용량(사이드카만 4.5 GB)과
스케일 때문에 실작업은 `.glb` 가 맞다.

## 데이터 출처

| | |
|---|---|
| 제품 / 컴포넌트 | 1,745 / 1,747 |
| 3D 모델 보유 | **1,726 / 1,726 받음 (실패 0)**. 나머지 21은 원본이 FAILED 20 · PROCESSING 1 |
| 카테고리 | 300 + 가상 노드 `미분류 제품들` |
| 포맷 | `.glb` glTF 2.0, 텍스처 내장, **미터 단위**. Draco 아님 |
| 원본 제작 | Blender glTF I/O `v4.1.63`(1,468) · `v5.2.40`(254) · `v1.7.33`(3) · `v1.1.23`(1) |
| 검증 | 구조 **1,726/1,726** 정상, Blender 헤드리스 임포트 표본 **20/20** 성공 |
| 삼각형 | 합계 4,034만. 중앙값 2,540 / 평균 23,371 / 최대 119만 (20만 초과 43개) |
| 마감재 | 51건 / 맵 138장 (84 MB). 12건은 normal·roughness·metalness 일부가 CDN 403 |
| 텍스처 머티리얼 | 26건 / 맵 130장 (58 MB). color·normal·roughness·metal·preview 전부 |
| **총 용량** | **13.95 GB / 14,430 파일** — glb 8.75 GB, gltf 본체 0.18 GB + 사이드카 4.5 GB, png/jpg 나머지 |

수집 경위와 API 구조는 `docs/site-structure.md`, 작업 기록은 `docs/2026-10-20.md`.

## 3D 매장

프로젝트 도면을 three.js 매장으로 조립하고 준공도면을 겹쳐 검증하고 VMD 상품을 끌어다 놓는다 —
프로젝트 상세 `/ko/projects/{id}` 의 `3D 매장 보기` 탭(카메라는 렌더 시점에 고정, 상품만 움직임). 준공도면은 `도면` 탭. 방법은 `docs/store-assembly.md`, 순서는 `.claude/skills/store-assembly/SKILL.md`.

## 폴더 이름이 원본과 다른 두 곳

Windows 파일명 제약 때문이다. `scripts/finalize_tree.py` 가 다운로드 후 맞춰준다.

- 원본 `*가구` `*조명` `*소품` `*로고` `*구조물` → `*` 가 금지 문자라 받을 때는 `_가구` …
  `finalize_tree.py` 가 전각 별표 `＊가구` 로 바꾼다 (`--ascii` 주면 `_` 유지).
- 사이드바의 `미분류 제품들` 은 실제 카테고리가 아니라 **categoryIds 가 빈 제품 126개**를
  모아 보여주는 가상 노드다. 받을 때는 `_미분류` 로 떨어지고, 같은 스크립트가 이름을 맞춘다.
- 카테고리 이름 자체에 `/` 가 든 경우(`BAG/ACC`)는 폴더가 한 단계 더 중첩된다. 원본 그대로다.

## 주의

사내 자산의 로컬 사본이다. 대량 추출·사외 공유가 아키스케치와의 계약상 허용되는지는
별도 확인이 필요하다. 확인 전에는 사내 보관만.
