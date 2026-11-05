"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Placement, SceneFloor, SceneItem, SceneLevel, SceneRack, SceneShot, StoreScene, Swaps, VmdProduct } from "@/lib/scene-types";

/*
 * Store assembled from archisketch floorplan data (docs/store-assembly.md):
 *   store group is in millimetres and scaled 1/1000, so the world is metres.
 *   rooms -> floor/ceiling shapes, walls -> boxes, items -> glb/gltf placed by
 *   their bounding-box centre with the archisketch localTransform.
 * mode "shots": the camera is locked to the render shots (no orbit / walk).
 * mode "orbit" (전체 렌더링): the whole store without ceilings, free orbit/zoom/pan, view only.
 * VMD products live outside the store group, in metres. They are not dragged:
 *   "+ 매장에 추가" drops one where the view centre meets the store (floor, shelves,
 *   rails), "hang" products put their hook on it, "place" products their base.
 * Slots (shot.slots, data/vmd-slots) are display items numbered per shot (L01 ...):
 *   clicking one swaps the item for a VMD product hung from the same point.
 * Racks (shot.racks) are rails / loops / arms whose garment count changes: the first `count` of their
 *   slots are shown, spread along the rack at first; the rest are hidden. Garments never push each other: one
 *   more goes into the widest free spot, one less leaves the others where they are, and a shown garment drags
 *   freely along its rack when the rack runs across the view. A rack with `bounds` keeps every garment's whole
 *   width inside them (between the bay's posts).
 * Levels (shot.levels) are shelves / rails on slotted uprights: dragging a shelf board / rail or its ▲▼ moves it,
 *   with what stands on it and its racks, up / down in `step` mm.
 * Hung VMD products without a hook of their own go on scene.hanger.
 * Each rack hangs side-on (옆걸이, shoulder to the camera) or face-out (정면걸이); the bar switches it per rack and
 *   re-spreads its garments.
 * 옆걸이 촘촘히 (on by default): side-on garments are pressed thin (item `thin`, swapped products `swapDepth` or
 *   SIDE_SWAP); off shows every garment at its own 3D depth.
 */

/** hanger hook top -> top of the garment on it, m */
const HANGER_DROP = 0.11;
/** pageMemory key of the 옆걸이 촘촘히 setting ("0" = off) */
const DENSE_KEY = "vmd-dense";
/** depth share of a side-on swapped product when its slot gives no swapDepth */
const SIDE_SWAP = 0.5;

const EYE_M = 1.6;
const FLOOR_DEFAULT = 0xd8d2c8;
// tuned against the archisketch renders (shots 1, 8, 12): the raw PBR look is
// overexposed and washed out next to the path-traced images
const CANVAS_GRADE = "saturate(1.5) contrast(1.12) brightness(0.97)";
// the inverse, baked into placed images so a poster shows the file's own colours through the grade
const PICTURE_UNGRADE = "brightness(1.031) contrast(0.893) saturate(0.667)";
/** 고화질 저장 width, px */
const SNAPSHOT_W = 3840;

type Engine = {
  setFloor: (mode: string) => void;
  /** 전체 렌더링: back to the overview of the current floor */
  resetView: () => void;
  /** 전체 렌더링 direction pad: press / release a MOVE_KEYS key */
  hold: (key: string, on: boolean) => void;
  goShot: (shot: SceneShot) => void;
  addProduct: (product: VmdProduct) => void;
  removeSelected: () => void;
  clearPlacements: () => void;
  exportPlacements: () => Placement[];
  /** current shot's slots projected to the frame: u, v in 0..1 at the item's top */
  slotAnchors: () => { id: string; u: number; v: number }[];
  setSwap: (itemId: string, product: VmdProduct | null) => void;
  /** outline the slot's item (or the product swapped in for it); null clears */
  highlightSlot: (itemId: string | null) => void;
  /** image slot: cover the item's front with this image (cropped to fill); null restores the original */
  setPicture: (itemId: string, file: Blob | null, name?: string) => void;
  /** the current view rendered at `width` px with the canvas grade baked in, as a PNG data URL */
  snapshot: (width: number) => string;
  /** show n garments on a rack (re-spaced); garments past n lose their swap */
  setRackCount: (rackId: string, n: number) => void;
  /** hang a rack's garments side-on (true) or face-out; they are spread evenly again */
  setRackSide: (rackId: string, side: boolean) => void;
  /** take this rack garment out: the ones after it move up one place, keeping their products */
  removeFromRack: (itemId: string) => void;
  /** box the garments of this rack (null clears) */
  highlightRack: (rackId: string | null) => void;
  /** move a shelf / rail to `dy` mm from where it was built (clamped, snapped) */
  setLevel: (levelId: string, dy: number) => void;
  /** side-hung garments pressed thin (true) or at their own 3D depth */
  setDense: (on: boolean) => void;
  /** box this shelf / rail with what it carries (null clears) */
  highlightLevel: (levelId: string | null) => void;
};

type Anchor = { id: string; u: number; v: number };

/** added products / swaps live for the page: they carry across tabs (전체 렌더링 shows
 *  what 3D 매장 보기 added) but a reload starts the store fresh */
const pageMemory = new Map<string, string>();
/** placed images per scene: item id -> file (same page lifetime as pageMemory) */
const pagePictures = new Map<string, Map<string, { file: Blob; name: string }>>();

/** every texture of a loaded model sharpened for the oblique views (pegboard, shelves) */
function sharpen(model: THREE.Object3D, anisotropy: number) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.anisotropy = anisotropy;
    }
  });
}

/** an image cropped to fill aspect w/h (centre), at most 2048 px, with the canvas grade undone */
async function pictureCanvas(file: Blob, aspect: number) {
  const img = await createImageBitmap(file);
  const long = Math.min(2048, Math.max(img.width, img.height));
  const w = aspect >= 1 ? long : Math.round(long * aspect);
  const h = aspect >= 1 ? Math.round(long / aspect) : long;
  const cut = Math.min(img.width / w, img.height / h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.filter = PICTURE_UNGRADE;
  ctx.drawImage(img, (img.width - w * cut) / 2, (img.height - h * cut) / 2, w * cut, h * cut, 0, 0, w, h);
  img.close();
  return c;
}

/** 전체 렌더링 move keys -> [right, up, forward] */
const MOVE_KEYS: Record<string, [number, number, number]> = {
  w: [0, 0, 1], arrowup: [0, 0, 1],
  s: [0, 0, -1], arrowdown: [0, 0, -1],
  a: [-1, 0, 0], arrowleft: [-1, 0, 0],
  d: [1, 0, 0], arrowright: [1, 0, 0],
  r: [0, 1, 0], f: [0, -1, 0],
};

/** product folders (VmdProduct.path) as a tree for the 상품 tab */
type ProductNode = { name: string; children: ProductNode[]; products: VmdProduct[] };
function productTree(products: VmdProduct[]): ProductNode {
  const root: ProductNode = { name: "상품", children: [], products: [] };
  for (const p of products) {
    let node = root;
    for (const seg of p.path) {
      let child = node.children.find((c) => c.name === seg);
      if (!child) {
        child = { name: seg, children: [], products: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.products.push(p);
  }
  return root;
}
const countProducts = (n: ProductNode): number =>
  n.products.length + n.children.reduce((sum, c) => sum + countProducts(c), 0);
const BADGE_W = 36;
const BADGE_GAP = 4;
const PILE_ROW = 6;

/** Face-out garments sit one behind another, so their anchors pile up on screen:
 *  spread each pile into a row of badges above it (px), each with a leader line to its item. */
function layoutBadges(anchors: Anchor[], w: number, h: number) {
  const sorted = [...anchors].sort((a, b) => a.u - b.u);
  const piles: Anchor[][] = [];
  for (const a of sorted) {
    const pile = piles.find((p) => {
      const last = p[p.length - 1];
      return (a.u - last.u) * w < BADGE_W && Math.abs(a.v - last.v) * h < 24;
    });
    if (pile) pile.push(a);
    else piles.push([a]);
  }
  const out = piles.flatMap((pile) => {
    const cx = (pile.reduce((n, a) => n + a.u, 0) / pile.length) * w;
    // one height for every pile so neighbouring piles share a row (and push apart instead of half-overlapping)
    const top = Math.min(...pile.map((a) => a.v)) * h - 30;
    // long piles (a rail packed shoulder-out) wrap into stacked rows of PILE_ROW
    const cols = Math.min(pile.length, PILE_ROW);
    const span = cols * BADGE_W + (cols - 1) * BADGE_GAP;
    const rowsUp = Math.ceil(pile.length / PILE_ROW) - 1;
    return pile.map((a, i) => ({
      ...a,
      bx: cx - span / 2 + BADGE_W / 2 + (i % PILE_ROW) * (BADGE_W + BADGE_GAP),
      by: top - (rowsUp - Math.floor(i / PILE_ROW)) * 22,
      ax: a.u * w,
      ay: a.v * h,
    }));
  });
  // neighbouring piles' rows can still collide: push right, keep inside the frame
  const rows = [...out].sort((a, b) => a.by - b.by || a.bx - b.bx);
  rows.forEach((b, i) => {
    b.bx = Math.max(b.bx, BADGE_W / 2 + 4);
    // a push can land on another earlier badge: repeat until this one is clear
    for (let moved = true; moved; ) {
      moved = false;
      for (const o of rows.slice(0, i)) {
        if (Math.abs(o.by - b.by) < 20 && Math.abs(b.bx - o.bx) < BADGE_W + BADGE_GAP) {
          b.bx = Math.max(b.bx, o.bx) + BADGE_W + BADGE_GAP; // only ever right, so it ends
          moved = true;
        }
      }
    }
  });
  return out;
}

type Placed = {
  uid: string;
  product: VmdProduct;
  holder: THREE.Group;
};

function hexColor(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roomShape(points: [number, number][]): THREE.Shape {
  // ShapeGeometry is built in XY and rotated -90deg about X, which sends y to -z,
  // so feed (x, -z) to land on world (x, 0, z).
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  return shape;
}

/** cut a model to a height band (world metres): its materials are cloned so the shared cache stays whole */
function clipModel(model: THREE.Object3D, minY: number, maxY: number) {
  const planes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -minY), new THREE.Plane(new THREE.Vector3(0, -1, 0), maxY)];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const clip = (m: THREE.Material) => {
      const c = m.clone();
      c.clippingPlanes = planes;
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clip) : clip(mesh.material);
  });
}

function floorBounds(floor: SceneFloor) {
  const xs = floor.rooms.flatMap((r) => r.points.map((p) => p[0]));
  const zs = floor.rooms.flatMap((r) => r.points.map((p) => p[1]));
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

export default function StoreViewer({
  scene,
  products,
  mode = "shots",
}: {
  scene: StoreScene;
  products: VmdProduct[];
  mode?: "shots" | "orbit";
}) {
  const orbit = mode === "orbit";
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const storageKey = `vmd-layout:${scene.projectId}`;
  const swapKey = `vmd-swaps:${scene.projectId}`;
  const rackKey = `vmd-racks:${scene.projectId}`;
  const levelKey = `vmd-levels:${scene.projectId}`;
  const pictureKey = scene.projectId;
  const slotClickRef = useRef<(slotId: string) => void>(() => {});
  // slot numbers stay hidden until '상품 표시' is on; the engine reads this for clicks/cursor
  const showSlotsRef = useRef(false);

  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [shot, setShot] = useState<SceneShot | null>(scene.shots[0] ?? null);
  const [compare, setCompare] = useState(false);
  const [tab, setTab] = useState<"shots" | "products" | "placed">("shots");
  const [placed, setPlaced] = useState<{ uid: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [swaps, setSwaps] = useState<Swaps>({});
  const [pictures, setPictures] = useState<Record<string, string>>({}); // item id -> file name
  const [rackCounts, setRackCounts] = useState<Record<string, number>>({});
  const [rackSides, setRackSides] = useState<Record<string, boolean>>({});
  const [rackHover, setRackHover] = useState<string | null>(null);
  const [levelDys, setLevelDys] = useState<Record<string, number>>({});
  // 옆걸이 촘촘히 - one setting for every page (the engine reads the ref when it starts)
  const [dense, setDenseState] = useState(() => pageMemory.get(DENSE_KEY) !== "0");
  const denseRef = useRef(dense);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [showSlots, setShowSlots] = useState(false);
  showSlotsRef.current = showSlots;
  slotClickRef.current = (slotId) => pickSlot(slotId);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    // a render shot holds still: supersample it (2x) so edges, pegboard holes and labels stay crisp
    renderer.setPixelRatio(orbit ? Math.min(window.devicePixelRatio, 2) : Math.min(Math.max(window.devicePixelRatio, 1) * 2, 3));
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.localClippingEnabled = true; // SceneItem.clip
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.filter = CANVAS_GRADE;
    host.appendChild(renderer.domElement);

    const world = new THREE.Scene();
    world.background = new THREE.Color(0xe4e7eb);
    const pmrem = new THREE.PMREMGenerator(renderer);
    world.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    world.environmentIntensity = 0.55;
    // warm, like the renders' 5,700-5,800 K world/interior light
    world.add(new THREE.HemisphereLight(0xfff4ea, 0x9a9389, 0.45));
    const sun = new THREE.DirectionalLight(0xfff1e0, 1.0);
    sun.position.set(-8, 20, 6);
    world.add(sun);

    const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.05, 1000);

    // ---------------------------------------------------------------- store (mm)
    const store = new THREE.Group();
    store.scale.setScalar(0.001);
    world.add(store);

    const floorGroups = new Map<string, THREE.Group>();
    const ceilings: THREE.Object3D[] = [];
    const drawings: THREE.Object3D[] = [];
    const staticMeshes: THREE.Mesh[] = []; // walls + floors, always raycast
    const itemHolders: THREE.Object3D[] = []; // furniture, raycast via box pre-filter
    const itemBoxes = new Map<THREE.Object3D, THREE.Box3>();
    const itemById = new Map<string, THREE.Group>();

    const wallMats = new Map<number, THREE.Material>();
    const wallMat = (color: number) => {
      let m = wallMats.get(color);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
        wallMats.set(color, m);
      }
      return m;
    };

    const loader = new GLTFLoader();
    const modelCache = new Map<string, Promise<THREE.Object3D>>();
    const loadModel = (url: string) => {
      let p = modelCache.get(url);
      if (!p) {
        p = loader.loadAsync(url).then((gltf: GLTF) => {
          sharpen(gltf.scene, anisotropy);
          return gltf.scene;
        });
        modelCache.set(url, p);
      }
      return p;
    };

    const textureLoader = new THREE.TextureLoader();
    let drawingOn = false;
    let total = 0;
    let done = 0;
    const bump = () => {
      done += 1;
      if (!disposed) setProgress({ done, total });
    };

    for (const floor of scene.floors) {
      const g = new THREE.Group();
      g.name = floor.title;
      g.position.y = floor.level;
      store.add(g);
      floorGroups.set(floor.id, g);

      for (const room of floor.rooms) {
        const geo = new THREE.ShapeGeometry(roomShape(room.points));
        geo.rotateX(-Math.PI / 2);
        const color = room.color && room.color.toLowerCase() !== "ffffff" ? hexColor(room.color, FLOOR_DEFAULT) : FLOOR_DEFAULT;
        const floorMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
        floorMesh.userData.surface = "floor";
        g.add(floorMesh);
        staticMeshes.push(floorMesh);

        // the renders show a bright, evenly lit ceiling - unlit so it doesn't go grey
        const ceil = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: 0xf1f0ed, side: THREE.DoubleSide }));
        ceil.position.y = room.height;
        g.add(ceil);
        ceilings.push(ceil);
      }

      for (const wall of floor.walls) {
        const [ax, az] = wall.a;
        const [bx, bz] = wall.b;
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1) continue;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(len + wall.thickness, wall.height, wall.thickness),
          wallMat(hexColor(wall.color, 0xf2f2f2)),
        );
        mesh.position.set((ax + bx) / 2, wall.height / 2, (az + bz) / 2);
        mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
        mesh.userData.surface = "wall";
        g.add(mesh);
        staticMeshes.push(mesh);
      }

      // 준공도면 overlay: outline px <-> room bounds +- half wall (docs §4)
      const page = floor.drawing;
      if (page?.outlinePx) {
        const o = page.outlinePx;
        const b = floorBounds(floor);
        const half = (floor.walls[0]?.thickness ?? 200) / 2;
        const sx = (b.maxX - b.minX + 2 * half) / (o.right - o.left);
        const sz = (b.maxZ - b.minZ + 2 * half) / (o.bottom - o.top);
        textureLoader.load(page.url, (tex) => {
          if (disposed) return;
          tex.colorSpace = THREE.SRGBColorSpace;
          const img = tex.image as { width: number; height: number };
          const w = img.width * sx;
          const d = img.height * sz;
          const geo = new THREE.PlaneGeometry(w, d);
          geo.rotateX(-Math.PI / 2);
          const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            blending: THREE.MultiplyBlending,
            premultipliedAlpha: true,
            depthWrite: false,
          });
          const plane = new THREE.Mesh(geo, mat);
          // image pixel (u, v) -> x = minX - half + (u - left) * sx, z = minZ - half + (v - top) * sz
          plane.position.set(
            b.minX - half + (img.width / 2 - o.left) * sx,
            4,
            b.minZ - half + (img.height / 2 - o.top) * sz,
          );
          plane.renderOrder = 2;
          plane.visible = drawingOn;
          g.add(plane);
          drawings.push(plane);
        });
      }

      for (const item of floor.items) {
        total += 1;
        const holder = new THREE.Group();
        holder.matrixAutoUpdate = false;
        holder.matrix.fromArray(item.matrix);
        holder.userData.item = item;
        holder.visible = !item.renderHidden;
        // 전체 렌더링 looks in from above: ceiling-hung lights/structures would cover the store
        if (orbit && item.matrix[13] - item.size[1] / 2 > floor.height * 0.6) holder.visible = false;
        g.add(holder);
        itemById.set(item.id, holder);
        loadModel(item.url)
          .then((model) => {
            if (disposed) return;
            const inner = model.clone(true);
            // library glb loads in metres (node scale 0.001) -> back to mm; custom gltf is mm already
            if (item.kind === "glb") inner.scale.multiplyScalar(1000);
            inner.position.set(-item.center[0], -item.center[1], -item.center[2]);
            inner.userData.inner = true;
            holder.add(inner);
            holder.updateMatrixWorld(true);
            if (item.clip) clipModel(inner, (floor.level + item.clip[0]) / 1000, (floor.level + item.clip[1]) / 1000);
            itemHolders.push(holder);
            itemBoxes.set(holder, new THREE.Box3().setFromObject(holder));
            refit(item.id);
          })
          .catch(() => {
            /* a broken model only leaves a gap */
          })
          .finally(bump);
      }
    }
    setProgress({ done, total });

    // ---------------------------------------------------------------- views
    const firstFloor = scene.floors[0];
    const currentFloor = () => scene.floors.find((f) => f.id === activeFloor) ?? firstFloor;
    let activeFloor = firstFloor?.id ?? "all";

    let currentSlots: NonNullable<SceneShot["slots"]> = [];
    const goShot = (s: SceneShot) => {
      currentSlots = s.slots ?? [];
      camera.position.set(s.position[0] / 1000, s.position[1] / 1000, s.position[2] / 1000);
      camera.quaternion.set(...s.quaternion);
      camera.fov = s.fov;
      camera.near = Math.max(s.near, 50) / 1000;
      camera.updateProjectionMatrix();
      for (const c of ceilings) c.visible = true;
      for (const d of drawings) d.visible = false;
      drawingOn = false;
    };

    /** 준공도면 alignment check (docs §4) - not in the UI, called via window.__store */
    const debugTop = (drawingOn_: boolean) => {
      const f = currentFloor();
      if (!f) return;
      drawingOn = drawingOn_;
      for (const d of drawings) d.visible = drawingOn_;
      for (const c of ceilings) c.visible = false;
      const b = floorBounds(f);
      const cx = (b.minX + b.maxX) / 2000;
      const cz = (b.minZ + b.maxZ) / 2000;
      const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 1000;
      // narrow fov from far up = close to orthographic, so wall tops don't
      // balloon over the plan (and the 준공도면 overlay lines up)
      camera.fov = 12;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      camera.position.set(cx, f.level / 1000 + span * 4.6, cz + 0.001);
      camera.lookAt(cx, f.level / 1000, cz);
    };

    // ---------------------------------------------------------------- picking
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const setPointer = (e: { clientX: number; clientY: number }) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
    };

    const visibleOf = (o: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    };

    /** nearest store hit: walls/floors directly, furniture only where the ray enters its box */
    const hitStore = (): THREE.Intersection | null => {
      // a render shot clips everything closer than its camera clip (walls in front of an
      // outside camera) - the pick must skip the same invisible geometry
      raycaster.near = camera.near;
      let best: THREE.Intersection | null = null;
      for (const hit of raycaster.intersectObjects(staticMeshes.filter(visibleOf), false)) {
        best = hit;
        break;
      }
      const tmp = new THREE.Vector3();
      const candidates: { holder: THREE.Object3D; d: number }[] = [];
      for (const holder of itemHolders) {
        const box = itemBoxes.get(holder);
        if (!box || !visibleOf(holder)) continue;
        const p = raycaster.ray.intersectBox(box, tmp);
        if (p) candidates.push({ holder, d: p.distanceTo(raycaster.ray.origin) });
      }
      candidates.sort((a, b) => a.d - b.d);
      for (const c of candidates) {
        if (best && c.d > best.distance) break;
        const hits = raycaster.intersectObject(c.holder, true);
        if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
      }
      return best;
    };

    // ---------------------------------------------------------------- VMD products (m)
    const placedMap = new Map<string, Placed>();
    const productById = new Map(products.map((p) => [p.id, p]));
    const productModel = new Map<string, Promise<THREE.Object3D>>();
    let selectedUid: string | null = null;
    const selBox = new THREE.BoxHelper(new THREE.Object3D(), 0x1f6feb);
    selBox.visible = false;
    world.add(selBox);

    const syncPlaced = () => {
      if (disposed) return;
      setPlaced([...placedMap.values()].map((p) => ({ uid: p.uid, name: p.product.name })));
      try {
        pageMemory.set(storageKey, JSON.stringify(exportPlacements()));
      } catch {
        /* storage blocked */
      }
    };

    const select = (uid: string | null) => {
      selectedUid = uid;
      const p = uid ? placedMap.get(uid) : null;
      if (p) {
        selBox.setFromObject(p.holder);
        selBox.visible = true;
      } else selBox.visible = false;
      if (!disposed) setSelected(uid);
    };

    /** a garment glb with its own hook: the top few cm are much narrower than the garment */
    const hookCache = new Map<string, boolean>();
    const hasHook = (id: string, root: THREE.Object3D) => {
      let v = hookCache.get(id);
      if (v !== undefined) return v;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const band = Math.max(0.03, (box.max.y - box.min.y) * 0.04);
      let lo = Infinity;
      let hi = -Infinity;
      const p = new THREE.Vector3();
      root.traverse((o) => {
        const pos = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry.getAttribute("position") : null;
        if (!pos) return;
        for (let i = 0; i < pos.count; i += 1) {
          p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (p.y > box.max.y - band) {
            lo = Math.min(lo, p.x);
            hi = Math.max(hi, p.x);
          }
        }
      });
      v = hi - lo < (box.max.x - box.min.x) * 0.15;
      hookCache.set(id, v);
      return v;
    };

    const loadProduct = (product: VmdProduct) => {
      let p = productModel.get(product.id);
      if (!p) {
        p = loader.loadAsync(product.url).then((gltf: GLTF) => {
          sharpen(gltf.scene, anisotropy);
          return gltf.scene;
        });
        productModel.set(product.id, p);
      }
      return p;
    };

    const spawn = async (product: VmdProduct, position: THREE.Vector3, rotationY: number, uid?: string) => {
      const model = (await loadProduct(product)).clone(true);
      if (disposed) return null;
      const box = new THREE.Box3().setFromObject(model);
      const c = box.getCenter(new THREE.Vector3());
      // pivot: hook (top centre) for hang, base centre for place
      model.position.set(-c.x, product.mount === "hang" ? -box.max.y : -box.min.y, -c.z);
      const holder = new THREE.Group();
      holder.add(model);
      holder.position.copy(position);
      holder.rotation.y = rotationY;
      holder.userData.uid = uid ?? `${product.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      holder.userData.depth = box.max.z - box.min.z;
      world.add(holder);
      const entry: Placed = { uid: holder.userData.uid, product, holder };
      placedMap.set(entry.uid, entry);
      return entry;
    };

    const placeAt = (entry: Placed, hit: THREE.Intersection) => {
      const p = hit.point.clone();
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      if (Math.abs(n.y) < 0.5) {
        // hit a vertical face (wall, panel side): step out by half the product depth
        n.y = 0;
        n.normalize();
        p.addScaledVector(n, (entry.holder.userData.depth as number) / 2 + 0.01);
      }
      entry.holder.position.copy(p);
    };

    function exportPlacements(): Placement[] {
      return [...placedMap.values()].map((p) => ({
        uid: p.uid,
        productId: p.product.id,
        position: [p.holder.position.x, p.holder.position.y, p.holder.position.z],
        rotationY: p.holder.rotation.y,
      }));
    }

    // restore last layout
    try {
      const saved = JSON.parse(pageMemory.get(storageKey) ?? "[]") as Placement[];
      Promise.all(
        saved.map((s) => {
          const product = productById.get(s.productId);
          return product ? spawn(product, new THREE.Vector3(...s.position), s.rotationY, s.uid) : null;
        }),
      ).then(() => syncPlaced());
    } catch {
      /* nothing saved */
    }

    // ---------------------------------------------------------------- slot swaps (store item -> VMD product)
    const swapped = new Map<string, THREE.Group>(); // item id -> product holder
    /** item top centre (its hook, side 1) or base centre (side -1), world metres.
     * holder origin is the bbox centre and its local units are the model's mm. */
    const slotPoint = (holder: THREE.Group, side: 1 | -1 = 1) => {
      const item = holder.userData.item as StoreScene["floors"][number]["items"][number];
      holder.updateWorldMatrix(true, false);
      return holder.localToWorld(new THREE.Vector3(0, (side * item.size[1]) / 2, 0));
    };
    const saveSwaps = () => {
      const out: Swaps = {};
      for (const [itemId, h] of swapped) out[itemId] = h.userData.productId as string;
      try {
        pageMemory.set(swapKey, JSON.stringify(out));
      } catch {
        /* storage blocked */
      }
      if (!disposed) setSwaps(out);
    };
    let refit: (itemId: string) => void = () => {}; // a rack garment changed size: keep it inside (set below)
    let dense = denseRef.current;
    const sideOf = new Map<string, boolean>(); // rack garment item id -> hung side-on (else face-out), per its rack
    /** the yaw (deg) and depth share a product swapped into this slot gets */
    const swapPose = (item: SceneItem) => {
      const side = sideOf.get(item.id);
      if (side === undefined) return { facing: item.facing, depth: item.swapDepth && dense ? item.swapDepth : 1 };
      return { facing: side ? 90 : 0, depth: side && dense && item.thin ? (item.swapDepth ?? SIDE_SWAP) : 1 };
    };
    /** a rack garment turned side-on / face-out and pressed thin (side-on + 촘촘히) or not, where it hangs now */
    const orient = (holder: THREE.Group) => {
      const item = holder.userData.item as SceneItem;
      const side = sideOf.get(item.id);
      if (side === undefined) return;
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      new THREE.Matrix4().fromArray(item.matrix).decompose(pos, q, sc);
      const full = item.facing === 90 && item.thin ? sc.z / item.thin : sc.z; // depth scale before pressing
      sc.z = side && dense && item.thin ? full * item.thin : full;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side ? Math.PI / 2 : 0);
      pos.fromArray(holder.matrix.elements, 12);
      holder.matrix.compose(pos, q, sc);
      holder.matrixWorldNeedsUpdate = true;
      holder.updateWorldMatrix(true, true);
      if (itemBoxes.has(holder)) itemBoxes.set(holder, new THREE.Box3().setFromObject(holder));
      const h = swapped.get(item.id);
      if (h) {
        const pose = swapPose(item);
        h.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((pose.facing ?? 0) * Math.PI) / 180);
        h.scale.set(1, 1, pose.depth);
      }
    };
    const swapping = new Map<string, object>(); // item id -> latest setSwap call: an older one that resolves late drops out
    const setSwap = async (itemId: string, product: VmdProduct | null) => {
      const original = itemById.get(itemId);
      if (!original) return;
      const call = {};
      swapping.set(itemId, call);
      const prev = swapped.get(itemId);
      if (prev) {
        world.remove(prev);
        swapped.delete(itemId);
      }
      const item = original.userData.item as { renderHidden?: boolean };
      if (!product) {
        original.visible = !item.renderHidden && !rackHidden.has(itemId);
        saveSwaps();
        refit(itemId);
        return;
      }
      const slotItem = original.userData.item as SceneItem;
      const src = await loadProduct(product);
      // the slot can say how its products sit (a bag on a shelf stands; hung on a hook it hangs)
      const mount = slotItem.mount ?? product.mount;
      const onHanger =
        !!scene.hanger && mount === "hang" && product.path[0] !== "가방" && slotItem.fit !== "model" && !hasHook(product.id, src);
      const hanger = onHanger ? (await loadModel(scene.hanger ?? "")).clone(true) : null;
      if (disposed || swapping.get(itemId) !== call) return;
      const model = src.clone(true);
      const h = new THREE.Group();
      h.add(model);
      if (slotItem.fit === "model") {
        // same frame as the item: placed exactly like it (metres -> the holder's mm, bbox centre at the origin)
        model.scale.multiplyScalar(1000);
        model.position.set(-slotItem.center[0], -slotItem.center[1], -slotItem.center[2]);
        original.updateWorldMatrix(true, false);
        original.matrixWorld.decompose(h.position, h.quaternion, h.scale);
      } else {
        const box = new THREE.Box3().setFromObject(model);
        const c = box.getCenter(new THREE.Vector3());
        // hang from the item's hook point (or stand on its base), facing the same way as the item
        model.position.set(-c.x, mount === "hang" ? -box.max.y - (hanger ? HANGER_DROP : 0) : -box.min.y, -c.z);
        // hook top at the slot's hook point, the garment's shoulders on it
        if (hanger) h.add(hanger);
        const q = new THREE.Quaternion();
        // 매장연출 slots say which way the product faces; otherwise follow the item
        const pose = swapPose(slotItem);
        if (pose.facing !== undefined) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (pose.facing * Math.PI) / 180);
        else original.getWorldQuaternion(q);
        h.quaternion.copy(q);
        h.scale.set(1, 1, pose.depth);
        h.position.copy(slotPoint(original, mount === "hang" ? 1 : -1));
      }
      h.userData.productId = product.id;
      h.userData.slotItem = itemId;
      const clip = slotItem.clip;
      if (clip) {
        const level = original.parent?.position.y ?? 0; // floor group, mm
        clipModel(model, (level + clip[0]) / 1000, (level + clip[1]) / 1000);
      }
      world.add(h);
      swapped.set(itemId, h);
      original.visible = false;
      saveSwaps();
      refit(itemId);
    };
    try {
      // nothing saved for this page yet: the slots' own products (SceneSlot.product)
      const kept = pageMemory.get(swapKey);
      const allSlots = scene.shots.flatMap((s) => s.slots ?? []);
      const saved: Swaps = kept
        ? (JSON.parse(kept) as Swaps)
        : Object.fromEntries(allSlots.flatMap((x) => (x.product ? [[x.itemId, x.product] as const] : [])));
      for (const [itemId, productId] of Object.entries(saved)) {
        const cat = allSlots.find((x) => x.itemId === itemId)?.category;
        const product = productById.get(productId) ?? productById.get(`${cat}/${productId}`);
        if (product) setSwap(itemId, product);
      }
    } catch {
      /* nothing saved */
    }
    // ---------------------------------------------------------------- racks (garment count per rail / loop / arm)
    const racks = scene.shots.flatMap((s) => s.racks ?? []);
    const slotItem = new Map(scene.shots.flatMap((s) => (s.slots ?? []).map((x) => [x.id, x.itemId] as const)));
    const rackOf = new Map<string, SceneRack>(); // item id -> its rack
    for (const r of racks) for (const sid of r.slotIds) rackOf.set(slotItem.get(sid) ?? "", r);
    const rackItems = (r: SceneRack) => r.slotIds.map((sid) => slotItem.get(sid) ?? "");
    const rackHidden = new Set<string>(); // item ids past their rack's count
    const counts = new Map<string, number>();
    const spots = new Map<string, number[]>(); // rack id -> mm along from -> to of each shown garment
    const rackDy = new Map<string, number>(); // rack id -> mm its level moved it up
    const saveRacks = () => {
      const sideOfRack = (r: SceneRack) => sideOf.get(rackItems(r)[0]) ?? false;
      const out = Object.fromEntries(
        racks.map((r) => [r.id, { n: counts.get(r.id) ?? r.count, t: spots.get(r.id), side: sideOfRack(r) }]),
      );
      try {
        pageMemory.set(rackKey, JSON.stringify(out));
      } catch {
        /* storage blocked */
      }
      if (!disposed) {
        setRackCounts(Object.fromEntries(counts));
        setRackSides(Object.fromEntries(racks.map((r) => [r.id, sideOfRack(r)])));
      }
    };
    const rackLine = (r: SceneRack) => {
      const a = new THREE.Vector3(...r.from);
      const len = a.distanceTo(new THREE.Vector3(...r.to));
      const dir = len > 0 ? new THREE.Vector3(...r.to).sub(a).divideScalar(len) : new THREE.Vector3();
      a.y += rackDy.get(r.id) ?? 0; // after dir: a moved rack stays level
      return { a, len, dir };
    };
    // each garment's own drop from the rack line (mixed racks: a padding hangs shorter than trousers), as built
    const drop = new Map<string, THREE.Vector3>();
    for (const r of racks) {
      const { a, len, dir } = rackLine(r);
      for (const id of rackItems(r)) {
        const holder = itemById.get(id);
        if (!holder) continue;
        const c = new THREE.Vector3().fromArray(holder.matrix.elements, 12);
        const t = len > 0 ? c.clone().sub(a).dot(dir) : 0;
        drop.set(id, c.sub(a.clone().addScaledVector(dir, t)));
      }
    }
    /** move one garment to `t` mm along its rack (its swapped product follows) */
    const putOnRack = (r: SceneRack, itemId: string, t: number) => {
      const holder = itemById.get(itemId);
      if (!holder) return;
      const { a, dir } = rackLine(r);
      const before = holder.getWorldPosition(new THREE.Vector3());
      const p = a.addScaledVector(dir, t).add(drop.get(itemId) ?? new THREE.Vector3());
      // face-out along a rail: each next garment hangs 30 mm further back, layered instead of cutting into each other
      if (sideOf.get(itemId) === false && r.anchor !== "start")
        p.addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), -30 * rackItems(r).indexOf(itemId));
      holder.matrix.elements[12] = p.x;
      holder.matrix.elements[13] = p.y;
      holder.matrix.elements[14] = p.z;
      holder.matrixWorldNeedsUpdate = true; // three 0.18x: a hand-set matrix is not picked up otherwise
      holder.updateWorldMatrix(true, true);
      if (itemBoxes.has(holder)) itemBoxes.set(holder, new THREE.Box3().setFromObject(holder));
      const h = swapped.get(itemId);
      if (h) h.position.add(holder.getWorldPosition(new THREE.Vector3()).sub(before));
    };
    /** half the shown garment's (product or item) width along the rack, mm; 0 while it loads */
    const halfAlong = (itemId: string, dir: THREE.Vector3) => {
      const o = swapped.get(itemId) ?? itemById.get(itemId);
      const b = o ? new THREE.Box3().setFromObject(o) : null;
      if (!b || b.isEmpty()) return 0;
      const sz = b.getSize(new THREE.Vector3()); // world m
      return ((Math.abs(dir.x) * sz.x + Math.abs(dir.z) * sz.z) / 2) * 1000;
    };
    /** t (mm along the rack) where the whole garment stays inside the rack's bounds (or on the rack) */
    const keepInside = (r: SceneRack, itemId: string, t: number) => {
      const { len, dir } = rackLine(r);
      if (!r.bounds) return Math.min(Math.max(t, 0), len);
      const hw = halfAlong(itemId, dir);
      const [lo, hi] = [r.bounds[0] + hw, r.bounds[1] - hw];
      return lo > hi ? (r.bounds[0] + r.bounds[1]) / 2 : Math.min(Math.max(t, lo), hi);
    };
    const fitRack = (r: SceneRack) => {
      const ts = spots.get(r.id);
      if (!ts || !r.bounds) return;
      rackItems(r)
        .slice(0, ts.length)
        .forEach((id, i) => {
          const t = keepInside(r, id, ts[i]);
          if (Math.abs(t - ts[i]) < 0.5) return;
          ts[i] = t;
          putOnRack(r, id, t);
        });
    };
    /** show n garments: at `ts` (mm along the rack, as dragged) or spread evenly */
    const layoutRack = (r: SceneRack, n: number, ts?: number[]) => {
      const ids = rackItems(r);
      n = Math.max(0, Math.min(n, ids.length));
      counts.set(r.id, n);
      const { len } = rackLine(r);
      const had = spots.get(r.id);
      if (ts?.length !== n && had && r.anchor !== "start") {
        // keep where the shown ones hang: drop the last ones, or add each new one where it has the most room
        ts = had.slice(0, n);
        while (ts.length < n) {
          const sorted = [...ts].sort((p, q) => p - q);
          const spots_ = [0, len, ...sorted.slice(1).map((t, i) => (t + sorted[i]) / 2)];
          const room = (t: number) => Math.min(...sorted.map((u) => Math.abs(u - t)));
          ts.push(sorted.length ? spots_.reduce((best, t) => (room(t) > room(best) ? t : best)) : len / 2);
        }
      }
      if (ts?.length !== n) {
        const step =
          r.anchor === "start"
            ? (r.gap ?? (ids.length > 1 ? len / (ids.length - 1) : 0))
            : n > 1
              ? Math.min(len / (n - 1), r.gap ?? Infinity)
              : 0;
        const start = r.anchor === "start" ? 0 : (len - step * (n - 1)) / 2;
        ts = Array.from({ length: n }, (_, i) => start + step * i);
      }
      spots.set(r.id, ts);
      ids.forEach((itemId, i) => {
        const holder = itemById.get(itemId);
        if (!holder) return;
        if (i >= n) {
          if (swapped.has(itemId)) void setSwap(itemId, null);
          rackHidden.add(itemId);
          holder.visible = false;
          return;
        }
        rackHidden.delete(itemId);
        putOnRack(r, itemId, ts[i]);
        holder.visible = !swapped.has(itemId) && !(holder.userData.item as SceneItem).renderHidden;
      });
      fitRack(r);
      saveRacks();
    };
    const removeFromRack = (itemId: string) => {
      const r = rackOf.get(itemId);
      if (!r) return;
      const ids = rackItems(r);
      const n = counts.get(r.id) ?? r.count;
      const k = ids.indexOf(itemId);
      if (k < 0 || k >= n) return;
      // products shift up one place: garment i takes what garment i + 1 wore - and where it hung,
      // so the others stay put and only this one is gone
      const wore = ids.slice(0, n).map((id) => swapped.get(id)?.userData.productId as string | undefined);
      wore.splice(k, 1);
      const ts = [...(spots.get(r.id) ?? [])];
      ts.splice(k, 1);
      // move first (garment i -> where i + 1 hung), then swap: setSwap places a product at its garment
      layoutRack(r, n - 1, ts);
      ids.slice(k, n - 1).forEach((id, j) => {
        const pid = wore[k + j];
        if (pid === (swapped.get(id)?.userData.productId as string | undefined)) return;
        void setSwap(id, pid ? (productById.get(pid) ?? null) : null);
      });
    };
    try {
      const saved = JSON.parse(pageMemory.get(rackKey) ?? "{}") as Record<
        string,
        number | { n: number; t?: number[]; side?: boolean }
      >;
      for (const r of racks) {
        const s = saved[r.id];
        const built = (itemById.get(rackItems(r)[0])?.userData.item as SceneItem | undefined)?.facing === 90;
        const side = typeof s === "object" && s.side !== undefined ? s.side : built;
        for (const id of rackItems(r)) sideOf.set(id, side);
        if (typeof s === "number") layoutRack(r, s);
        else layoutRack(r, s?.n ?? r.count, s?.t);
      }
    } catch {
      for (const r of racks) layoutRack(r, r.count);
    }
    for (const r of racks) for (const id of rackItems(r)) orient(itemById.get(id) as THREE.Group);
    refit = (itemId) => {
      const r = rackOf.get(itemId);
      if (r?.bounds && !rackHidden.has(itemId)) {
        fitRack(r);
        saveRacks();
      }
    };
    const rackBox = new THREE.Box3();
    const rackHelper = new THREE.Box3Helper(rackBox, 0xe8590c);
    rackHelper.visible = false;
    world.add(rackHelper);
    const highlightRack = (rackId: string | null) => {
      const r = rackId ? racks.find((x) => x.id === rackId) : undefined;
      rackBox.makeEmpty();
      if (r)
        for (const id of rackItems(r).slice(0, counts.get(r.id) ?? r.count)) {
          const o = swapped.get(id) ?? itemById.get(id);
          if (o) rackBox.expandByObject(o);
        }
      rackHelper.visible = !rackBox.isEmpty();
    };

    // drag a garment along its rack
    /** pointer ray -> mm along the rack, or null when the rack runs into the view (arms seen from the front) */
    const rackUnderRay = (r: SceneRack): number | null => {
      const parent = itemById.get(rackItems(r)[0])?.parent;
      const { len } = rackLine(r);
      if (!parent || len <= 0) return null;
      parent.updateWorldMatrix(true, false);
      const up = new THREE.Vector3(0, rackDy.get(r.id) ?? 0, 0);
      const a = new THREE.Vector3(...r.from).add(up).applyMatrix4(parent.matrixWorld);
      const b = new THREE.Vector3(...r.to).add(up).applyMatrix4(parent.matrixWorld);
      const lenW = a.distanceTo(b);
      const u = b.sub(a).divideScalar(lenW);
      const d = raycaster.ray.direction;
      const w0 = a.sub(raycaster.ray.origin);
      const c = u.dot(d);
      if (Math.abs(c) > 0.9) return null;
      // closest point of the rack line to the ray
      return ((c * d.dot(w0) - u.dot(w0)) / (1 - c * c)) * (len / lenW);
    };
    // ---------------------------------------------------------------- levels (shelves / rails up and down)
    const levels = scene.shots.flatMap((s) => s.levels ?? []);
    const levelDy = new Map<string, number>();
    const saveLevels = () => {
      const out = Object.fromEntries(levelDy);
      try {
        pageMemory.set(levelKey, JSON.stringify(out));
      } catch {
        /* storage blocked */
      }
      if (!disposed) setLevelDys(out);
    };
    const shiftItem = (itemId: string, d: number) => {
      const holder = itemById.get(itemId);
      if (!holder) return;
      const before = holder.getWorldPosition(new THREE.Vector3());
      holder.matrix.elements[13] += d;
      holder.matrixWorldNeedsUpdate = true; // three 0.18x: a hand-set matrix is not picked up otherwise
      holder.updateWorldMatrix(true, true);
      if (itemBoxes.has(holder)) itemBoxes.set(holder, new THREE.Box3().setFromObject(holder));
      const h = swapped.get(itemId);
      if (h) h.position.add(holder.getWorldPosition(new THREE.Vector3()).sub(before));
    };
    const levelTo = (lv: SceneLevel, dy: number) => {
      const y = Math.min(Math.max(lv.y + dy, lv.min), lv.max);
      dy = Math.round((y - lv.y) / lv.step) * lv.step;
      const d = dy - (levelDy.get(lv.id) ?? 0);
      if (!d) return false;
      levelDy.set(lv.id, dy);
      for (const id of lv.itemIds) shiftItem(id, d);
      for (const rid of lv.rackIds ?? []) {
        const r = racks.find((x) => x.id === rid);
        if (!r) continue;
        rackDy.set(rid, (rackDy.get(rid) ?? 0) + d);
        const ts = spots.get(rid) ?? [];
        rackItems(r).slice(0, ts.length).forEach((id, i) => putOnRack(r, id, ts[i]));
      }
      return true;
    };
    try {
      const saved = JSON.parse(pageMemory.get(levelKey) ?? "{}") as Record<string, number>;
      for (const lv of levels) if (saved[lv.id]) levelTo(lv, saved[lv.id]);
      if (levels.length) saveLevels();
    } catch {
      /* nothing saved */
    }
    const levelOf = new Map<THREE.Object3D, SceneLevel>(); // grabbable board / rail holder -> its level
    const slotItemIds = new Set(scene.shots.flatMap((s) => (s.slots ?? []).map((x) => x.itemId)));
    for (const lv of levels)
      for (const id of lv.itemIds) {
        const holder = itemById.get(id);
        if (holder && !slotItemIds.has(id)) levelOf.set(holder, lv);
      }
    const levelUnderPointer = () => {
      let best: { d: number; lv: SceneLevel; p: THREE.Vector3; holder: THREE.Object3D } | null = null;
      for (const [holder, lv] of levelOf) {
        if (!holder.visible) continue;
        const hit = raycaster.intersectObject(holder, true)[0];
        if (hit && (!best || hit.distance < best.d)) best = { d: hit.distance, lv, p: hit.point, holder };
      }
      return best;
    };
    const highlightLevel = (levelId: string | null) => {
      const lv = levelId ? levels.find((x) => x.id === levelId) : undefined;
      rackBox.makeEmpty();
      if (lv) {
        const ids = [...lv.itemIds];
        for (const rid of lv.rackIds ?? []) {
          const r = racks.find((x) => x.id === rid);
          if (r) ids.push(...rackItems(r).slice(0, counts.get(r.id) ?? r.count));
        }
        for (const id of ids) {
          const o = swapped.get(id) ?? itemById.get(id);
          if (o) rackBox.expandByObject(o);
        }
      }
      rackHelper.visible = !rackBox.isEmpty();
    };
    /** a vertical drag: plane through the grab point facing the camera; y in the level's (floor) mm */
    let lift: { lv: SceneLevel; plane: THREE.Plane; y0: number; dy0: number; parent: THREE.Object3D } | null = null;
    const liftY = () => {
      if (!lift) return null;
      const p = raycaster.ray.intersectPlane(lift.plane, new THREE.Vector3());
      return p ? lift.parent.worldToLocal(p).y : null;
    };

    let drag: { r: SceneRack; i: number; slot: string; x: number; y: number; moved: boolean } | null = null;
    const draggable = (slotId: string | null) => {
      const itemId = slotId ? slotItem.get(slotId) : undefined;
      const r = itemId ? rackOf.get(itemId) : undefined;
      return r && rackUnderRay(r) !== null ? { r, i: rackItems(r).indexOf(itemId ?? "") } : null;
    };
    const shownSlots = () => currentSlots.filter((x) => !rackHidden.has(x.itemId));
    const slotAnchorsNow = () => {
      camera.updateMatrixWorld();
      return shownSlots().flatMap((slot) => {
        const holder = itemById.get(slot.itemId);
        if (!holder) return [];
        const p = slotPoint(holder).project(camera);
        return [{ id: slot.id, u: (p.x + 1) / 2, v: (1 - p.y) / 2 }];
      });
    };

    // ---------------------------------------------------------------- image slots (posters, screens)
    const pictures = pagePictures.get(pictureKey) ?? new Map<string, { file: Blob; name: string }>();
    pagePictures.set(pictureKey, pictures);
    const pictureMeshes = new Map<string, THREE.Mesh>();
    const syncPictures = () => {
      if (!disposed) setPictures(Object.fromEntries([...pictures].map(([id, p]) => [id, p.name])));
    };
    const setPicture = async (itemId: string, file: Blob | null, name = "이미지") => {
      const holder = itemById.get(itemId);
      if (!holder) return;
      const prev = pictureMeshes.get(itemId);
      if (prev) {
        holder.remove(prev);
        (prev.material as THREE.MeshBasicMaterial).map?.dispose();
        prev.geometry.dispose();
        pictureMeshes.delete(itemId);
      }
      if (!file) {
        pictures.delete(itemId);
        syncPictures();
        return;
      }
      pictures.set(itemId, { file, name });
      syncPictures();
      // front face of the item's box (holder units = model mm, the matrix scales them)
      const item = holder.userData.item as SceneItem;
      const sx = new THREE.Vector3().setFromMatrixColumn(holder.matrix, 0).length();
      const sy = new THREE.Vector3().setFromMatrixColumn(holder.matrix, 1).length();
      const tex = new THREE.CanvasTexture(await pictureCanvas(file, (item.size[0] * sx) / (item.size[1] * sy)));
      if (disposed || pictures.get(itemId)?.file !== file) return tex.dispose();
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = anisotropy;
      // unlit and outside tone mapping: the file's own colours
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(item.size[0], item.size[1]),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
      );
      plane.position.z = item.size[2] / 2 + 2;
      holder.add(plane);
      pictureMeshes.set(itemId, plane);
    };
    for (const [itemId, p] of pictures) void setPicture(itemId, p.file, p.name);

    /** slot under the pointer: the original item or the product swapped in for it */
    const slotUnderPointer = (kind?: "image"): string | null => {
      if (!currentSlots.length) return null;
      raycaster.near = camera.near;
      let best: { d: number; slot: string } | null = null;
      for (const slot of shownSlots()) {
        if (kind && slot.kind !== kind) continue;
        const target = swapped.get(slot.itemId) ?? itemById.get(slot.itemId);
        if (!target || !target.visible) continue;
        const hit = raycaster.intersectObject(target, true)[0];
        if (hit && (!best || hit.distance < best.d)) best = { d: hit.distance, slot: slot.id };
      }
      return best?.slot ?? null;
    };

    // ---------------------------------------------------------------- input
    // click selects a placed product (no dragging) or opens a slot
    const onPointerDown = (e: PointerEvent) => {
      if (orbit || e.button !== 0) return;
      setPointer(e);
      const holders = [...placedMap.values()].map((p) => p.holder);
      const hit = raycaster.intersectObjects(holders, true)[0];
      if (!hit) {
        const slot = showSlotsRef.current ? slotUnderPointer() : null;
        const d = draggable(slot);
        if (slot && d) {
          // a rack garment: a click (no move) still opens it, on pointerup
          drag = { ...d, slot, x: e.clientX, y: e.clientY, moved: false };
          renderer.domElement.setPointerCapture(e.pointerId);
        } else if (slot) slotClickRef.current(slot);
        else if (showSlotsRef.current) {
          // a shelf board / rail: lift it
          const g = levelUnderPointer();
          if (g?.holder.parent) {
            const n = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
            lift = {
              lv: g.lv,
              plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, g.p),
              y0: 0,
              dy0: levelDy.get(g.lv.id) ?? 0,
              parent: g.holder.parent,
            };
            lift.y0 = liftY() ?? 0;
            renderer.domElement.setPointerCapture(e.pointerId);
            highlightLevel(g.lv.id);
          }
        }
        return;
      }
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.uid) o = o.parent;
      const entry = o ? placedMap.get(o.userData.uid as string) : undefined;
      if (entry) select(entry.uid);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (orbit || !currentSlots.length || !showSlotsRef.current) {
        renderer.domElement.style.cursor = "";
        return;
      }
      setPointer(e);
      if (lift) {
        const y = liftY();
        if (y !== null && levelTo(lift.lv, lift.dy0 + y - lift.y0)) {
          highlightLevel(lift.lv.id);
          setAnchors(slotAnchorsNow());
          saveLevels();
        }
        renderer.domElement.style.cursor = "ns-resize";
        return;
      }
      if (drag) {
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
        drag.moved = true;
        const t = rackUnderRay(drag.r);
        const ts = spots.get(drag.r.id);
        if (t === null || !ts) return;
        const { len } = rackLine(drag.r);
        // only this garment moves; the others stay where they hang
        ts[drag.i] = keepInside(drag.r, rackItems(drag.r)[drag.i], t);
        putOnRack(drag.r, rackItems(drag.r)[drag.i], ts[drag.i]);
        highlightRack(drag.r.id);
        setAnchors(slotAnchorsNow());
        renderer.domElement.style.cursor = "grabbing";
        return;
      }
      const slot = slotUnderPointer();
      renderer.domElement.style.cursor = draggable(slot) ? "grab" : slot ? "pointer" : levelUnderPointer() ? "ns-resize" : "";
    };
    const onPointerUp = (e: PointerEvent) => {
      if (lift) {
        lift = null;
        highlightLevel(null);
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
        return;
      }
      if (!drag) return;
      const { slot, moved } = drag;
      drag = null;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
      if (!moved) {
        if (e.type === "pointerup") slotClickRef.current(slot);
      }
      else {
        saveRacks();
        highlightRack(null);
        renderer.domElement.style.cursor = "grab";
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    // an image file dropped on a poster / screen goes onto it
    const imageFile = (e: DragEvent) => [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/"));
    const onDragOver = (e: DragEvent) => {
      if (orbit || !e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setPointer(e);
      e.dataTransfer.dropEffect = slotUnderPointer("image") ? "copy" : "none";
    };
    const onDrop = (e: DragEvent) => {
      if (orbit) return;
      e.preventDefault();
      const file = imageFile(e);
      if (!file) return;
      setPointer(e);
      const slotId = slotUnderPointer("image");
      const slot = currentSlots.find((x) => x.id === slotId);
      if (slot) void setPicture(slot.itemId, file, file.name);
    };
    renderer.domElement.addEventListener("dragover", onDragOver);
    renderer.domElement.addEventListener("drop", onDrop);

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (orbit || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) return;
      const k = e.key.toLowerCase();
      const sel = selectedUid ? placedMap.get(selectedUid) : null;
      if (sel && (k === "q" || k === "e")) {
        sel.holder.rotation.y += (k === "q" ? 1 : -1) * (Math.PI / 12);
        selBox.setFromObject(sel.holder);
        syncPlaced();
        return;
      }
      if (sel && (k === "z" || k === "x")) {
        sel.holder.position.y += k === "x" ? 0.02 : -0.02;
        selBox.setFromObject(sel.holder);
        syncPlaced();
        return;
      }
      if (sel && (k === "delete" || k === "backspace")) {
        removeSelected();
        return;
      }
      if (k === "escape") select(null);
    };
    window.addEventListener("keydown", onKeyDown);

    // 전체 렌더링: held move keys / pad buttons, applied per frame in tick
    const held = new Set<string>();
    const onMoveKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!orbit || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) return;
      const k = e.key.toLowerCase();
      if (!MOVE_KEYS[k]) return;
      e.preventDefault(); // arrows would scroll the page
      if (e.type === "keydown") held.add(k);
      else held.delete(k);
    };
    const releaseAll = () => held.clear();
    window.addEventListener("keydown", onMoveKey);
    window.addEventListener("keyup", onMoveKey);
    window.addEventListener("blur", releaseAll);

    function removeSelected() {
      const sel = selectedUid ? placedMap.get(selectedUid) : null;
      if (!sel) return;
      world.remove(sel.holder);
      placedMap.delete(sel.uid);
      select(null);
      syncPlaced();
    }

    // ---------------------------------------------------------------- 전체 렌더링 (orbit)
    let controls: OrbitControls | null = null;
    const overview = () => {
      const f = currentFloor();
      if (!f || !controls) return;
      const b = floorBounds(f);
      const y = f.level / 1000;
      const center = new THREE.Vector3((b.minX + b.maxX) / 2000, y + 0.6, (b.minZ + b.maxZ) / 2000);
      const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 1000;
      // dollhouse: ceilings off, looking down at ~50deg from the front-left corner
      for (const c of ceilings) c.visible = false;
      camera.fov = 40;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      camera.position.copy(center).add(new THREE.Vector3(-0.45, 1.25, 0.95).multiplyScalar(span * 0.95));
      controls.target.copy(center);
      controls.update();
    };
    if (orbit) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI * 0.49; // stay above the floor
      controls.minDistance = 1;
      controls.maxDistance = 120;
      controls.screenSpacePanning = true;
      // right drag turns the view, left drag slides it
      controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
      controls.rotateSpeed = 0.8;
    }

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const step = new THREE.Vector3();
    /** slide camera + orbit target together, along the floor relative to the view */
    const moveBy = (dt: number) => {
      if (!controls || !held.size) return;
      forward.subVectors(controls.target, camera.position).setY(0);
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      step.set(0, 0, 0);
      for (const k of held) {
        const [x, y, z] = MOVE_KEYS[k];
        step.addScaledVector(right, x).addScaledVector(forward, z);
        step.y += y;
      }
      if (step.lengthSq() === 0) return;
      // faster when zoomed out, so a big store doesn't crawl
      const speed = Math.max(1, camera.position.distanceTo(controls.target) * 0.3);
      step.normalize().multiplyScalar(speed * dt);
      camera.position.add(step);
      controls.target.add(step);
    };

    // ---------------------------------------------------------------- loop
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      moveBy(Math.min((now - last) / 1000, 0.1));
      last = now;
      controls?.update();
      renderer.render(world, camera);
    };
    tick();

    const onResize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    // ---------------------------------------------------------------- API for the React UI
    engineRef.current = {
      setFloor(floorMode) {
        activeFloor = floorMode;
        for (const [id, g] of floorGroups) g.visible = floorMode === "all" || id === floorMode;
        overview();
      },
      resetView: overview,
      hold(key, on) {
        if (on) held.add(key);
        else held.delete(key);
      },
      goShot,
      addProduct(product) {
        // drop where the view centre meets the store; else just past the camera clip at eye height
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hit = hitStore();
        const f = currentFloor();
        const fallback = camera.position
          .clone()
          .add(new THREE.Vector3(0, 0, -Math.max(2.5, camera.near + 0.8)).applyQuaternion(camera.quaternion))
          .setY((f?.level ?? 0) / 1000 + (product.mount === "hang" ? EYE_M : 0));
        spawn(product, fallback, 0).then((entry) => {
          if (!entry) return;
          // a far hit (back wall across the store) would drop it out of sight - keep it close
          if (hit && hit.distance < 6) placeAt(entry, hit);
          select(entry.uid);
          syncPlaced();
        });
      },
      removeSelected,
      clearPlacements() {
        for (const p of placedMap.values()) world.remove(p.holder);
        placedMap.clear();
        select(null);
        syncPlaced();
      },
      exportPlacements,
      slotAnchors: slotAnchorsNow,
      setSwap(itemId, product) {
        void setSwap(itemId, product);
      },
      highlightSlot(itemId) {
        const target = itemId ? (swapped.get(itemId) ?? itemById.get(itemId)) : undefined;
        if (!target) {
          if (!selectedUid) selBox.visible = false;
          return;
        }
        selBox.setFromObject(target);
        selBox.visible = true;
      },
      setPicture(itemId, file, name) {
        void setPicture(itemId, file, name);
      },
      setRackCount(rackId, n) {
        const r = racks.find((x) => x.id === rackId);
        if (r) layoutRack(r, n);
      },
      setRackSide(rackId, side) {
        const r = racks.find((x) => x.id === rackId);
        if (!r) return;
        for (const id of rackItems(r)) {
          sideOf.set(id, side);
          const holder = itemById.get(id);
          if (holder) orient(holder);
        }
        spots.delete(r.id); // spread evenly again for the new way of hanging
        layoutRack(r, counts.get(r.id) ?? r.count);
      },
      removeFromRack,
      highlightRack,
      setLevel(levelId, dy) {
        const lv = levels.find((x) => x.id === levelId);
        if (lv && levelTo(lv, dy)) {
          saveLevels();
          highlightLevel(levelId);
        }
      },
      highlightLevel,
      setDense(on) {
        dense = on;
        for (const [itemId, h] of swapped) {
          const item = itemById.get(itemId)?.userData.item as SceneItem | undefined;
          if (item) h.scale.z = swapPose(item).depth;
        }
        for (const holder of itemById.values()) orient(holder);
        for (const r of racks) fitRack(r);
        saveRacks();
      },
      snapshot(width) {
        const size = renderer.getSize(new THREE.Vector2());
        const ratio = renderer.getPixelRatio();
        const height = Math.round((width * size.y) / size.x);
        const boxOn = selBox.visible;
        const rackOn = rackHelper.visible;
        selBox.visible = rackHelper.visible = false;
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        renderer.render(world, camera);
        // the CSS grade only colours the on-screen canvas - bake it into the file
        const out = document.createElement("canvas");
        out.width = width;
        out.height = height;
        const ctx = out.getContext("2d")!;
        ctx.filter = CANVAS_GRADE;
        ctx.drawImage(renderer.domElement, 0, 0);
        renderer.setPixelRatio(ratio);
        renderer.setSize(size.x, size.y, false);
        selBox.visible = boxOn;
        rackHelper.visible = rackOn;
        renderer.render(world, camera);
        return out.toDataURL("image/png");
      },
    };
    const first = scene.shots[0];
    const firstShotFloor = first ? scene.floors.find((f) => f.id === first.floorId) : undefined;
    engineRef.current.setFloor(firstShotFloor?.id ?? activeFloor);
    if (!orbit && first) goShot(first);
    if (!orbit) setAnchors(engineRef.current.slotAnchors());
    // handle for headless checks (scripts / devtools): projection, placement and 준공도면 tests
    (window as unknown as { __store?: unknown }).__store = {
      THREE,
      camera,
      world,
      store,
      floorGroups,
      renderer,
      ceilings,
      debugTop,
    };

    return () => {
      disposed = true;
      engineRef.current = null;
      cancelAnimationFrame(raf);
      controls?.dispose();
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onMoveKey);
      window.removeEventListener("keyup", onMoveKey);
      window.removeEventListener("blur", releaseAll);
      renderer.domElement.removeEventListener("dragover", onDragOver);
      renderer.domElement.removeEventListener("drop", onDrop);
      pmrem.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [scene, products, storageKey, swapKey, rackKey, levelKey, pictureKey, orbit]);

  // ---------------------------------------------------------------- UI
  const e = () => engineRef.current;
  const loading = progress.total > 0 && progress.done < progress.total;
  const missing = scene.floors.reduce((n, f) => n + f.missing.reduce((m, x) => m + x.count, 0), 0);
  const floorLabel = (s: SceneShot) =>
    `${scene.floors.find((f) => f.id === s.floorId)?.title.replace("Floor ", "") ?? "?"}F`;

  const download = () => {
    const data = e()?.exportPlacements() ?? [];
    const blob = new Blob([JSON.stringify({ projectId: scene.projectId, placements: data }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vmd-layout-${scene.projectId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage(`${data.length}개 배치를 JSON 으로 내보냈습니다.`);
  };

  const saveImage = () => {
    const url = e()?.snapshot(SNAPSHOT_W);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scene.name}${shot && scene.shots.length > 1 ? `-${scene.shots.indexOf(shot) + 1}` : ""}.png`;
    a.click();
  };

  // stage size for the badge layout (px)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slotOf = (slotId: string) => shot?.slots?.find((x) => x.id === slotId);
  const badges = layoutBadges(anchors, stageSize.w, stageSize.h);
  const pickSlot = (slotId: string | null) => {
    setOpenSlot(slotId);
    e()?.highlightSlot(slotId ? (slotOf(slotId)?.itemId ?? null) : null);
  };
  const open = openSlot ? slotOf(openSlot) : undefined;
  const openBadge = badges.find((a) => a.id === openSlot);
  const productName = (id: string | undefined) => products.find((p) => p.id === id)?.name;
  const choices = open?.category ? products.filter((p) => p.path[0] === open.category) : products;
  const shotRacks = shot?.racks ?? [];
  const countOf = (r: SceneRack) => rackCounts[r.id] ?? r.count;
  const openRack = open ? shotRacks.find((r) => r.slotIds.includes(open.id)) : undefined;
  const shownSlotCount = (shot?.slots?.length ?? 0) - shotRacks.reduce((n, r) => n + r.slotIds.length - countOf(r), 0);
  // the label says how it hangs now (옆걸이 / 정면걸이), after the per-rack switch
  const rackLabel = (r: SceneRack) =>
    rackSides[r.id] === undefined ? r.label : r.label.replace(/옆걸이|정면걸이/, rackSides[r.id] ? "옆걸이" : "정면걸이");
  const rackName = (r: SceneRack) => `${r.group ? `${r.group} ` : ""}${rackLabel(r)}`;
  const rackGroups = [...new Set(shotRacks.map((r) => r.group ?? ""))];
  const hoverRack = (r: SceneRack | null) => {
    setRackHover(r?.id ?? null);
    e()?.highlightRack(r?.id ?? null);
  };
  const shotLevels = shot?.levels ?? [];
  const levelGroups = [...new Set(shotLevels.map((l) => l.group ?? ""))];
  const levelDyOf = (l: SceneLevel) => levelDys[l.id] ?? 0;
  const moveLevel = (l: SceneLevel, dy: number) => {
    pickSlot(null);
    e()?.setLevel(l.id, dy);
    setAnchors(e()?.slotAnchors() ?? []);
  };
  const changeRack = (act: () => void) => {
    pickSlot(null);
    act();
    setAnchors(e()?.slotAnchors() ?? []);
  };

  if (orbit) {
    return (
      <div className="store">
        <div className="store__toolbar">
          <span className="store__shotlabel">전체 매장 · 천장 숨김</span>
          {scene.floors.length > 1 &&
            scene.floors.map((f) => (
              <button key={f.id} type="button" className="btn btn--sm" onClick={() => e()?.setFloor(f.id)}>
                {f.title.replace("Floor ", "")}F
              </button>
            ))}
          <button type="button" className="btn btn--sm" onClick={() => e()?.resetView()}>
            처음 시점으로
          </button>
          <span className="filterbar__spacer" />
          <span className="muted store__stat">
            {loading ? `가구 불러오는 중 ${progress.done}/${progress.total}` : `가구 ${progress.total}개`}
          </span>
        </div>
        <div className="store__stage store__stage--orbit">
          <div ref={hostRef} className="store__canvas" />
          {loading && (
            <div className="store__loading">
              <div className="store__bar">
                <span style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
              </div>
            </div>
          )}
          <div className="store__pad" aria-label="방향 이동">
            {(
              [
                ["r", "▲", "위로 (R)"],
                ["w", "↑", "앞으로 (W)"],
                ["f", "▼", "아래로 (F)"],
                ["a", "←", "왼쪽 (A)"],
                ["s", "↓", "뒤로 (S)"],
                ["d", "→", "오른쪽 (D)"],
              ] as const
            ).map(([k, label, title]) => (
              <button
                key={k}
                type="button"
                title={title}
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId);
                  e()?.hold(k, true);
                }}
                onPointerUp={() => e()?.hold(k, false)}
                onPointerCancel={() => e()?.hold(k, false)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="store__help">
            <b>WASD·방향키</b> 이동 · <b>R/F</b> 위/아래 · <b>오른쪽 드래그</b> 회전 · <b>왼쪽 드래그</b> 이동 · <b>휠</b> 확대/축소
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="store">
      <div className="store__toolbar">
        <span className="store__shotlabel">
          {shot ? `렌더 시점 #${scene.shots.indexOf(shot) + 1} · ${floorLabel(shot)}` : "렌더 시점 없음"}
        </span>
        <label className={`store__check${shot ? "" : " store__check--off"}`}>
          <input type="checkbox" checked={compare} disabled={!shot} onChange={(ev) => setCompare(ev.target.checked)} />
          렌더 비교
        </label>
        {!!shot?.racks?.length && (
          <label className="store__check" title="끄면 옆걸이 옷이 원본 3D 두께로 걸립니다 (서로 많이 겹침)">
            <input
              type="checkbox"
              checked={dense}
              onChange={(ev) => {
                const on = ev.target.checked;
                setDenseState(on);
                denseRef.current = on;
                pageMemory.set(DENSE_KEY, on ? "1" : "0");
                e()?.setDense(on);
              }}
            />
            옆걸이 촘촘히
          </label>
        )}
        {!!shot?.slots?.length && (
          <label className="store__check">
            <input
              type="checkbox"
              checked={showSlots}
              onChange={(ev) => {
                setShowSlots(ev.target.checked);
                if (!ev.target.checked) pickSlot(null);
              }}
            />
            상품 표시 ({shownSlotCount})
          </label>
        )}
        <span className="filterbar__spacer" />
        <button type="button" className="btn btn--sm" disabled={loading} onClick={saveImage} title={`지금 화면을 ${SNAPSHOT_W}px PNG 로 저장`}>
          고화질 저장
        </button>
        <span className="muted store__stat">
          {loading ? `가구 불러오는 중 ${progress.done}/${progress.total}` : `가구 ${progress.total}개`}
          {missing > 0 ? ` · 모델 없음 ${missing}` : ""}
        </span>
      </div>

      {showSlots && shotRacks.length > 0 && (
        <div className="store__racks" aria-label="걸이별 옷 개수" onMouseLeave={() => hoverRack(null)}>
          <span className="muted">옷 개수</span>
          {rackGroups.map((g) => (
            <span key={g} className="store__rackgroup">
              {g && <b className="store__rackgroupname">{g}</b>}
          {shotRacks.filter((r) => (r.group ?? "") === g).map((r) => (
            <span
              key={r.id}
              className={`store__rack${rackHover === r.id ? " store__rack--on" : ""}`}
              title={`${rackName(r)} · ${r.slotIds[0]}–${r.slotIds[r.slotIds.length - 1]} · 최대 ${r.slotIds.length}벌 (마우스를 올리면 화면에 주황 상자로 표시)`}
              onMouseEnter={() => hoverRack(r)}
              onFocus={() => hoverRack(r)}
            >
              {rackLabel(r)}
              <button
                type="button"
                className="store__rackside"
                aria-label={`${rackName(r)} ${rackSides[r.id] ? "정면걸이로" : "옆걸이로"} 바꾸기`}
                title={rackSides[r.id] ? "정면걸이로 바꾸기 (앞면이 보이게)" : "옆걸이로 바꾸기 (어깨가 보이게)"}
                onClick={() => changeRack(() => e()?.setRackSide(r.id, !rackSides[r.id]))}
              >
                {rackSides[r.id] ? "→정면" : "→옆"}
              </button>
              <button
                type="button"
                aria-label={`${rackName(r)} 하나 빼기`}
                disabled={countOf(r) <= 0}
                onClick={() => changeRack(() => e()?.setRackCount(r.id, countOf(r) - 1))}
              >
                −
              </button>
              <b>{countOf(r)}</b>
              <button
                type="button"
                aria-label={`${rackName(r)} 하나 더`}
                disabled={countOf(r) >= r.slotIds.length}
                onClick={() => changeRack(() => e()?.setRackCount(r.id, countOf(r) + 1))}
              >
                +
              </button>
            </span>
          ))}
            </span>
          ))}
        </div>
      )}

      {showSlots && shotLevels.length > 0 && (
        <div className="store__racks" aria-label="선반·봉 높이" onMouseLeave={() => e()?.highlightLevel(null)}>
          <span className="muted">선반·봉 높이</span>
          {levelGroups.map((g) => (
            <span key={g} className="store__rackgroup">
              {g && <b className="store__rackgroupname">{g}</b>}
              {shotLevels
                .filter((l) => (l.group ?? "") === g)
                .map((l) => {
                  const y = l.y + levelDyOf(l);
                  return (
                    <span
                      key={l.id}
                      className="store__rack"
                      title={`${g} ${l.label} · ${l.min / 10}–${l.max / 10} cm, ${l.step / 10} cm 단위 (화면에서 판·봉을 위아래로 끌어도 됩니다)`}
                      onMouseEnter={() => e()?.highlightLevel(l.id)}
                      onFocus={() => e()?.highlightLevel(l.id)}
                    >
                      {l.label}
                      <button
                        type="button"
                        aria-label={`${g} ${l.label} 내리기`}
                        disabled={y - l.step < l.min}
                        onClick={() => moveLevel(l, levelDyOf(l) - l.step)}
                      >
                        ▼
                      </button>
                      <b style={{ minWidth: 44 }}>{(y / 10).toFixed(0)}cm</b>
                      <button
                        type="button"
                        aria-label={`${g} ${l.label} 올리기`}
                        disabled={y + l.step > l.max}
                        onClick={() => moveLevel(l, levelDyOf(l) + l.step)}
                      >
                        ▲
                      </button>
                    </span>
                  );
                })}
            </span>
          ))}
        </div>
      )}

      <div className="store__main">
        <div className="store__stagewrap">
        {/* a render shot fixes the frame to its own aspect, so 렌더 비교 overlays 1:1 */}
        <div ref={stageRef} className="store__stage" style={{ ["--ar" as string]: String(shot ? shot.aspect : 16 / 9) }}>
          <div ref={hostRef} className="store__canvas" />
          {compare && shot?.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="store__compare" src={shot.thumb} alt="렌더 원본" />
          )}
          {loading && (
            <div className="store__loading">
              <div className="store__bar">
                <span style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
              </div>
            </div>
          )}
          {showSlots && !compare && badges.length > 0 && (
            <svg className="store__leaders" width={stageSize.w} height={stageSize.h}>
              {badges.map((b) => (
                <g key={b.id} className={openSlot === b.id ? "on" : ""}>
                  <line x1={b.bx} y1={b.by + 9} x2={b.ax} y2={b.ay} />
                  <circle cx={b.ax} cy={b.ay} r={2.5} />
                </g>
              ))}
            </svg>
          )}
          {showSlots &&
            !compare &&
            badges.map((b) => {
              const slot = slotOf(b.id);
              const swappedTo = slot ? (slot.kind === "image" ? pictures[slot.itemId] : productName(swaps[slot.itemId])) : undefined;
              const inHover = !!rackHover && !!shotRacks.find((r) => r.id === rackHover)?.slotIds.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`store__slot${openSlot === b.id ? " store__slot--on" : ""}${swappedTo ? " store__slot--swapped" : ""}${inHover ? " store__slot--rack" : ""}`}
                  style={{ left: b.bx, top: b.by }}
                  title={swappedTo ? `${b.id} → ${swappedTo}` : `${b.id} ${slot?.kind === "image" ? "이미지" : "상품"} 변경`}
                  onClick={() => pickSlot(openSlot === b.id ? null : b.id)}
                >
                  {b.id}
                </button>
              );
            })}
          {open && openBadge && (
            <div
              className="store__swap"
              style={{
                left: Math.min(Math.max(openBadge.bx - 105, 8), stageSize.w - 218),
                top: Math.max(Math.min(openBadge.by + 18, stageSize.h - 330), 4),
              }}
            >
              <div className="store__swaphead">
                <b>{open.id}</b>
                <span className="muted">{open.label}</span>
                <button type="button" className="store__swapx" aria-label="닫기" onClick={() => pickSlot(null)}>
                  ×
                </button>
              </div>
              {open.kind === "image" ? (
                <>
                  <div className="store__swaptitle">이미지 변경</div>
                  {pictures[open.itemId] && <div className="store__swapfile">{pictures[open.itemId]}</div>}
                  <label className="btn btn--sm btn--accent" style={{ width: "100%", justifyContent: "center" }}>
                    이미지 파일 선택
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(ev) => {
                        const file = ev.target.files?.[0];
                        if (file) e()?.setPicture(open.itemId, file, file.name);
                        pickSlot(null);
                      }}
                    />
                  </label>
                  <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 6 }}>
                    화면의 포스터·TV 위로 사진 파일을 끌어다 놓아도 됩니다. 판 비율에 맞게 가운데를 채웁니다.
                  </div>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={!pictures[open.itemId]}
                    style={{ marginTop: 6, width: "100%" }}
                    onClick={() => {
                      e()?.setPicture(open.itemId, null);
                      pickSlot(null);
                    }}
                  >
                    원래 이미지로
                  </button>
                </>
              ) : (
              <>
              <div className="store__swaptitle">상품 변경</div>
              {choices.length === 0 && (
                <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                  아직 {open.category} 상품이 없습니다. 상품/{open.category} 폴더에 glb 를 넣으면 여기에 뜹니다.
                </div>
              )}
              {choices.map((p, i) => (
                <div key={p.id}>
                {p.path.join("/") !== choices[i - 1]?.path.join("/") && (
                  <div className="store__swapgroup">{p.path.join(" / ")}</div>
                )}
                <button
                  key={p.id}
                  type="button"
                  className={`store__swapitem${swaps[open.itemId] === p.id ? " store__swapitem--on" : ""}`}
                  onClick={() => {
                    e()?.setSwap(open.itemId, p);
                    pickSlot(null);
                  }}
                >
                  {p.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb} alt="" />
                  )}
                  <span>{p.color ?? p.name}</span>
                </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn--sm"
                disabled={!swaps[open.itemId]}
                style={{ marginTop: 6, width: "100%" }}
                onClick={() => {
                  e()?.setSwap(open.itemId, null);
                  pickSlot(null);
                }}
              >
                원래 상품으로
              </button>
              {openRack && (
                <button
                  type="button"
                  className="btn btn--sm"
                  style={{ marginTop: 6, width: "100%" }}
                  onClick={() => changeRack(() => e()?.removeFromRack(open.itemId))}
                >
                  이 옷 빼기 ({rackName(openRack)} {countOf(openRack)} → {countOf(openRack) - 1})
                </button>
              )}
              </>
              )}
            </div>
          )}
          <div className="store__help">
            시점 고정 &nbsp;|&nbsp; 상품 표시 → 번호·옷 클릭 = 상품 변경 · 위 −/+ 로 걸이별 옷 개수 · 옆걸이 옷은 좌우로 끌어 옮기기 · 선반·봉은 ▲▼ 또는 위아래로 끌기 &nbsp;|&nbsp; 사진 파일 → 포스터·TV에 끌어다 놓기 &nbsp;|&nbsp; 추가한 상품: 클릭 선택 · <b>Q/E</b> 회전 · <b>Z/X</b> 높이 · <b>Del</b> 삭제
          </div>
        </div>
        </div>

        <aside className="store__panel">
          <div className="store__tabs">
            {(
              [
                ["shots", `렌더 시점 ${scene.shots.length}`],
                ["products", "상품"],
                ["placed", `배치 ${placed.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`store__tab${tab === key ? " store__tab--on" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "shots" && (
            <div className="store__shots">
              {scene.shots.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`store__shot${shot?.id === s.id ? " store__shot--on" : ""}`}
                  onClick={() => {
                    const floor = scene.floors.find((f) => f.id === s.floorId);
                    if (floor) e()?.setFloor(floor.id);
                    setShot(s);
                    pickSlot(null);
                    e()?.goShot(s);
                    setAnchors(e()?.slotAnchors() ?? []);
                  }}
                >
                  {s.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumb} alt="" loading="lazy" />
                  ) : (
                    <span className="store__shotph" />
                  )}
                  <span>
                    #{i + 1} {floorLabel(s)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === "products" && (
            <div className="store__products">
              {products.length === 0 && (
                <div className="muted">상품 폴더(data/vmd-products.json 의 root)에 glb 가 없습니다.</div>
              )}
              {products.length > 0 && (
                <ProductFolder
                  node={productTree(products)}
                  depth={0}
                  onAdd={(p) => {
                    e()?.addProduct(p);
                    setTab("placed");
                  }}
                />
              )}
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                화면 가운데가 가리키는 바닥·선반·행거에 놓입니다 (끌어서 옮기기는 없음).
              </p>
            </div>
          )}

          {tab === "placed" && (
            <div className="store__placed">
              {placed.length === 0 && <div className="muted">아직 배치한 상품이 없습니다.</div>}
              {placed.map((p) => (
                <div key={p.uid} className={`store__prow${selected === p.uid ? " store__prow--on" : ""}`}>
                  <span>{p.name}</span>
                  <span className="muted" style={{ fontSize: 10.5 }}>
                    {p.uid.slice(-4)}
                  </span>
                </div>
              ))}
              <div className="seg" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn--sm" disabled={!selected} onClick={() => e()?.removeSelected()}>
                  선택 삭제
                </button>
                <button type="button" className="btn btn--sm" disabled={!placed.length} onClick={download}>
                  JSON 내보내기
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={!placed.length}
                  onClick={() => e()?.clearPlacements()}
                >
                  모두 지우기
                </button>
              </div>
              {message && (
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  {message}
                </div>
              )}
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                배치는 탭을 옮겨도 유지되고, 새로고침하면 처음 상태로 돌아갑니다.
              </p>
            </div>
          )}

        </aside>
      </div>
    </div>
  );
}

function ProductFolder({
  node,
  depth,
  onAdd,
}: {
  node: ProductNode;
  depth: number;
  onAdd: (p: VmdProduct) => void;
}) {
  return (
    <details className="store__folder" open style={{ marginLeft: depth ? 10 : 0 }}>
      <summary>
        <span aria-hidden>📁</span> {node.name} <span className="muted">({countProducts(node)})</span>
      </summary>
      {node.children.map((c) => (
        <ProductFolder key={c.name} node={c} depth={depth + 1} onAdd={onAdd} />
      ))}
      {node.products.map((p) => (
        <div key={p.id} className="store__product" style={{ marginLeft: 10 }}>
          {p.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumb} alt="" />
          )}
          <div>
            <div className="store__pname">{p.color ?? p.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {p.id} · {p.mount === "hang" ? "행거에 걸기" : "바닥·선반에 놓기"}
            </div>
            <button type="button" className="btn btn--sm btn--accent" style={{ marginTop: 6 }} onClick={() => onAdd(p)}>
              ＋ 매장에 추가
            </button>
          </div>
        </div>
      ))}
    </details>
  );
}
