import Link from "next/link";
import { getTemplateData } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const metadata = { title: "템플릿 관리 | 인테리어 템플릿" };

const nf = new Intl.NumberFormat("ko-KR");

/** Real shell with the collected data; the write actions are inert like elsewhere. */
export default function TemplateManagePage() {
  const data = getTemplateData();

  return (
    <>
      <h1 className="page-title">
        템플릿 관리
        <span className="page-title__help">?</span>
      </h1>

      <section className="section">
        <div className="section__head">
          <span className="section__title">등록된 템플릿 {nf.format(data.templates.length)}개</span>
          <span className="section__actions">
            <button type="button" className="btn btn--sm btn--disabled" disabled>
              템플릿 등록
            </button>
          </span>
        </div>
        {data.templates.length === 0 ? (
          <div className="section__body">
            <div className="notice">등록된 템플릿이 없습니다.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>설명</th>
                  <th>상태</th>
                  <th>전시</th>
                  <th>공간</th>
                  <th>면적</th>
                  <th>제품</th>
                  <th>사용</th>
                  <th>수정일</th>
                </tr>
              </thead>
              <tbody>
                {data.templates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <Link href={`/ko/templates/list?templateId=${encodeURIComponent(template.id)}`}>
                        {template.name}
                      </Link>
                    </td>
                    <td className="muted">{template.description}</td>
                    <td>
                      <span className="pill pill--soft">{template.statusLabel}</span>
                    </td>
                    <td>{template.displaying ? <span className="pill pill--soft">전시 중</span> : "-"}</td>
                    <td>{template.roomTypeLabel}</td>
                    <td>
                      {template.areaM2}m² / {nf.format(template.areaPyeong)} 평
                    </td>
                    <td>{nf.format(template.productCount)}종</td>
                    <td>{nf.format(template.useCount)}</td>
                    <td className="faint">{template.updatedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
