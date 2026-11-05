import Link from "next/link";
import { notFound } from "next/navigation";
import ProductViewerPanel, { type ViewerComponent } from "@/components/ProductViewerPanel";
import Thumb from "@/components/Thumb";
import { formatBytes } from "@/lib/assets";
import { getCategoryPath, getIndex, UNCATEGORIZED_ID } from "@/lib/catalog";
import { componentAssets } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const LIBRARY = "/ko/enterprise-library/products/furniture";

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().replace("T", " ").slice(0, 19);
}

function dimensionLabel(dimension: { w: number; d: number; h: number } | null): string {
  if (!dimension) return "-";
  const round = (value: number) => Math.round(value).toLocaleString("ko-KR");
  return `${round(dimension.w)} × ${round(dimension.d)} × ${round(dimension.h)} mm`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getIndex().productById.get(id);
  return { title: product ? `${product.name} | Archisketch` : "제품 상세 | Archisketch" };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const index = getIndex();
  const product = index.productById.get(id);
  if (!product) notFound();

  const categoryIds = product.categoryIds.length > 0 ? product.categoryIds : [UNCATEGORIZED_ID];
  const categoryChains = categoryIds.map((categoryId) => getCategoryPath(categoryId)).filter((chain) => chain.length > 0);

  const rows = product.components.map((component) => {
    const assets = componentAssets(product, component.stem);
    return { component, assets };
  });

  const viewerComponents: ViewerComponent[] = rows.map(({ component, assets }, position) => ({
    id: component.id,
    label:
      component.options?.map((option) => option.value).join(" / ") ||
      `컴포넌트 ${position + 1}`,
    glbUrl: assets.glb.exists ? assets.glb.url : null,
    gltfUrl: assets.gltf.exists ? assets.gltf.url : null,
    pngUrl: assets.png.exists ? assets.png.url : null,
    remoteGlbUrl: component.glbUrl,
    status: component.status,
    dimensionMm: component.dimensionMm,
  }));

  const images = rows
    .map(({ component, assets }) => ({
      key: component.id,
      src: assets.png.exists ? assets.png.url : component.previewUrl,
      fallback: assets.png.exists ? component.previewUrl : null,
      caption: assets.png.exists ? "로컬" : "원본 CDN",
      name: component.stem,
    }))
    .filter((image) => Boolean(image.src));

  return (
    <div className="detail">
      <div>
        <nav className="breadcrumb" style={{ marginBottom: 6 }}>
          <Link className="muted" href={LIBRARY}>
            기업 라이브러리
          </Link>
          <span className="breadcrumb__sep">/</span>
          <Link className="muted" href={LIBRARY}>
            가구
          </Link>
          <span className="breadcrumb__sep">/</span>
          <span>{product.name}</span>
        </nav>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          {product.name}
        </h1>
      </div>

      <div className="detail__cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <section className="section">
            <div className="section__head">
              <span className="section__title">상품 정보</span>
              <span className="section__actions">
                <button className="btn btn--sm btn--disabled" type="button">
                  picture
                </button>
                <button className="btn btn--sm btn--disabled" type="button">
                  수정
                </button>
              </span>
            </div>
            <dl className="kv">
              <dt>상품명</dt>
              <dd>{product.name}</dd>
              <dt>브랜드</dt>
              <dd className="faint">- (로컬 데이터에 없음)</dd>
              <dt>제품 구매 링크</dt>
              <dd className="faint">- (로컬 데이터에 없음)</dd>
              <dt>태그</dt>
              <dd>
                {product.tags.length === 0 ? (
                  <span className="faint">없음</span>
                ) : (
                  product.tags.map((tag) => (
                    <span key={tag} className="chip" style={{ marginRight: 4 }}>
                      {tag}
                    </span>
                  ))
                )}
              </dd>
              <dt>상품 코드</dt>
              <dd className="mono">{product.id}</dd>
              <dt>상품 통화</dt>
              <dd>{product.components[0]?.price?.unit ?? "KRW"}</dd>
              <dt>최신 판매량</dt>
              <dd className="faint">- (includeStat 미수집)</dd>
              <dt>생성일</dt>
              <dd>{formatDateTime(product.createdAt)}</dd>
              <dt>수정일</dt>
              <dd>{formatDateTime(product.updatedAt)}</dd>
              <dt>로컬 경로</dt>
              <dd className="mono">{product.localDir}</dd>
            </dl>
          </section>

          <section className="section">
            <div className="section__head">
              <span className="section__title">카테고리(들)</span>
              <span className="muted">{categoryChains.length}개 경로</span>
            </div>
            <div className="section__body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {categoryChains.length === 0 && <span className="faint">소속 카테고리가 없습니다.</span>}
              {categoryChains.map((chain) => (
                <nav className="breadcrumb" key={chain.map((node) => node.id).join("/")}>
                  {chain.map((node, position) => (
                    <span key={node.id} style={{ display: "contents" }}>
                      {position > 0 && <span className="breadcrumb__sep">/</span>}
                      <Link
                        href={node.id === index.rootId ? LIBRARY : `${LIBRARY}?category=${node.id}`}
                        className={position === chain.length - 1 ? "" : "muted"}
                      >
                        {node.name}
                      </Link>
                    </span>
                  ))}
                </nav>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section__head">
              <span className="section__title">제품 정보</span>
              <span className="section__actions">
                <button className="btn btn--sm btn--disabled" type="button">
                  3D 모델링 변경
                </button>
                <button className="btn btn--sm btn--disabled" type="button">
                  공유/임베드
                </button>
                <button className="btn btn--sm btn--disabled" type="button">
                  컴포넌트 ID 복사
                </button>
              </span>
            </div>
            <div className="section__body">
              {images.length > 0 ? (
                <div className="imagestrip">
                  {images.map((image) => (
                    <div className="imagestrip__item" key={image.key}>
                      <Thumb
                        src={image.src}
                        fallback={image.fallback}
                        alt={image.name}
                        className=""
                      />
                      <div className="imagestrip__cap">{image.caption}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="notice">이미지가 없습니다.</div>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>부품 이름</th>
                    <th>부품 코드</th>
                    <th>옵션</th>
                    <th>치수 (W×D×H)</th>
                    <th>상태</th>
                    <th>로컬 파일</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ component, assets }) => (
                    <tr key={component.id}>
                      <td>{component.stem}</td>
                      <td className="mono">{component.id}</td>
                      <td>
                        {component.options?.length
                          ? component.options.map((option) => `${option.key}: ${option.value}`).join(", ")
                          : "-"}
                      </td>
                      <td>{dimensionLabel(component.dimensionMm)}</td>
                      <td>
                        {component.status === "COMPLETED" ? (
                          component.status
                        ) : (
                          <span className="badge-warn">{component.status}</span>
                        )}
                      </td>
                      <td>
                        {assets.glb.exists ? (
                          <a className="mono" href={`${assets.glb.url}?download=1`} download>
                            glb {formatBytes(assets.glb.size)}
                          </a>
                        ) : (
                          <span className="faint">glb 미다운로드</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="section" style={{ position: "sticky", top: 72 }}>
          <div className="section__head">
            <span className="section__title">3D 모델링 확인하기</span>
            <span className="chip">클론 전용 기능</span>
          </div>
          <div className="section__body">
            <ProductViewerPanel components={viewerComponents} />
          </div>
        </section>
      </div>
    </div>
  );
}
