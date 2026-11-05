"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PAGE_SIZES, SORT_KEYS, SORT_LABELS } from "@/lib/types";

function useNavigate() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  return (patch: Record<string, string | null>, resetPage = true) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    if (resetPage) params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };
}

/** Top filter bar: 정렬 기준 / 검색어 / search / 필터 초기화 / 업로드 (spec section 7). */
export function FilterBar({ basePath, sortOptions }: { basePath: string; sortOptions?: boolean }) {
  const searchParams = useSearchParams();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState(searchParams?.get("keyword") ?? "");
  const sort = searchParams?.get("sort") ?? "UPDATED_DESC";

  useEffect(() => {
    setKeyword(searchParams?.get("keyword") ?? "");
  }, [searchParams]);

  return (
    <form
      className="filterbar"
      onSubmit={(event) => {
        event.preventDefault();
        navigate({ keyword: keyword.trim() || null });
      }}
    >
      {sortOptions !== false && (
        <>
          <label className="muted" htmlFor="sort">
            정렬 기준
          </label>
          <select
            id="sort"
            className="input"
            value={sort}
            onChange={(event) => navigate({ sort: event.target.value })}
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </>
      )}
      <input
        className="input"
        style={{ minWidth: 220 }}
        placeholder="검색어"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />
      <button type="submit" className="btn">
        search
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setKeyword("");
          window.location.href = basePath;
        }}
      >
        필터 초기화
      </button>
      <span className="filterbar__spacer" />
      <button type="button" className="btn btn--primary btn--disabled" title="클론에서는 동작하지 않습니다">
        업로드
      </button>
    </form>
  );
}

/** `N 카테고리(들) M개의 제품` row: in-category search + sort + page size. */
export function ResultBar({
  categoryCount,
  productCount,
  limit,
  countLabel,
  showSort = true,
}: {
  categoryCount: number;
  productCount: number;
  limit: number;
  countLabel?: string;
  showSort?: boolean;
}) {
  const searchParams = useSearchParams();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState(searchParams?.get("keyword") ?? "");
  const sort = searchParams?.get("sort") ?? "UPDATED_DESC";

  useEffect(() => {
    setKeyword(searchParams?.get("keyword") ?? "");
  }, [searchParams]);

  return (
    <div className="resultbar">
      <span className="resultbar__count">
        {countLabel ??
          `${categoryCount.toLocaleString("ko-KR")} 카테고리(들) ${productCount.toLocaleString(
            "ko-KR",
          )}개의 제품`}
      </span>
      <span className="filterbar__spacer" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ keyword: keyword.trim() || null });
        }}
        style={{ display: "flex", gap: 6 }}
      >
        <input
          className="input"
          placeholder="카테고리 내 검색"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <button type="submit" className="btn btn--sm">
          검색
        </button>
      </form>
      {showSort && (
        <select
          className="input"
          value={sort}
          onChange={(event) => navigate({ sort: event.target.value })}
          aria-label="정렬"
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      )}
      <select
        className="input"
        value={String(limit)}
        onChange={(event) => navigate({ limit: event.target.value })}
        aria-label="페이지당 개수"
      >
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size} / page
          </option>
        ))}
      </select>
    </div>
  );
}
