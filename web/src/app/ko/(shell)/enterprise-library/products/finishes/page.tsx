import Link from "next/link";
import CategoryTree, { type TreeNodeData } from "@/components/CategoryTree";
import { FilterBar, ResultBar } from "@/components/LibraryControls";
import MapsLibrary, { type MapItem } from "@/components/MapsLibrary";
import Pagination from "@/components/Pagination";
import { finishCategoryPath, getFinishData, listFinishes } from "@/lib/finishes";
import { PAGE_SIZES, type CategoryNode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "마감재 | 기업 라이브러리" };

const BASE = "/ko/enterprise-library/products/finishes";

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildTree(map: Map<string, CategoryNode>, id: string, guard = 0): TreeNodeData | null {
  const node = map.get(id);
  if (!node || guard > 32) return null;
  return {
    id: node.id,
    name: node.name,
    productCount: node.productCount,
    descendantProductCount: node.descendantProductCount,
    children: node.childIds
      .map((childId) => buildTree(map, childId, guard + 1))
      .filter((child): child is TreeNodeData => Boolean(child)),
  };
}

export default async function FinishesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const data = getFinishData();

  if (data.finishes.length === 0) {
    return (
      <>
        <h1 className="page-title">
          마감재
          <span className="page-title__help">?</span>
        </h1>
        <div className="notice">
          데이터 미수집 — <span className="mono">data/finishes-textures.json</span> 을 찾지 못했습니다.
        </div>
      </>
    );
  }

  const categoryId = one(params, "category") ?? data.finishRootId;
  const selected = data.finishCategories.get(categoryId) ?? data.finishCategories.get(data.finishRootId)!;
  const keyword = (one(params, "keyword") ?? "").trim();

  const limitParam = Number.parseInt(one(params, "limit") ?? "30", 10);
  const limit = (PAGE_SIZES as readonly number[]).includes(limitParam) ? limitParam : 30;
  // URL is 1-based, the list API underneath is 0-based (as in the original).
  const uiPage = Math.max(Number.parseInt(one(params, "page") ?? "1", 10) || 1, 1);

  const result = listFinishes({
    page: uiPage - 1,
    size: limit,
    categoryId: selected.id === data.finishRootId ? null : selected.id,
    keyword: keyword || undefined,
    includeDescendants: true,
  });

  const children = selected.childIds
    .map((childId) => data.finishCategories.get(childId))
    .filter((child): child is CategoryNode => Boolean(child));
  const breadcrumb = finishCategoryPath(selected.id);
  const tree = buildTree(data.finishCategories, data.finishRootId)!;

  // A finish either carries a PBR set (albedo present) or only original/preview.
  // Within the PBR group the CDN 403s some objects, so count both honestly.
  const PBR_KEYS = ["albedo", "normal", "roughness", "metalness"] as const;
  const hasPbr = (finish: (typeof data.finishes)[number]) => !finish.missingMaps.includes("albedo");
  const pbrGroup = data.finishes.filter(hasPbr);
  const presentCount = (key: string) => pbrGroup.filter((f) => !f.missingMaps.includes(key)).length;

  const items: MapItem[] = result.data.map((finish) => ({
    id: finish.id,
    name: finish.name,
    thumbnail: finish.thumbnail,
    thumbnailFallback: finish.thumbnailFallback,
    subtitle: finish.code ? `코드 ${finish.code}` : finish.id,
    badge: hasPbr(finish)
      ? `PBR ${PBR_KEYS.filter((key) => !finish.missingMaps.includes(key)).length}/4`
      : "원본/미리보기",
    missingNote: hasPbr(finish)
      ? finish.missingMaps.length > 0
        ? `누락된 맵: ${finish.missingMaps.join(", ")} — 원본 CDN이 해당 오브젝트에 403을 반환합니다.`
        : null
      : "이 마감재에는 PBR 맵 세트가 없습니다 (원본도 original/preview 뿐).",
    maps: finish.maps,
    missingMaps: finish.missingMaps,
    meta: [
      ["마감재 ID", finish.id],
      ["SKU / 코드", [finish.sku, finish.code].filter(Boolean).join(" / ") || "-"],
      [
        "매핑 크기",
        finish.mappingDimension
          ? `${finish.mappingDimension.width} × ${finish.mappingDimension.height} ${finish.mappingDimension.unit}`
          : "-",
      ],
      [
        "렌더 설정",
        finish.renderSettings
          ? `glossy ${finish.renderSettings.glossy} / bumpy ${finish.renderSettings.bumpy}`
          : "-",
      ],
      ["에디터 노출", finish.showInEditor ? "노출" : "비노출"],
    ],
  }));

  const queryForPagination: Record<string, string> = {};
  if (selected.id !== data.finishRootId) queryForPagination.category = selected.id;
  if (keyword) queryForPagination.keyword = keyword;
  if (limit !== 30) queryForPagination.limit = String(limit);

  return (
    <>
      <h1 className="page-title">
        마감재
        <span className="page-title__help">?</span>
      </h1>

      <FilterBar basePath={BASE} sortOptions={false} />

      <div style={{ height: 14 }} />

      <div className="library">
        <CategoryTree
          root={tree}
          selectedId={selected.id}
          expandedIds={breadcrumb.map((node) => node.id)}
          basePath={BASE}
          title="마감재 카테고리"
        />

        <div className="library__body">
          <section className="detailpanel">
            <div className="detailpanel__head">
              <span className="detailpanel__title">상세 정보</span>
              <span className="detailpanel__actions">
                <button className="btn btn--sm btn--disabled" type="button">
                  엑셀 추출하기
                </button>
                <button className="btn btn--sm btn--disabled" type="button">
                  이름 수정
                </button>
              </span>
            </div>
            <dl className="kv">
              <dt>이름</dt>
              <dd>{selected.name}</dd>
              <dt>경로</dt>
              <dd>
                <nav className="breadcrumb">
                  {breadcrumb.map((node, position) => (
                    <span key={node.id} style={{ display: "contents" }}>
                      {position > 0 && <span className="breadcrumb__sep">/</span>}
                      <Link
                        href={node.id === data.finishRootId ? BASE : `${BASE}?category=${node.id}`}
                        className={node.id === selected.id ? "" : "muted"}
                      >
                        {node.name}
                      </Link>
                    </span>
                  ))}
                </nav>
              </dd>
              <dt>카테고리 ID</dt>
              <dd className="mono">{selected.id}</dd>
            </dl>
          </section>

          <div className="badge-warn">
            original / preview 는 {data.finishes.length}개 모두 수집됨. PBR 맵 세트를 가진 것은{" "}
            {pbrGroup.length}개이고 그중 normal {presentCount("normal")}/{pbrGroup.length}, roughness{" "}
            {presentCount("roughness")}/{pbrGroup.length}, metalness {presentCount("metalness")}/
            {pbrGroup.length} 만 받아졌습니다 (나머지는 원본 CDN이 403). 나머지{" "}
            {data.finishes.length - pbrGroup.length}개는 애초에 PBR 맵이 없습니다.
          </div>

          <ResultBar
            categoryCount={children.length}
            productCount={result.totalCount}
            limit={limit}
            showSort={false}
            countLabel={`${children.length} 카테고리(들) ${result.totalCount.toLocaleString(
              "ko-KR",
            )}개의 마감재`}
          />

          {children.length > 0 && (
            <div className="grid">
              {children.map((child) => (
                <Link key={child.id} href={`${BASE}?category=${child.id}`} className="foldercard">
                  <span className="foldercard__icon" aria-hidden>
                    📁
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="foldercard__name" style={{ display: "block" }}>
                      {child.name}
                    </span>
                    <span className="foldercard__meta">
                      {child.descendantProductCount.toLocaleString("ko-KR")}개
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}

          {items.length === 0 ? (
            <div className="notice">이 카테고리에는 마감재가 없습니다.</div>
          ) : (
            <MapsLibrary items={items} />
          )}

          <Pagination
            basePath={BASE}
            query={queryForPagination}
            page={uiPage}
            totalPage={result.totalPages}
          />
        </div>
      </div>
    </>
  );
}
