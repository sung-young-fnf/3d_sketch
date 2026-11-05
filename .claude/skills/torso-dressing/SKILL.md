---
name: torso-dressing
description: 매장연출 토르소(마네킹 상반신)에 상품(패딩 등)을 입힌 3D 착장 에셋을 만든다 — 상품 실제 이미지(dcs-ai 공식 제품컷)를 GPT 이미지로 토르소에 입힌 4면을 만들고, UniForge3D 로 3D 를 만든 뒤 같은 사진으로 다시 칠해 걸이 상품과 색·질감을 맞추고, 토르소 틀에 맞춰 M01 슬롯에서 갈아입힐 수 있게 넣는다. "토르소에 입혀줘", "착장 만들어", "마네킹에 이 패딩", "토르소 옷 바꾸게", 새 상품 착장 추가 요청에 쓴다. fnf_3dsketch 저장소 전용.
---

# 착장 토르소 만들기

규칙(반드시 지킬 것)은 `.claude/rules/torso-dressing.md`, 배경은 `docs/store-assembly.md` §10 마지막 항목.
결과물은 `assets/F&F/국내-명동/[디스커버리 명동]/상품/착장/<품번 스타일명>/<품번>_<컬러>.glb` (+ 같은 이름 .png 썸네일).
패딩 월(01) 슬롯 **M01** 의 상품 변경에 `착장` 카테고리로 뜬다.

## 준비물 (이미 있음)

- 토르소 사진 5면: `assets/.../[디스커버리 명동]/부품/토르소_원본/torso1~5.png` (1 정면, 2 뒷면, 3·4 옆, 5 위)
- 맨 토르소 3D (UniForge3D 원본): 같은 폴더 `torso_uniforge.glb` → `부품/토르소.glb` 는 `build_torso.py` 가 만든다
- 도구: god-tibo-imagen (`C:\Users\Admin\3d-test\god-tibo-imagen`, `--model gpt-6-astra`), UniForge3D MCP
  (`generate_3d`, `paint_texture`, `job_status`), Python: 일반 `Python310`, numpy 필요한 건 `C:\Users\Admin\miniconda3\envs\hunyuan3d\python.exe`

## 순서 (상품 1컬러당 ~15–20분, generate_3d 는 한 번에 1개만 돈다)

1. **상품 실제 이미지 — dcs-ai MCP** (다른 경로·사이트 크롤링 금지)
   - `get_tool_schema(operation_id="get_kr_products_color_images", api_tags="fnf-daisy-api")`
   - `execute_kg_api_to_context` : `default_only=false`,
     `filters={"part_code": ["DXDJ6M066"], "image_cut_code": ["GENERAL","NUKKI"]}` — part_code 는 품번에서
     시즌 접두(`X26F`)를 뗀 것.
   - 컬러별 **image_seq 23 = 정면, 24 = 뒷면** (`.../thnail/*.jpg`, 흰 배경 제품컷). 받아서 눈으로 앞/뒤 확인.
2. **입힌 4면 — GPT 이미지**
   `python scripts/torso_dress_views.py <토르소_원본 폴더> <정면.jpg> <뒷면.jpg> data/torso/<품번>_<컬러>`
   → `front/back/left/right.png`. 정면을 먼저 만들고 나머지 셋에 참고로 넣어 네 장이 맞는다.
   **3D 로 넘기기 전에 4장을 한 장으로 붙여 보고**: 색·로고·후드 모양이 상품컷과 같은지, 손·목·스탠드가 있는지,
   잘린 곳이 없는지. 틀리면 그 장만 다시 만든다.
3. **3D — UniForge3D `generate_3d`**: front_image=front, back_image=back, angle_images=[left, right],
   name=`torso_<품번>_<컬러>`, output_dir=작업 폴더. `job_status` 로 기다린다 (~5분).
4. **다시 칠하기 — `paint_texture`** (빠뜨리면 안 됨): asset_glb=job_id, photo_hanger=**False**, out_dir=작업 폴더.
   generate_3d 자체 텍스처(금속 1, webp)는 새까맣게 달라 보인다. paint_texture 결과는 걸이 상품과 같은
   4K 사진 텍스처 + 거칠기 0.6 / 금속 0. 미리보기 `3d_asset_img/*_q34.png` 확인.
5. **토르소 틀에 맞추기**
   `<hunyuan3d python> scripts/build_torso.py <토르소_원본/torso_uniforge.glb> <painted.glb> "<품번 스타일명>" <품번>_<컬러> [...]`
   (여러 개 한 번에 가능) — 받침 원판을 맞춰 `상품/착장/...` 에 쓴다. 썸네일 .png 는
   paint 미리보기 정면을 512px 흰 배경으로.
   그다음 `python -X utf8 scripts/build_library_local.py` → 기업 라이브러리 `*소품/마네킹` 에도 뜬다
   (id `local-torso-<품번>`, 패딩 쪽 `local-<품번>` 과 겹치지 않게).
6. **확인 — 웹 3939** (`/ko/projects/Z_qVQjfBCDE9007CAF64124` → 매장연출 → 01 패딩 월 → 상품 표시 → M01):
   착장을 고르고, 같은 상품을 아래 가운데 정면(L17)에도 걸어 위아래 색·광택이 같은지 본다. 헤드리스는
   `scratchpad/pw` 의 v23.mjs 패턴(playwright-core + Chrome). 3939 는 사용자가 띄우고 끈다.

## 틀리기 쉬운 것

- 모델 기본값 `gpt-5.4` 는 ChatGPT 계정에서 거부(HTTP 400 model_not_found) → `--model gpt-6-astra`.
- 같은 파일 이름이 패딩·착장 두 카테고리에 있으면 상품 id 가 `패딩/…`, `착장/…` 으로 갈린다(`web/src/lib/scenes.ts`).
  예전처럼 id 가 겹치면 걸이 슬롯에 착장 모델이 뜬다.
- 걸이 상품 glb 를 Blender 로 직접 입히는 `scripts/blender_dress_torso.py` 는 대안일 뿐: 상품 메쉬는 소매·몸통이
  붙어 있어 소매를 굽히면 옆구리가 일그러지고, 곧게 두면 손이 선반 아래로 숨거나 후드가 위 봉에 닿는다.
- 맨 토르소 크기(`TORSO_SCALE` 1.1)를 바꾸면 이미 만든 착장도 전부 build_torso.py 로 다시 맞춘다.

## 만들어 둔 착장 (2026-10-30)

베른 구스다운 BKS · 웰니스 BKS / DWS / SAD · 반슬리 SAD / SIL — 입힌 4면은 `data/torso/<품번>_<컬러>/`.
