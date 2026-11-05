/**
 * Store scene shape (scripts/build_store_scene.py). Kept free of node builtins
 * so the client viewer can import it. All lengths are millimetres, Y-up,
 * floor plane = XZ - the archisketch convention.
 */

export type Pt = [number, number]; // [x, z] mm

export type SceneRoom = {
  points: Pt[];
  height: number;
  hideCeiling?: boolean;
  color: string;
  finishId?: string | null;
};

export type SceneWall = {
  a: Pt;
  b: Pt;
  thickness: number;
  height: number;
  color: string;
  openings: unknown[];
};

export type SceneItem = {
  id: string;
  productId: string;
  name: string;
  /** glb = library model, loads in metres; gltf = project-custom copy, loads in millimetres */
  kind: "glb" | "gltf";
  /** 매장연출 slot: yaw (deg) a swapped-in VMD product is turned to (glb products face +Z) */
  facing?: number;
  /** 매장연출: only the part between these heights (mm above the floor) is drawn - e.g. a mannequin cut to a bust on a shelf */
  clip?: [number, number];
  /** 매장연출: "model" = a swapped-in product is built in this item's own model frame (metres) and takes its
   *  transform as is - 착장 토르소: every dressed torso glb shares the bare torso's frame */
  fit?: "model";
  url: string;
  /** column-major 4x4, mm. Places the model's bounding-box centre. */
  matrix: number[];
  center: [number, number, number];
  size: [number, number, number];
  /** 매장연출 slot: how a swapped-in product sits, over its category's mount (place = on a shelf) */
  mount?: "hang" | "place";
  /** 매장연출 side-hung item built thin (its depth scale); the viewer's 옆걸이 촘촘히 off shows it at full depth */
  thin?: number;
  /** 매장연출 side-hung slot: a swapped-in product is squashed to this share of its depth (packed on the rail) */
  swapDepth?: number;
  /** "(렌더링x)" helper the archisketch render leaves out - hidden by default */
  renderHidden?: boolean;
};

export type DrawingPage = {
  page: number;
  file: string;
  url: string;
  title: string;
  floor?: string;
  /** outer wall outline in drawing pixels, matched to the floor's room bounds ± half wall */
  outlinePx?: { left: number; top: number; right: number; bottom: number };
};

export type SceneFloor = {
  id: string;
  archiId?: string;
  title: string;
  /** floor elevation, mm */
  level: number;
  height: number;
  rooms: SceneRoom[];
  walls: SceneWall[];
  items: SceneItem[];
  missing: { productId: string; count: number }[];
  drawing: DrawingPage | null;
};

export type SceneShot = {
  id: string;
  floorId: string;
  title: string;
  thumb: string | null;
  /** mm, world (floor level already added) */
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fov: number;
  aspect: number;
  /** camera clip, mm - the render cuts away everything closer (walls in front of an outside camera) */
  near: number;
  /** swappable display items in this shot, numbered left to right (data/vmd-slots) */
  slots?: SceneSlot[];
  /** 매장연출 hanging zones whose garment count can change (scripts/build_vignettes.py Vignette.rack) */
  racks?: SceneRack[];
  /** 매장연출 shelves / rails that move up and down (scripts/build_vignettes.py Vignette.level) */
  levels?: SceneLevel[];
};

/** A shelf or rail on slotted uprights: its items (board, brackets, what stands on it) and racks move up / down together. */
export type SceneLevel = {
  id: string;
  /** 왼쪽 칸 / 가운데 칸 ... - the bar groups levels by it */
  group?: string;
  label: string;
  /** SceneItem ids that move (not rack garments - those follow their rack) */
  itemIds: string[];
  rackIds?: string[];
  /** height shown to people (shelf top / rail), mm, as built */
  y: number;
  /** allowed height range and step (the upright slot pitch), mm */
  min: number;
  max: number;
  step: number;
};

/** A rail / loop / arm: its slots' items are the garments, `count` of them shown and re-spaced along from -> to. */
export type SceneRack = {
  id: string;
  /** 위칸 / 아래칸 - the bar groups racks by it */
  group?: string;
  /** where + how it hangs: 왼쪽 옆걸이 (shoulder out), 가운데 정면걸이 (face out) */
  label: string;
  /** every possible garment, in order along the rack (the first `count` are shown) */
  slotIds: string[];
  /** shown at first */
  count: number;
  /** item bbox centre (mm) of the first / last garment when the rack is full */
  from: [number, number, number];
  to: [number, number, number];
  /** center: spread evenly about the middle, at most `gap` mm apart; start: `gap` mm steps from `from` */
  anchor: "center" | "start";
  /** mm along from -> to that each garment's whole width stays within (the bay's posts) */
  bounds?: [number, number];
  gap?: number;
};

export type SceneSlot = {
  /** L01, L02 ... */
  id: string;
  /** SceneItem.id of the item that can be swapped */
  itemId: string;
  label: string;
  /** 상품 category (first folder: 패딩 / 가방 / 신발) offered in 상품 변경; all when unset */
  category?: string;
  /** VmdProduct id this slot shows at first (as if swapped in), until the page's swaps are changed */
  product?: string;
  /** image = a poster / screen whose front face takes a dropped or picked image instead of a product */
  kind?: "image";
};

export type StoreScene = {
  projectId: string;
  name: string;
  units: "mm";
  floors: SceneFloor[];
  shots: SceneShot[];
  drawings: DrawingPage[];
  /** 매장연출: hanger glb (hook top at its origin) a hung VMD product without its own hook is put on */
  hanger?: string;
};

export type VmdProduct = {
  /** file stem, e.g. X26FDXDJ6M066_BKS */
  id: string;
  name: string;
  /** folders under the product root, e.g. ["패딩", "X26FDXDJ6M066 웰니스 다운 숏패딩"] */
  path: string[];
  /** colour code after the last "_" of the file stem (BKS, DWS ...) */
  color?: string;
  url: string;
  thumb: string | null;
  /** hang = top (hook) snaps to the surface hit; place = bottom rests on it */
  mount: "hang" | "place";
};

/** one placed VMD product, as saved/exported */
export type Placement = {
  uid: string;
  productId: string;
  /** metres, world */
  position: [number, number, number];
  rotationY: number;
};

/** a scene item swapped for a VMD product, as saved: SceneItem.id -> VmdProduct.id */
export type Swaps = Record<string, string>;
