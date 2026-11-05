import Link from "next/link";
import CategoryTree, { type TreeNodeData } from "@/components/CategoryTree";
import { FilterBar, ResultBar } from "@/components/LibraryControls";
import MapsLibrary, { type MapItem } from "@/components/MapsLibrary";
import Pagination from "@/components/Pagination";
import { getFinishData, listMaterials, textureCategoryPath } from "@/lib/finishes";
import { PAGE_SIZES, type CategoryNode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "텍스처 | 기업 라이브러리" };

const BASE = "/ko/enterprise-library/products/texture-library";

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

export default async function TextureLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const data = getFinishData();

  if (data.materials.length === 0) {
    return (
      <>
        <h1 className="page-title">
          텍스처
          <span className="page-title__help">?</span>
        </h1>
        <div className="notice">
          데이터 미수집 — <span className="mono">data/finishes-textures.json</span> 을 찾지 못했습니다.
        </div>
      </>
    );
  }

  const categoryId = one(params, "category") ?? data.textureRootId;
  const selected =
    data.textureCategories.get(categoryId) ?? data.textureCategories.get(data.textureRootId)!;
  const keyword = (one(params, "keyword") ?? "").trim();

  const limitParam = Number.parseInt(one(params, "limit") ?? "30", 10);
  const limit = (PAGE_SIZES as readonly number[]).includes(limitParam) ? limitParam : 30;
  // URL is 1-based, the list API underneath is 0-based (as in the original).
  const uiPage = Math.max(Number.parseInt(one(params, "page") ?? "1", 10) || 1, 1);

  const result = listMaterials({
    page: uiPage - 1,
    size: limit,
    categoryId: selected.id === data.textureRootId ? null : selected.id,
    keyword: keyword || undefined,
    includeDescendants: true,
  });

  const children = selected.childIds
    .map((childId) => data.textureCategories.get(childId))
    .filter((child): child is CategoryNode => Boolean(child));
  const breadcrumb = textureCategoryPath(selected.id);
  const tree = buildTree(data.textureCategories, data.textureRootId)!;

  const items: MapItem[] = result.data.map((material) => {
    const categoryNames = material.categories
      .map((id) => data.textureCategories.get(id)?.name)
      .filter(Boolean)
      .join(", ");
    return {
      id: material.id,
      name: material.name,
      thumbnail: material.thumbnail,
      thumbnailFallback: material.thumbnailFallback,
      subtitle: categoryNames || "-",
      badge: `맵 ${material.maps.length - material.missingMaps.length}/${material.maps.length}`,
      missingNote:
        material.missingMaps.length > 0 ? `누락된 맵: ${material.missingMaps.join(", ")}` : null,
      maps: material.maps,
      missingMaps: material.missingMaps,
      meta: [
        ["텍스처 ID", material.id],
        ["카테고리", categoryNames || "-"],
        ["roughness", material.roughness === null ? "-" : String(material.roughness)],
        [
          "normalScale",
          material.normalScale ? `x ${material.normalScale.x} / y ${material.normalScale.y}` : "-",
        ],
        ["에디터 노출", material.showInEditor ? "노출" : "비노출"],
      ],
    };
  });

  const queryForPagination: Record<string, string> = {};
  if (selected.id !== data.textureRootId) queryForPagination.category = selected.id;
  if (keyword) queryForPagination.keyword = keyword;
  if (limit !== 30) queryForPagination.limit = String(limit);

  return (
    <>
      <h1 className="page-title">
        텍스처
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
          title="텍스처 카테고리"
        />

        <div className="library__body">
          <section className="detailpanel">
            <div className="detailpanel__head">
              <span className="detailpanel__title">상세 정보</span>
              <span className="detailpanel__actions">
                <button className="btn btn--sm btn--disabled" type="button">
                  엑셀 추출하기
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
                        href={node.id === data.textureRootId ? BASE : `${BASE}?category=${node.id}`}
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

          <div className="chip">
            텍스처 26건은 5개 맵(previewImage / colorImage / normalImage / roughnessImage /
            metalImage)이 모두 수집되어 있습니다.
          </div>

          <ResultBar
            categoryCount={children.length}
            productCount={result.totalCount}
            limit={limit}
            showSort={false}
            countLabel={`${children.length} 카테고리(들) ${result.totalCount.toLocaleString(
              "ko-KR",
            )}개의 텍스처`}
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
            <div className="notice">이 카테고리에는 텍스처가 없습니다.</div>
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
