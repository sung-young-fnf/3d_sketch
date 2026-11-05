import Link from "next/link";
import { formatBytes, getAssetScan } from "@/lib/assets";
import { getIndex } from "@/lib/catalog";
import { getFinishData } from "@/lib/finishes";

export const dynamic = "force-dynamic";
export const metadata = { title: "시작하기 | Archisketch" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  );
}

/** Same numbers /api/stats returns; read straight from the in-memory index. */
export default function HomePage() {
  const index = getIndex();
  const scan = getAssetScan();
  const finishData = getFinishData();
  const nf = new Intl.NumberFormat("ko-KR");

  return (
    <>
      <h1 className="page-title">
        시작하기
        <span className="page-title__help">?</span>
      </h1>

      <div className="stats">
        <Stat
          label="총 제품 수"
          value={nf.format(index.products.length)}
          sub={`컴포넌트 ${nf.format(index.componentCount)}개`}
        />
        <Stat
          label="카테고리 수"
          value={nf.format(index.categories.size)}
          sub="가구 라이브러리 (미분류 가상 노드 포함)"
        />
        <Stat
          label="다운로드된 모델 수"
          value={nf.format(scan.glbCount)}
          sub={`모델이 있는 컴포넌트 ${nf.format(index.componentsWithModel)}개 중`}
        />
        <Stat
          label="총 용량"
          value={formatBytes(scan.totalBytes)}
          sub={`파일 ${nf.format(scan.files.size)}개 (glb ${nf.format(scan.glbCount)} / gltf ${nf.format(
            scan.gltfCount,
          )} / png ${nf.format(scan.pngCount)})`}
        />
      </div>

      <div style={{ height: 16 }} />

      <div className="stats">
        <Stat label="마감재" value={nf.format(finishData.finishes.length)} sub="FINISH 라이브러리" />
        <Stat label="텍스처" value={nf.format(finishData.materials.length)} sub="TEXTURE 라이브러리" />
      </div>

      <div style={{ height: 20 }} />

      <section className="section">
        <div className="section__head">
          <span className="section__title">이 클론에서 동작하는 화면</span>
        </div>
        <div className="section__body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <Link className="btn" href="/ko/enterprise-library/products/furniture">
              가구 라이브러리 →
            </Link>{" "}
            <Link className="btn" href="/ko/enterprise-library/products/finishes">
              마감재 →
            </Link>{" "}
            <Link className="btn" href="/ko/enterprise-library/products/texture-library">
              텍스처 →
            </Link>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            데이터는 전부 로컬 <span className="mono">data/catalog.json</span>,{" "}
            <span className="mono">data/categories.json</span>,{" "}
            <span className="mono">data/finishes-textures.json</span> 에서 읽습니다. 원본 API는
            호출하지 않습니다. 에셋 다운로드가 진행 중이면 위 숫자는 계속 올라갑니다 (20초 캐시).
          </p>
        </div>
      </section>
    </>
  );
}
