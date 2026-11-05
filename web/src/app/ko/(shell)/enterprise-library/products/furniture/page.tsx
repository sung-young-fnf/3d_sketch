import Link from "next/link";
import CategoryTree, { type TreeNodeData } from "@/components/CategoryTree";
import { FilterBar, ResultBar } from "@/components/LibraryControls";
import Pagination from "@/components/Pagination";
import Thumb from "@/components/Thumb";
import {
  getCategory,
  getCategoryPath,
  getChildren,
  getIndex,
  searchProducts,
} from "@/lib/catalog";
import { thumbnailFor } from "@/lib/serialize";
import { PAGE_SIZES, SORT_KEYS, SORT_LABELS, type SortKey } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "가구 | 기업 라이브러리" };

const BASE = "/ko/enterprise-library/products/furniture";

function buildTree(id: string, guard = 0): TreeNodeData | null {
  const node = getCategory(id);
  if (!node || guard > 32) return null;
  return {
    id: node.id,
    name: node.name,
    productCount: node.productCount,
    descendantProductCount: node.descendantProductCount,
    children: node.childIds
      .map((childId) => buildTree(childId, guard + 1))
      .filter((child): child is TreeNodeData => Boolean(child)),
  };
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function FurnitureLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const index = getIndex();

  const categoryId = one(params, "category") ?? index.rootId;
  const selected = getCategory(categoryId) ?? getCategory(index.rootId)!;
  const keyword = (one(params, "keyword") ?? "").trim();

  const sortParam = (one(params, "sort") ?? "UPDATED_DESC").toUpperCase() as SortKey;
  const sort: SortKey = SORT_KEYS.includes(sortParam) ? sortParam : "UPDATED_DESC";

  const limitParam = Number.parseInt(one(params, "limit") ?? "30", 10);
  const limit = (PAGE_SIZES as readonly number[]).includes(limitParam) ? limitParam : 30;

  // The URL is 1-based (?page=1 is the first page, like the real site) while the
  // search API underneath is 0-based - that mismatch exists in the original too.
  const uiPage = Math.max(Number.parseInt(one(params, "page") ?? "1", 10) || 1, 1);

  // A keyword search widens to the subtree; browsing stays on exact membership
  // (the same rule /api/search/sale/v2 applies via `includeDescendants`).
  const result = searchProducts({
    page: uiPage - 1,
    limit,
    sort,
    categoryIds: [selected.id],
    keyword: keyword || undefined,
    includeDescendants: Boolean(keyword),
  });

  const children = getChildren(selected.id);
  const breadcrumb = getCategoryPath(selected.id);
  const tree = buildTree(index.rootId)!;
  const expandedIds = breadcrumb.map((node) => node.id);

  const queryForPagination: Record<string, string> = {};
  if (selected.id !== index.rootId) queryForPagination.category = selected.id;
  if (keyword) queryForPagination.keyword = keyword;
  if (sort !== "UPDATED_DESC") queryForPagination.sort = sort;
  if (limit !== 30) queryForPagination.limit = String(limit);

  return (
    <>
      <h1 className="page-title">
        가구
        <span className="page-title__help">?</span>
      </h1>

      <FilterBar basePath={BASE} />

      <div style={{ height: 14 }} />

      <div className="library">
        <CategoryTree root={tree} selectedId={selected.id} expandedIds={expandedIds} basePath={BASE} />

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
                <button className="btn btn--sm btn--disabled" type="button">
                  에디터 비노출
                </button>
                <button className="btn btn--sm btn--disabled" type="button">
                  하위 카테고리 생성
                </button>
              </span>
            </div>
            <dl className="kv">
              <dt>이름</dt>
              <dd>
                {selected.name} <span className="chip">에디터 노출</span>
              </dd>
              <dt>경로</dt>
              <dd>
                <nav className="breadcrumb">
                  {breadcrumb.map((node, position) => (
                    <span key={node.id} style={{ display: "contents" }}>
                      {position > 0 && <span className="breadcrumb__sep">/</span>}
                      <Link
                        href={node.id === index.rootId ? BASE : `${BASE}?category=${node.id}`}
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
              <dt>제품 수</dt>
              <dd>
                직접 {selected.productCount.toLocaleString("ko-KR")}개 / 하위 포함{" "}
                {selected.descendantProductCount.toLocaleString("ko-KR")}개
              </dd>
            </dl>
          </section>

          <ResultBar
            categoryCount={children.length}
            productCount={result.meta.totalCount}
            limit={limit}
          />

          {keyword && (
            <div className="muted">
              <strong>{keyword}</strong> 검색 결과 (하위 카테고리 포함) · 정렬 {SORT_LABELS[sort]}
            </div>
          )}

          {children.length === 0 && result.data.length === 0 ? (
            <div className="notice">이 카테고리에는 하위 카테고리도 제품도 없습니다.</div>
          ) : (
            <div className="grid">
              {!keyword &&
                children.map((child) => (
                  <Link key={child.id} href={`${BASE}?category=${child.id}`} className="foldercard">
                    <span className="foldercard__icon" aria-hidden>
                      📁
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="foldercard__name" style={{ display: "block" }} title={child.name}>
                        {child.name}
                      </span>
                      <span className="foldercard__meta">
                        {child.descendantProductCount.toLocaleString("ko-KR")}개 제품
                      </span>
                    </span>
                  </Link>
                ))}

              {result.data.map((product) => {
                const thumb = thumbnailFor(product);
                return (
                  <Link key={product.id} href={`/ko/sales/${product.id}`} className="prodcard">
                    <span className="prodcard__thumbwrap">
                      <Thumb src={thumb.src} fallback={thumb.fallback} alt={product.name} />
                      <span className="prodcard__badges">
                        <span className="prodcard__badge">Options: {product.optionCount}</span>
                        <span className="prodcard__badge">Items: {product.itemCount}</span>
                      </span>
                      <span className="prodcard__check">
                        <input type="checkbox" readOnly aria-label="선택" />
                      </span>
                      <span className="prodcard__ellipsis">⋯</span>
                    </span>
                    <span className="prodcard__body">
                      <span className="prodcard__name" title={product.name}>
                        {product.name}
                      </span>
                      <span className="prodcard__meta">수정 {formatDate(product.updatedAt)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          <Pagination
            basePath={BASE}
            query={queryForPagination}
            page={uiPage}
            totalPage={result.meta.totalPage}
          />
          <div className="faint" style={{ textAlign: "center" }}>
            {result.meta.totalCount.toLocaleString("ko-KR")}개 중{" "}
            {result.meta.count.toLocaleString("ko-KR")}개 표시 · {uiPage} /{" "}
            {result.meta.totalPage} 페이지
          </div>
        </div>
      </div>
    </>
  );
}
