import { getTemplateData } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const metadata = { title: "템플릿 태그 | 인테리어 템플릿" };

/**
 * `tagGroups` in data/templates.json is an empty array - the enterprise has no
 * template tags defined. Honest empty state inside the real shell, not a
 * generic "준비 중".
 */
export default function TemplateTagsPage() {
  const data = getTemplateData();

  return (
    <>
      <h1 className="page-title">
        템플릿 태그
        <span className="page-title__help">?</span>
      </h1>

      <section className="section">
        <div className="section__head">
          <span className="section__title">태그 그룹 {data.tagGroups.length}개</span>
          <span className="section__actions">
            <button type="button" className="btn btn--sm btn--disabled" disabled>
              태그 그룹 추가
            </button>
          </span>
        </div>
        <div className="section__body">
          <div className="notice">
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>등록된 태그가 없습니다</div>
            <p style={{ margin: 0 }}>
              이 기업에는 템플릿 태그 그룹이 정의되어 있지 않습니다 (수집된{" "}
              <span className="mono">tagGroups</span> 가 빈 배열).
            </p>
          </div>
        </div>
      </section>

      <div style={{ height: 16 }} />

      <section className="section">
        <div className="section__head">
          <span className="section__title">참고 — 인테리어 스타일 {data.styles.length}종</span>
        </div>
        <div className="section__body">
          <p className="muted" style={{ marginTop: 0 }}>
            태그와 달리 스타일 코드는 수집되어 있고, 템플릿 상세의{" "}
            <strong>인테리어 스타일</strong> 에서 쓰입니다.
          </p>
          <div className="tagline">
            {data.styles.map((style) => (
              <span className="tag" key={style.code} title={style.code}>
                #{style.label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
