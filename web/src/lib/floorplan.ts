/**
 * Pure floor-plan types + geometry, with NO node builtins, so it is safe to
 * import from client components (FloorPlan is bundled client-side via the
 * client ProjectDetail). The node-backed loader lives in projects.ts, which
 * re-exports these.
 */

export type FloorCorner = { id: string; x: number; z: number };
export type FloorWall = { corners: [string, string] };
export type FloorItem = { productId: string; x: number; z: number; ry: number; code: number };

export type Floor = {
  id: string;
  title: string;
  areaM2: number;
  fpImageScale: { x: number; y: number } | null;
  dimensions: { min: { x: number; z: number }; max: { x: number; z: number } } | null;
  corners: FloorCorner[];
  walls: FloorWall[];
  items: FloorItem[];
  columns?: unknown[];
};

export type FloorGeometry = {
  viewBox: string;
  widthMm: number;
  heightMm: number;
  cornerById: Map<string, { x: number; y: number }>;
  padding: number;
  minX: number;
  minZ: number;
  degenerate: boolean;
};

/**
 * Fit a floor's corner ring to an SVG viewBox. Uses the corner extents, NOT
 * floor.dimensions (a +/-50 m bounding box that would shrink the plan). A
 * degenerate floor (e.g. 강남 B1F, area 0) still yields its point cloud.
 */
export function floorGeometry(floor: Floor, padding = 600): FloorGeometry | null {
  const corners = floor.corners ?? [];
  if (corners.length === 0) return null;

  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const widthMm = maxX - minX;
  const heightMm = maxZ - minZ;

  const cornerById = new Map<string, { x: number; y: number }>();
  for (const corner of corners) {
    cornerById.set(corner.id, { x: corner.x - minX + padding, y: corner.z - minZ + padding });
  }

  return {
    viewBox: `0 0 ${(widthMm + padding * 2).toFixed(1)} ${(heightMm + padding * 2).toFixed(1)}`,
    widthMm,
    heightMm,
    cornerById,
    padding,
    minX,
    minZ,
    degenerate: widthMm < 1 || heightMm < 1 || corners.length < 3,
  };
}
