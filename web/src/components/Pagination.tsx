import Link from "next/link";

/** Server-rendered pagination: every page is a real URL. */
export default function Pagination({
  basePath,
  query,
  page,
  totalPage,
}: {
  basePath: string;
  /** current query params minus `page` */
  query: Record<string, string>;
  page: number;
  totalPage: number;
}) {
  if (totalPage <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams(query);
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  const window = 2;
  const pages: number[] = [];
  for (let p = Math.max(1, page - window); p <= Math.min(totalPage, page + window); p += 1) pages.push(p);
  if (pages[0] !== 1) pages.unshift(1);
  if (pages[pages.length - 1] !== totalPage) pages.push(totalPage);

  return (
    <nav className="pagination" aria-label="페이지">
      <Link
        className={`pagination__btn${page <= 1 ? " pagination__btn--off" : ""}`}
        href={href(Math.max(1, page - 1))}
      >
        ‹
      </Link>
      {pages.map((target, position) => (
        <span key={target} style={{ display: "contents" }}>
          {position > 0 && target - pages[position - 1] > 1 && <span className="faint">…</span>}
          <Link
            className={`pagination__btn${target === page ? " pagination__btn--on" : ""}`}
            href={href(target)}
          >
            {target}
          </Link>
        </span>
      ))}
      <Link
        className={`pagination__btn${page >= totalPage ? " pagination__btn--off" : ""}`}
        href={href(Math.min(totalPage, page + 1))}
      >
        ›
      </Link>
    </nav>
  );
}
