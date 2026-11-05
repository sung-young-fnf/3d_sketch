import Link from "next/link";
import FloorplanSvg from "@/components/FloorplanSvg";
import Thumb from "@/components/Thumb";
import { getTemplate, listTemplates, type Template } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 템플릿 | 인테리어 템플릿" };

const BASE = "/ko/templates/list";

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const nf = new Intl.NumberFormat("ko-KR");

function koreanDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getUTCFullYear()}년 ${parsed.getUTCMonth() + 1}월 ${parsed.getUTCDate()}일`;
}

function dateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().replace("T", " ").slice(0, 16);
}

/* --------------------------- detail --------------------------- */

function TemplateDetail({ template }: { template: Template }) {
  const grouped = new Map<string, typeof template.products>();
  for (const product of template.products) {
    const bucket = grouped.get(product.typeLabel);
    if (bucket) bucket.push(product);
    else grouped.set(product.typeLabel, [product]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* 1. back arrow + title */}
      <div className="tpl__head">
        <Link className="tpl__back" href={BASE} aria-label="목록으로">
          ←
        </Link>
        <h1 className="page-title" style={{ margin: 0 }}>
          {template.name}
        </h1>
      </div>

      {/* 2. status pills */}
      <div className="tpl__badges">
        <span className="pill">{template.statusLabel}</span>
        {template.displaying && <span className="pill">전시 중</span>}
      </div>

      {/* 3. raw id + date */}
      <div>
        <div className="tpl__idline mono">{template.id}</div>
        <div className="tpl__idline">{koreanDate(template.createdAt)}</div>
      </div>

      {/* 4. name + description */}
      <div>
        <h2 className="tpl__h2">{template.name}</h2>
        <p className="tpl__desc">{template.description}</p>
      </div>

      {/* 5. additional images */}
      <section>
        <div className="section__title">템플릿 추가 이미지</div>
        <p className="tpl__subtitle">템플릿 표지 외 등록된 템플릿 추가 이미지들 입니다.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
          {template.additionalImages.map((image) => (
            <div className="tplimg" key={image.id}>
              {image.src ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={image.src}
                  alt={`${template.name} 추가 이미지`}
                  width={3840}
                  height={2160}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="thumb-missing" style={{ aspectRatio: "16 / 9" }}>
                  이미지 없음
                </div>
              )}
              <span className="tplimg__cap">
                {image.resolution} · {(image.bytes / 1024 / 1024).toFixed(1)} MB
                {image.isLocal ? "" : " · 원본 CDN"}
              </span>
              <span className="tplimg__badge">{image.badge}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 6. interior styles */}
      <section>
        <div className="section__title" style={{ marginBottom: 8 }}>
          인테리어 스타일
        </div>
        <div className="tagline">
          {template.styles.map((style) => (
            <span className="tag" key={style.code}>
              #{style.label}
            </span>
          ))}
        </div>
      </section>

      {/* 7. history - collapsed by default */}
      <details className="collapse">
        <summary>수정기록</summary>
        <div className="collapse__body">
          {template.history.length === 0 ? (
            <span className="faint">기록이 없습니다.</span>
          ) : (
            template.history.map((entry, index) => (
              <div className="histrow" key={`${entry.modifiedAt}-${index}`}>
                <strong>{entry.modifiedBy.name}</strong>
                <span className="muted">{entry.modifiedFields.join(", ")}</span>
                <span className="faint">{dateTime(entry.modifiedAt)}</span>
              </div>
            ))
          )}
        </div>
      </details>

      {/* 8. comments - expanded by default */}
      <details className="collapse" open>
        <summary>코멘트</summary>
        <div className="collapse__body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {template.comments.length === 0 && <span className="faint">코멘트를 남겨주세요</span>}
          <textarea
            className="input"
            rows={3}
            placeholder="코멘트를 남겨주세요"
            disabled
            aria-label="코멘트"
          />
          <div>
            <button type="button" className="btn btn--primary btn--disabled" disabled>
              코멘트 등록
            </button>
          </div>
        </div>
      </details>

      {/* 9. space info */}
      <section className="section">
        <div className="section__head">
          <span className="section__title">공간 정보</span>
        </div>
        <div className="section__body">
          <div className="spaceinfo">
            <div style={{ minWidth: 0 }}>
              <div className="spacerow">
                <span className="spacerow__label">{template.roomTypeLabel}</span>
                <span className="spacerow__value">
                  {template.areaM2}m² / {nf.format(template.areaPyeong)} 평
                </span>
              </div>
              <div className="spacerow">
                <span className="spacerow__label">전체 인테리어 가격</span>
                <span className="spacerow__value">
                  {nf.format(template.totalPrice.value)} {template.totalPrice.unit}
                </span>
              </div>

              <div className="tplproducts">
                {[...grouped.entries()].map(([typeLabel, products]) => (
                  <div key={typeLabel}>
                    <div className="tplproduct__group">
                      {typeLabel} · {products.length}
                    </div>
                    {products.map((product) => (
                      <div className="tplproduct" key={product.id}>
                        {product.src ? (
                          <Thumb
                            src={product.src}
                            fallback={product.fallback}
                            alt={product.name}
                            className="tplproduct__thumb"
                            missingLabel="없음"
                          />
                        ) : (
                          <span className="tplproduct__thumb--missing">없음</span>
                        )}
                        <span className="tplproduct__name" title={product.name}>
                          {product.name}
                        </span>
                        <span className="tplproduct__count">×{nf.format(product.count)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="faint" style={{ marginTop: 6 }}>
                제품 {nf.format(template.productCount)}종
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <FloorplanSvg floorplan={template.floorplan} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------------------------- list ---------------------------- */

export default async function TemplateListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const templateId = one(params, "templateId");

  if (templateId) {
    const template = getTemplate(templateId);
    if (template) return <TemplateDetail template={template} />;
    return (
      <>
        <h1 className="page-title">내 템플릿</h1>
        <div className="notice">
          템플릿을 찾을 수 없습니다. <span className="mono">{templateId}</span>
          <div style={{ marginTop: 10 }}>
            <Link className="btn" href={BASE}>
              목록으로
            </Link>
          </div>
        </div>
      </>
    );
  }

  const keyword = (one(params, "keyword") ?? "").trim();
  const result = listTemplates({ page: 0, size: 120, keyword: keyword || undefined });

  return (
    <>
      <h1 className="page-title">
        내 템플릿
        <span className="page-title__help">?</span>
      </h1>

      <div className="muted" style={{ marginBottom: 12 }}>
        {nf.format(result.totalCount)}개의 템플릿
      </div>

      {result.data.length === 0 ? (
        <div className="notice">템플릿이 없습니다.</div>
      ) : (
        <div className="tplgrid">
          {result.data.map((template) => (
            <Link
              key={template.id}
              href={`${BASE}?templateId=${encodeURIComponent(template.id)}`}
              className="tplcard"
            >
              <span className="tplcard__cover">
                <Thumb
                  src={template.cover.src}
                  fallback={template.cover.fallback}
                  alt={template.name}
                  className=""
                />
              </span>
              <span className="tplcard__body">
                <span className="tplcard__name">{template.name}</span>
                <span className="tplcard__desc">{template.description}</span>
                <span className="tpl__badges">
                  <span className="pill pill--soft">{template.statusLabel}</span>
                  {template.displaying && <span className="pill pill--soft">전시 중</span>}
                </span>
                <span className="tplcard__meta">
                  <span>{template.roomTypeLabel}</span>
                  <span>
                    {template.areaM2}m² / {nf.format(template.areaPyeong)} 평
                  </span>
                  <span>제품 {nf.format(template.productCount)}종</span>
                  <span>수정 {dateTime(template.updatedAt).slice(0, 10)}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
