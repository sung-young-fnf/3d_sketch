import Link from "next/link";
import Thumb from "@/components/Thumb";
import { getProjectData, listProjects } from "@/lib/projects";

const nf = new Intl.NumberFormat("ko-KR");
const BASE = "/ko/projects/team";

/** "2026-09-18T04:06:04.211" (UTC, no zone) -> "2026년 9월 18일 오후 01:06" (KST), like the original card. */
function dateLabel(value: string): string {
  const parsed = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  const kst = new Date(parsed.getTime() + 9 * 3600 * 1000);
  const h = kst.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${h < 12 ? "오전" : "오후"} ${String(
    h12,
  ).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

function initials(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 2) : "?";
}

export type ProjectListParams = {
  folder?: string;
  q?: string;
  owner?: string;
  sort?: string;
  bookmarked?: string;
  view?: string;
};

function href(params: ProjectListParams, patch: Partial<ProjectListParams>): string {
  const merged = { ...params, ...patch };
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value) qs.set(key, value);
  const s = qs.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/**
 * /ko/projects/team - 전체 프로젝트 (enterprise scope), transcribed from the
 * original: title + project search, folder tree on the left (F&F / 국내·중국·
 * 대만·홍콩), breadcrumb + count + 유저명 search + sort + grid/list on the right.
 * Server component; every control is a plain link or GET form.
 */
export default function ProjectList({ params }: { params: ProjectListParams }) {
  const data = getProjectData();
  const bookmarked = params.bookmarked === "1";
  const listView = params.view === "list";
  const folder = data.folders.find((f) => f.id === params.folder);
  const result = listProjects({
    folder: folder?.id,
    keyword: params.q,
    owner: params.owner,
    bookmarked,
    page: 0,
    size: 500,
    sortBy: params.sort ?? "updatedDesc",
  });
  const missing = folder ? folder.collected === 0 : false;

  return (
    <>
      <div className="page-title teamproj__title">
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          전체 프로젝트
          <span className="page-title__help">?</span>
        </span>
        <form action={BASE} className="teamproj__search">
          {folder && <input type="hidden" name="folder" value={folder.id} />}
          <input className="input" name="q" placeholder="프로젝트 검색" defaultValue={params.q ?? ""} />
          <button type="submit" className="teamproj__searchbtn" aria-label="검색">
            ⌕
          </button>
        </form>
      </div>

      <div className="projlayout">
        <aside className="projfolders">
          <div className="projfolders__label">폴더</div>
          <button type="button" className="btn btn--sm btn--disabled projfolders__new" disabled>
            🗀 새로운 폴더
          </button>
          <Link
            href={href(params, { bookmarked: bookmarked ? undefined : "1" })}
            className={`btn btn--sm projfolders__new${bookmarked ? " projfolders__new--on" : ""}`}
          >
            <span style={{ color: "#e5484d" }}>★</span> 북마크 리스트 보기
          </Link>
          <Link href={href(params, { folder: undefined })} className={`folderrow${folder ? "" : " folderrow--active"}`}>
            <span aria-hidden>⌄</span>
            <span>전체 프로젝트</span>
          </Link>
          {data.folders.map((f) => (
            <Link
              key={f.id}
              href={href(params, { folder: f.id })}
              className={`folderrow folderrow--child${folder?.id === f.id ? " folderrow--active" : ""}`}
              title={f.collected === 0 ? "아직 받지 않은 폴더 (TODO.md)" : undefined}
            >
              <span aria-hidden>›</span>
              <span>{f.name}</span>
              {f.collected === 0 && <span className="folderrow__count">미수집</span>}
            </Link>
          ))}
        </aside>

        <div className="projbody">
          <div className="muted teamproj__crumb">
            전체 프로젝트{folder ? ` / ${folder.name}` : ""}
          </div>
          <div className="filterbar" style={{ marginBottom: 14 }}>
            <span className="muted">{nf.format(result.totalCount)} 개의 프로젝트</span>
            <span className="filterbar__spacer" />
            <form action={BASE} className="teamproj__ownerform">
              {folder && <input type="hidden" name="folder" value={folder.id} />}
              {params.q && <input type="hidden" name="q" value={params.q} />}
              {params.sort && <input type="hidden" name="sort" value={params.sort} />}
              {listView && <input type="hidden" name="view" value="list" />}
              <span className="teamproj__ownerlabel">유저명</span>
              <input className="input" name="owner" placeholder="검색" defaultValue={params.owner ?? ""} />
              <button type="submit" className="btn btn--sm" aria-label="유저 검색">
                ⌕
              </button>
            </form>
            <div className="teamproj__sort">
              <Link
                className={`btn btn--sm${(params.sort ?? "updatedDesc") === "updatedDesc" ? " btn--on" : ""}`}
                href={href(params, { sort: undefined })}
              >
                수정 최신순
              </Link>
              <Link
                className={`btn btn--sm${params.sort === "updatedAsc" ? " btn--on" : ""}`}
                href={href(params, { sort: "updatedAsc" })}
              >
                수정 오래된순
              </Link>
              <Link
                className={`btn btn--sm${params.sort === "nameAsc" ? " btn--on" : ""}`}
                href={href(params, { sort: "nameAsc" })}
              >
                이름순
              </Link>
            </div>
            <div className="teamproj__view">
              <Link className={`btn btn--sm${listView ? "" : " btn--on"}`} href={href(params, { view: undefined })}>
                ▦ 그리드
              </Link>
              <Link className={`btn btn--sm${listView ? " btn--on" : ""}`} href={href(params, { view: "list" })}>
                ☰ 리스트
              </Link>
            </div>
          </div>

          {missing ? (
            <div className="notice" style={{ marginTop: 16 }}>
              {folder?.name} 폴더는 아직 받지 않았습니다. 수집 대기 목록은 fnf_3dsketch/TODO.md 에 있습니다.
            </div>
          ) : (
            <div className={listView ? "projrows" : "projgrid projgrid--team"}>
              {result.data.map((project) => (
                <Link key={project.id} href={`/ko/projects/${project.id}`} className="projcard">
                  <span className="projcard__cover">
                    <Thumb src={project.coverUrl} fallback={project.coverFallback} alt={project.name} />
                  </span>
                  <span className="projcard__body">
                    <span className="projcard__name" title={project.name}>
                      {project.name || "Untitled"}
                    </span>
                    <span className="projcard__date">
                      수정일: {dateLabel(project.updatedAt)}
                      <span className={`projcard__star${project.bookmarked ? " projcard__star--on" : ""}`}>
                        {project.bookmarked ? "★" : "☆"}
                      </span>
                    </span>
                    <span className="projcard__owner">
                      <span className="avatar">
                        {project.owner.imageUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={project.owner.imageUrl} alt="" />
                        ) : (
                          initials(project.owner.name)
                        )}
                      </span>
                      {project.owner.name}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}

          {!missing && result.data.length === 0 && (
            <div className="notice" style={{ marginTop: 16 }}>
              {bookmarked ? "북마크한 프로젝트가 없습니다." : "프로젝트가 없습니다."}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
