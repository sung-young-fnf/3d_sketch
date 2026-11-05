import { floorplanGeometry, type Floorplan } from "@/lib/templates";

/**
 * Inline SVG outline from floorplan.corners (millimetres, x/z plane).
 * The viewBox is fitted to the corner extents, NOT to floorplan.dimensions -
 * that field is a fixed +/-100 m box and would shrink the plan to a dot.
 */
export default function FloorplanSvg({ floorplan }: { floorplan: Floorplan }) {
  const geometry = floorplanGeometry(floorplan);
  if (!geometry) return <div className="notice">도면 좌표가 없습니다.</div>;

  const nf = new Intl.NumberFormat("ko-KR");
  const { points, viewBox, widthMm, heightMm, cornerCount, padding } = geometry;
  const [, , vbW, vbH] = viewBox.split(" ").map(Number);

  return (
    <div className="plan">
      <svg viewBox={viewBox} role="img" aria-label={`평면도 ${Math.round(widthMm)} × ${Math.round(heightMm)} mm`}>
        {/* overall extent */}
        <rect
          x={padding}
          y={padding}
          width={widthMm}
          height={heightMm}
          fill="none"
          stroke="#d4d7dd"
          strokeWidth={Math.max(vbW, vbH) / 400}
          strokeDasharray={`${Math.max(vbW, vbH) / 100} ${Math.max(vbW, vbH) / 100}`}
        />
        {/* the room outline itself */}
        <polygon
          points={points}
          fill="#e8f0fe"
          stroke="#1f6feb"
          strokeWidth={Math.max(vbW, vbH) / 180}
          strokeLinejoin="round"
        />
        {floorplan.corners.map((corner) => (
          <circle
            key={corner.id}
            cx={corner.x - geometry.minX + padding}
            cy={corner.z - geometry.minZ + padding}
            r={Math.max(vbW, vbH) / 220}
            fill="#1f6feb"
          />
        ))}
      </svg>
      <div className="plan__dims">
        <span>가로 {nf.format(Math.round(widthMm))} mm</span>
        <span>세로 {nf.format(Math.round(heightMm))} mm</span>
        <span>코너 {cornerCount}개</span>
        <span className="mono">{floorplan.version}</span>
      </div>
    </div>
  );
}
