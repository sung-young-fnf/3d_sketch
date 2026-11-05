"use client";

import { useState } from "react";
import ModelViewer from "./ModelViewer";

export type ViewerComponent = {
  id: string;
  label: string;
  glbUrl: string | null;
  gltfUrl: string | null;
  pngUrl: string | null;
  remoteGlbUrl: string | null;
  status: string;
  dimensionMm: { w: number; d: number; h: number } | null;
};

/**
 * 3D 모델링 확인하기 - this panel does not exist in the original (spec section 11
 * notes the original can only download images). Local .glb only.
 */
export default function ProductViewerPanel({ components }: { components: ViewerComponent[] }) {
  const [activeId, setActiveId] = useState(components[0]?.id ?? "");
  const active = components.find((component) => component.id === activeId) ?? components[0];

  if (!active) {
    return <div className="notice">컴포넌트가 없습니다.</div>;
  }

  return (
    <div>
      {components.length > 1 && (
        <div className="viewer__tabs">
          {components.map((component) => (
            <button
              key={component.id}
              type="button"
              className={`viewer__tab${component.id === active.id ? " viewer__tab--on" : ""}`}
              onClick={() => setActiveId(component.id)}
            >
              {component.label}
            </button>
          ))}
        </div>
      )}

      <ModelViewer url={active.glbUrl} dimensionMm={active.dimensionMm} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {active.glbUrl ? (
          <a className="btn btn--accent" href={`${active.glbUrl}?download=1`} download>
            ⬇ GLB 다운로드
          </a>
        ) : (
          <span className="btn btn--disabled">GLB 없음 ({active.status})</span>
        )}
        {active.pngUrl && (
          <a className="btn" href={`${active.pngUrl}?download=1`} download>
            ⬇ 이미지 다운로드
          </a>
        )}
        {active.gltfUrl && (
          <a
            className="btn"
            href={`${active.gltfUrl}?download=1`}
            download
            title="이 .gltf 는 외부 .bin/.png 사이드카를 참조하는데 그 파일들은 아직 받아지지 않았습니다. 단독으로는 열리지 않습니다."
          >
            ⬇ glTF (외부 텍스처 미포함)
          </a>
        )}
        {active.remoteGlbUrl && (
          <a className="btn" href={active.remoteGlbUrl} target="_blank" rel="noreferrer">
            원본 CDN URL ↗
          </a>
        )}
      </div>

      <p className="faint" style={{ marginTop: 8, marginBottom: 0 }}>
        마우스 드래그 회전 · 휠 줌 · 우클릭 드래그 이동. 로컬 <span className="mono">.glb</span> 만
        읽습니다.
      </p>
    </div>
  );
}
