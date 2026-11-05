import Link from "next/link";
import { floorGeometry, type Floor } from "@/lib/floorplan";

/**
 * Inline SVG floor outline from corners + walls, with placed items as dots.
 * Fitted to corner extents (not floor.dimensions, a +/-50 m box). A floor whose
 * corners are degenerate still renders its point cloud without crashing.
 * `localProductIds` marks items we can open in the 3D viewer.
 */
export default function FloorPlan({
  floor,
  localProductIds,
}: {
  floor: Floor;
  localProductIds?: Set<string>;
}) {
  const geometry = floorGeometry(floor);
  if (!geometry) return <div className="notice">도면 좌표가 없습니다.</div>;

  const nf = new Intl.NumberFormat("ko-KR");
  const { viewBox, widthMm, heightMm, cornerById, minX, minZ, padding } = geometry;
  const [, , vbW, vbH] = viewBox.split(" ").map(Number);
  const scale = Math.max(vbW, vbH);
  const stroke = scale / 300;
  const dot = scale / 130;

  const walls = floor.walls
    .map((wall) => {
      const a = cornerById.get(wall.corners[0]);
      const b = cornerById.get(wall.corners[1]);
      if (!a || !b) return null;
      return { a, b };
    })
    .filter((w): w is { a: { x: number; y: number }; b: { x: number; y: number } } => Boolean(w));

  let linked = 0;

  return (
    <div className="plan">
      <svg viewBox={viewBox} role="img" aria-label={`${floor.title} 도면`}>
        {/* corner points (always, even for a degenerate floor) */}
        {floor.corners.map((corner) => (
          <circle
            key={corner.id}
            cx={corner.x - minX + padding}
            cy={corner.z - minZ + padding}
            r={dot * 0.6}
            fill="#9aa0a9"
          />
        ))}
        {/* walls */}
        {walls.map((wall, index) => (
          <line
            key={index}
            x1={wall.a.x}
            y1={wall.a.y}
            x2={wall.b.x}
            y2={wall.b.y}
            stroke="#1f6feb"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        ))}
        {/* placed items */}
        {floor.items.map((item, index) => {
          const isLinked = Boolean(localProductIds?.has(item.productId));
          if (isLinked) linked += 1;
          return (
            <circle
              key={`${item.productId}-${index}`}
              cx={item.x - minX + padding}
              cy={item.z - minZ + padding}
              r={dot}
              className={isLinked ? "fpitem fpitem--linked" : "fpitem"}
            />
          );
        })}
      </svg>
      <div className="plan__dims">
        <span>가로 {nf.format(Math.round(widthMm))} mm</span>
        <span>세로 {nf.format(Math.round(heightMm))} mm</span>
        <span>코너 {floor.corners.length}개</span>
        <span>벽 {floor.walls.length}개</span>
        <span>배치 {floor.items.length}개</span>
        {floor.areaM2 > 0 && <span>면적 약 {nf.format(Math.round(floor.areaM2))} m²</span>}
      </div>
      <div className="fplegend">
        <span>
          <span className="dot" style={{ background: "#1f6feb", opacity: 0.55 }} />
          배치 가구
        </span>
        <span>
          <span className="dot" style={{ background: "#e8563d" }} />
          로컬 3D 모델 연결 {linked}개
        </span>
      </div>
      {localProductIds && linked > 0 && (
        <p className="faint" style={{ marginTop: 6 }}>
          로컬 glb 가 있는 가구는 아래에서 열 수 있습니다:{" "}
          {floor.items
            .filter((item, index, arr) => localProductIds.has(item.productId) && arr.findIndex((o) => o.productId === item.productId) === index)
            .slice(0, 12)
            .map((item) => (
              <Link key={item.productId} href={`/ko/sales/${item.productId}`} className="chip" style={{ marginRight: 4 }}>
                {item.productId.slice(0, 8)} ↗
              </Link>
            ))}
        </p>
      )}
    </div>
  );
}
