"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  Placement,
  SceneFixture,
  SceneFloor,
  SceneItem,
  SceneLevel,
  SceneRack,
  SceneShot,
  StoreScene,
  Swaps,
  VmdProduct,
} from "@/lib/scene-types";

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

/** scene.hanger (부품/옷걸이.glb): width and hook top -> shoulder tips, m */
const HANGER_W = 0.43;
const HANGER_TIPS = 0.219;
/** the hanger's shoulder tips sit this far inside the garment's shoulders, m; the hanger is this share of their width */
const HANGER_INSET = 0.04;
const HANGER_SPAN = 0.8;
/** scene.pantsHanger (부품/바지걸이.glb): clip bar width, hook top -> the waist its clips grip, m; the bar is this
 * share of the waist width */
const PANTS_W = 0.32;
const PANTS_TOP = 0.113;
const PANTS_SPAN = 0.85;
/** real height (m, collar / waistband to hem) of a garment per product category (VmdProduct.path[0]). The UniForge3D
 * product glbs of clothes all come out ~1 m tall whatever they are (a sweatshirt as tall as a long padding), so a
 * swapped-in garment is scaled to this; shoes, bags, caps, scarves ... are real size already and are left alone. */
const REAL_HEIGHT: Record<string, number> = {
  맨투맨: 0.7, 티셔츠: 0.72, 후드티: 0.74, 집업: 0.7, 자켓: 0.74, 스웨터: 0.68, 패딩: 0.74, 패딩베스트: 0.68,
  팬츠: 1.02, 스커트: 0.8, 원피스: 1.1,
};
/** by the style name: 롱 = long (knee and below), 하프 / 미드 = mid-thigh */
const realHeight = (product: VmdProduct) => {
  const h = REAL_HEIGHT[product.path[0]];
  if (!h) return undefined;
  const name = product.path.join(" ");
  if (/롱/.test(name) && product.path[0] !== "팬츠") return 1.12;
  if (/하프|미드/.test(name)) return 0.9;
  return h;
};
/** product categories (VmdProduct.path[0]) that hang on the pants hanger, by the waist */
const PANTS_CATS = ["팬츠", "스커트"];
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
  /** outline these slot items in orange (the selected items); [] clears */
  markSlots: (itemIds: string[]) => void;
  /** image slot: cover the item's front with this image (cropped to fill); null restores the original */
  setPicture: (itemId: string, file: Blob | null, name?: string) => void;
  /** the current view rendered at `width` px with the canvas grade baked in, as a PNG data URL */
  snapshot: (width: number) => string;
  /** show n garments on a rack (re-spaced); garments past n lose their swap */
  setRackCount: (rackId: string, n: number) => void;
  /** 연출표 적용: take the saved swaps / rack counts again (written by VmdPlanImport) without reloading the store */
  reloadPlan: () => Promise<void>;
  /** hang a rack's garments side-on (true) or face-out; they are spread evenly again */
  setRackSide: (rackId: string, side: boolean) => void;
  /** 상품 표시: turn a cap / glove / shoe ... (not a rack garment) to `deg` about its upright axis from how it was built */
  turnItem: (itemId: string, deg: number) => void;
  turnOf: (itemId: string) => number;
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
  /** 집기: change a fixture's type (option index), place (mm from where it was built) or take it off */
  setFixture: (fixtureId: string, patch: Partial<FixtureState>) => void;
  /** 집기: box these fixtures in orange ([] clears) */
  selectFixture: (fixtureIds: string[]) => void;
  /** 집기: the bay under a screen point and the height there (mm), for a dropped 도구 */
  bayAt: (clientX: number, clientY: number) => { bay: string; y: number } | null;
};

/** a 집기's state: option shown, offset (mm, x y z from where it was built), taken off, shelves / rails of the shown
 * option taken off (level ids) */
type FixtureState = { o: number; off: [number, number, number]; rm: boolean; hide?: string[] };
const FIXTURE_HOME: FixtureState = { o: 0, off: [0, 0, 0], rm: false };
/** 집기 arrows and drags move in these steps, mm */
const FIXTURE_STEP = 50;
const FIXTURE_SNAP = 10;

/** items / racks / levels hidden by the fixtures' state: options not chosen, taken off, or a shelf / rail of the
 * shown option taken off (with what stands on it and its racks' garments) */
function fixtureOff(shots: SceneShot[], state: Record<string, FixtureState>) {
  const items = new Set<string>();
  const racks = new Set<string>();
  const levels = new Set<string>();
  const levelById = new Map(shots.flatMap((s) => (s.levels ?? []).map((l) => [l.id, l] as const)));
  const slotItem = new Map(shots.flatMap((s) => (s.slots ?? []).map((x) => [x.id, x.itemId] as const)));
  const rackById = new Map(shots.flatMap((s) => (s.racks ?? []).map((r) => [r.id, r] as const)));
  for (const f of shots.flatMap((s) => s.fixtures ?? [])) {
    const s = state[f.id] ?? FIXTURE_HOME;
    f.options.forEach((o, i) => {
      if (i === s.o && !s.rm) return;
      o.itemIds.forEach((x) => items.add(x));
      o.rackIds.forEach((x) => racks.add(x));
      o.levelIds.forEach((x) => levels.add(x));
    });
    if (s.rm) continue;
    for (const lid of s.hide ?? []) {
      const lv = levelById.get(lid);
      if (!lv || !f.options[s.o]?.levelIds.includes(lid)) continue;
      levels.add(lid);
      lv.itemIds.forEach((x) => items.add(x));
      for (const rid of lv.rackIds ?? []) {
        racks.add(rid);
        for (const sid of rackById.get(rid)?.slotIds ?? []) items.add(slotItem.get(sid) ?? "");
      }
    }
  }
  return { items, racks, levels };
}

type Anchor = { id: string; u: number; v: number };

/** 집기 도구 (scripts/build_vignettes.py PARTS), in palette order */
const PART_TYPES = [
  ["rail", "옆걸이 행거"],
  ["combo", "옆걸이+정면걸이 행거"],
  ["shelf", "선반"],
  ["caps", "모자 진열대"],
  ["poster", "사진 진열대"],
  ["goods", "용품 진열"],
] as const;
/** the room (mm below / above its height) a piece takes: hung clothes go down, things on a shelf up */
const PART_BAND: Record<string, [number, number]> = {
  rail: [-860, 60],
  combo: [-860, 60],
  shelf: [-40, 260],
  caps: [-40, 260],
  poster: [-40, 860],
  goods: [-40, 580],
};
const PART_MIME = "application/x-vmd-part";

/** line icons of the 집기 도구 (palette, bay list) */
function PartIcon({ type }: { type: string }) {
  const common = { width: 26, height: 26, viewBox: "0 0 26 26", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "rail": // a rail with three hangers
      return (
        <svg {...common} aria-hidden>
          <path d="M3 6h20M3 6v-2M23 6v-2" />
          {[7, 13, 19].map((x) => (
            <path key={x} d={`M${x} 6v2l-3.5 3.5h7L${x} 8 M${x - 3} 11.5v10h6v-10`} />
          ))}
        </svg>
      );
    case "combo": // side-hung on a loop + a face-out on the arm right of it
      return (
        <svg {...common} aria-hidden>
          <path d="M2 5h12M2 5v2M14 5v2M16 5h8" />
          <path d="M5 5v13M9 5v13M3.5 7h3M7.5 7h3" />
          <path d="M20 5v2l-4 2v12h8V9z" />
        </svg>
      );
    case "shelf": // a board on two brackets
      return (
        <svg {...common} aria-hidden>
          <path d="M3 13h20M3 13v3M23 13v3M6 13v8M20 13v8" />
          <rect x="7" y="8" width="5" height="5" />
          <rect x="14" y="9" width="4" height="4" />
        </svg>
      );
    case "caps": // a tipped tray with a cap
      return (
        <svg {...common} aria-hidden>
          <path d="M3 19l20-4M3 19v3M23 15v3" />
          <path d="M8 15.5a4 4 0 0 1 8-1.6l3 -0.4" />
        </svg>
      );
    case "poster": // a framed photo on a stand
      return (
        <svg {...common} aria-hidden>
          <rect x="4" y="4" width="18" height="13" rx="1" />
          <path d="M6 15l5-5 4 4 2-2 3 3M3 21h20" />
          <circle cx="17" cy="8" r="1.4" />
        </svg>
      );
    case "goods": // a backpack and a head with a cap
      return (
        <svg {...common} aria-hidden>
          <path d="M3 21h20" />
          <rect x="4" y="10" width="8" height="11" rx="2" />
          <path d="M6 10a2 2 0 0 1 4 0M6 15h4" />
          <circle cx="18" cy="14" r="3" />
          <path d="M14.5 12.5a3.5 3 0 0 1 7 0zM18 17v4" />
        </svg>
      );
    default:
      return <span className="store__iconph" />;
  }
}

/** added products / swaps / 집기 per store: they carry across tabs and survive a reload (this browser's
 *  localStorage, "fnf3d:" keys); 연출표 불러오기 writes the same keys for every 매장연출 at once */
export const STORE_PREFIX = "fnf3d:";
export const pageMemory = {
  get(key: string): string | undefined {
    try {
      return localStorage.getItem(STORE_PREFIX + key) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(STORE_PREFIX + key, value);
    } catch {
      /* full / blocked: this page only */
    }
  },
  delete(key: string) {
    try {
      localStorage.removeItem(STORE_PREFIX + key);
    } catch {
      /* blocked */
    }
  },
};
/** parsed models shared by every viewer of the page (매장연출 tabs use the same hangers, rails and products):
 *  a tab opened after another parses only what is new. Viewers clone them and never dispose the shared geometry. */
const sharedModels = new Map<string, THREE.Object3D>();
/** 연출표 적용 to tabs not on screen: one after another, so the tab being looked at loads its products first */
let planQueue: Promise<void> = Promise.resolve();
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

/** VMD product glbs are painted from the official product photo (light and folds already in the texture): drawn
 * matte (the paint's roughness 0.6 shone orange-brown under the warm store light) and with the canvas grade
 * (CANVAS_GRADE, for the store's render look) undone in the shader, so a product keeps its photo colour */
const PRODUCT_ROUGHNESS = 1;
const PRODUCT_ENV = 0.6;
const PRODUCT_EXPOSURE = 0.93;
function photoLook(model: THREE.Object3D) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) continue;
      std.roughness = PRODUCT_ROUGHNESS;
      std.metalness = 0;
      std.envMapIntensity = PRODUCT_ENV;
      // no AgX: it greys out light colours (a beige came out off-white); PRODUCT_EXPOSURE stands in for its exposure
      std.toneMapped = false;
      std.onBeforeCompile = (sh) => {
        // inverse of saturate(1.5) contrast(1.12) brightness(0.97), last first, on the final sRGB colour
        sh.fragmentShader = sh.fragmentShader.replace(
          "#include <colorspace_fragment>",
          `#include <colorspace_fragment>
          vec3 ug = gl_FragColor.rgb * ${PRODUCT_EXPOSURE.toFixed(3)} / 0.97;
          ug = (ug - 0.5) / 1.12 + 0.5;
          float s = 1.0 / 1.5;
          mat3 sat = mat3(
            0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
            0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
            0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s);
          // and the warm store light (sun 0xfff1e0) taken back out: a white balance that keeps the brightness
          gl_FragColor.rgb = clamp(sat * ug * vec3(0.985, 1.0, 1.02), 0.0, 1.0);`,
        );
      };
      std.customProgramCacheKey = () => "vmd-photo";
      std.needsUpdate = true;
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
const flatProducts = (n: ProductNode): VmdProduct[] => [...n.products, ...n.children.flatMap(flatProducts)];
const countProducts = (n: ProductNode): number =>
  n.products.length + n.children.reduce((sum, c) => sum + countProducts(c), 0);
/** pageMemory key of the right panel shown ("0" = hidden) */
const PANEL_KEY = "vmd-panel";
const BADGE_W = 30;
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
      return (a.u - last.u) * w < BADGE_W && Math.abs(a.v - last.v) * h < 20;
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
        if (Math.abs(o.by - b.by) < 17 && Math.abs(b.bx - o.bx) < BADGE_W + BADGE_GAP) {
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
  onSnapshot,
  snapTick = 0,
  planTick = 0,
  onReady,
  active = true,
}: {
  scene: StoreScene;
  products: VmdProduct[];
  mode?: "shots" | "orbit";
  /** 매장연출 전체 보기: a small picture of the view once it has loaded / after products change */
  onSnapshot?: (url: string) => void;
  /** a new value asks for a new picture (모두 둘러보기 visiting a tab that is already loaded) */
  snapTick?: number;
  /** a new value: the saved 연출표 changed - follow it in place (no reload) */
  planTick?: number;
  /** the store's furniture finished loading (매장연출 loads the next tab in the background then) */
  onReady?: () => void;
  /** shown now (매장연출 keeps hidden tabs loaded): a new 연출표 goes here first, hidden tabs take it in turn */
  active?: boolean;
}) {
  const orbit = mode === "orbit";
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const storageKey = `vmd-layout:${scene.projectId}`;
  const swapKey = `vmd-swaps:${scene.projectId}`;
  const rackKey = `vmd-racks:${scene.projectId}`;
  const levelKey = `vmd-levels:${scene.projectId}`;
  const fixtureKey = `vmd-fixtures:${scene.projectId}`;
  const pictureKey = scene.projectId;
  // 집기 편집: canvas clicks pick / drag fixtures instead of products; the engine reads the ref
  const fixModeRef = useRef(false);
  const fixClickRef = useRef<(fixtureId: string | null) => void>(() => {});
  const slotClickRef = useRef<(slotId: string) => void>(() => {});
  /** a canvas click on nothing (no garment, no shelf): clears the selected items */
  const emptyClickRef = useRef<() => void>(() => {});
  // slot numbers stay hidden until '상품 표시' is on; the engine reads this for clicks/cursor
  const showSlotsRef = useRef(false);

  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [shot, setShot] = useState<SceneShot | null>(scene.shots[0] ?? null);
  const [compare, setCompare] = useState(false);
  const [tab, setTab] = useState<"shots" | "products" | "fixtures" | "placed">("shots");
  const [placed, setPlaced] = useState<{ uid: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [swaps, setSwaps] = useState<Swaps>({});
  const [pictures, setPictures] = useState<Record<string, string>>({}); // item id -> file name
  const [rackCounts, setRackCounts] = useState<Record<string, number>>({});
  const [rackSides, setRackSides] = useState<Record<string, boolean>>({});
  const [rackHover, setRackHover] = useState<string | null>(null);
  const [levelDys, setLevelDys] = useState<Record<string, number>>({});
  const [fixState, setFixState] = useState<Record<string, FixtureState>>({});
  const [fixMode, setFixModeState] = useState(false);
  const [fixSel, setFixSel] = useState<string | null>(null);
  const [baySel, setBaySel] = useState<string | null>(null); // 집기 tab: the bay pieces go into
  const [fixMsg, setFixMsg] = useState<string | null>(null);
  // 옆걸이 촘촘히 - one setting for every page (the engine reads the ref when it starts)
  const [dense, setDenseState] = useState(() => pageMemory.get(DENSE_KEY) !== "0");
  const denseRef = useRef(dense);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [showSlots, setShowSlots] = useState(false);
  // selected product slots (click a number / garment = select, again = unselect, several at once); the 상품 tab
  // then changes all of them
  const [sel, setSel] = useState<string[]>([]);
  const [query, setQuery] = useState(""); // 상품 tab search
  // the right panel (렌더 시점 / 상품) can be hidden for a bigger view; one setting for every page
  const [panelOpen, setPanelOpenState] = useState(() => pageMemory.get(PANEL_KEY) !== "0");
  const setPanelOpen = (on: boolean) => {
    setPanelOpenState(on);
    pageMemory.set(PANEL_KEY, on ? "1" : "0");
  };
  showSlotsRef.current = showSlots;
  fixModeRef.current = fixMode;
  fixClickRef.current = (id) => pickFixture(id);
  slotClickRef.current = (slotId) => pickSlot(slotId);
  emptyClickRef.current = () => {
    if (sel.length) selectSlots([]);
  };
  // a click anywhere outside the numbers, the 상품 tab and the toolbars clears the selection (the canvas tells on its own)
  useEffect(() => {
    if (!sel.length) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t || t.tagName === "CANVAS" || t.closest(".store__slot, .store__panel, .store__racks, .store__toolbar, .store__swap")) return;
      selectSlots([]);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  });

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
    // product web copies are Draco-compressed (scripts/build_product_lite.py); the decoder loads only when one needs it
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/gltf/");
    loader.setDRACOLoader(draco);
    // every model download of this viewer, cancelled when it closes: leaving a tab (the 개요 full store is hundreds
    // of MB) must not keep the network busy for the next one. A cancelled load never settles - nothing waits on it.
    const downloads = new AbortController();
    const fetchGltf = (url: string): Promise<GLTF> =>
      fetch(url, { signal: downloads.signal })
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${url}`);
          return r.arrayBuffer();
        })
        .then((buf) => loader.parseAsync(buf, url.slice(0, url.lastIndexOf("/") + 1)))
        .catch((err: unknown) => (downloads.signal.aborted ? new Promise<GLTF>(() => {}) : Promise.reject(err)));
    /** a model parsed once per page (sharedModels), prepared by `prep` the first time */
    const fetchShared = (key: string, url: string, prep: (m: THREE.Object3D) => void) => {
      const hit = sharedModels.get(key);
      if (hit) return Promise.resolve(hit);
      return fetchGltf(url).then((gltf: GLTF) => {
        prep(gltf.scene);
        sharedModels.set(key, gltf.scene);
        return gltf.scene;
      });
    };
    const modelCache = new Map<string, Promise<THREE.Object3D>>();
    const loadModel = (url: string) => {
      let p = modelCache.get(url);
      if (!p) {
        p = fetchShared(`m:${url}`, url, (m) => sharpen(m, anisotropy));
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

    // 집기: the state saved on this page; items of options not shown are not loaded until someone picks them
    const fixtures = scene.shots.flatMap((s) => s.fixtures ?? []);
    const fixState = new Map<string, FixtureState>();
    try {
      const saved = JSON.parse(pageMemory.get(fixtureKey) ?? "{}") as Record<string, FixtureState>;
      for (const f of fixtures) if (saved[f.id]) fixState.set(f.id, saved[f.id]);
    } catch {
      /* nothing saved */
    }
    let offItems = fixtureOff(scene.shots, Object.fromEntries(fixState)).items;
    const pendingLoad = new Map<string, () => void>(); // item id -> load its model (shown later)
    const loadItem = (item: SceneItem, holder: THREE.Group, floor: SceneFloor, counted: boolean) =>
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
        .finally(() => {
          if (counted) bump();
        });

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
        const holder = new THREE.Group();
        holder.matrixAutoUpdate = false;
        holder.matrix.fromArray(item.matrix);
        holder.userData.item = item;
        holder.visible = !item.renderHidden && !offItems.has(item.id);
        // 전체 렌더링 looks in from above: ceiling-hung lights/structures would cover the store
        if (orbit && item.matrix[13] - item.size[1] / 2 > floor.height * 0.6) holder.visible = false;
        g.add(holder);
        itemById.set(item.id, holder);
        if (offItems.has(item.id)) {
          pendingLoad.set(item.id, () => void loadItem(item, holder, floor, false));
          continue;
        }
        total += 1;
        void loadItem(item, holder, floor, true);
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
    /** the selected slot items: one orange box each, refitted every frame */
    let marked: string[] = [];
    const markBoxes: THREE.BoxHelper[] = [];
    const fitMarks = () => {
      marked.forEach((id, i) => {
        const target = swapped.get(id) ?? itemById.get(id);
        let box = markBoxes[i];
        if (!box) {
          box = new THREE.BoxHelper(new THREE.Object3D(), 0xf07c12);
          markBoxes.push(box);
          world.add(box);
        }
        box.visible = !!target?.visible;
        if (target) box.setFromObject(target);
      });
      for (let i = marked.length; i < markBoxes.length; i += 1) markBoxes[i].visible = false;
    };

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

    /** a garment's top: does it have its own hook (the top few cm much narrower than the garment), and where are its
     * shoulders - the first 1 cm band from the top at least 80 % as wide as the widest band of the upper half (m from
     * the top, and that band's width) */
    type Shape = { hook: boolean; shoulder: number; width: number; top: number };
    const shapeCache = new Map<string, Shape>();
    const garmentShape = (id: string, root: THREE.Object3D): Shape => {
      const known = shapeCache.get(id);
      if (known) return known;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const half = Math.ceil((box.max.y - box.min.y) / 2 / 0.01);
      const lo = new Array<number>(half).fill(Infinity);
      const hi = new Array<number>(half).fill(-Infinity);
      const p = new THREE.Vector3();
      root.traverse((o) => {
        const pos = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry.getAttribute("position") : null;
        if (!pos) return;
        for (let i = 0; i < pos.count; i += 1) {
          p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          const b = Math.floor((box.max.y - p.y) / 0.01);
          if (b >= half) continue;
          lo[b] = Math.min(lo[b], p.x);
          hi[b] = Math.max(hi[b], p.x);
        }
      });
      const w = lo.map((l, b) => Math.max(0, hi[b] - l));
      const widest = Math.max(...w, 1e-6);
      const top = Math.max(w[0], w[1] ?? 0, w[2] ?? 0);
      const b = Math.max(0, w.findIndex((x) => x >= 0.8 * widest));
      const shape = { hook: top < (box.max.x - box.min.x) * 0.15, shoulder: b * 0.01, width: w[b], top };
      shapeCache.set(id, shape);
      return shape;
    };

    const loadProduct = (product: VmdProduct) => {
      let p = productModel.get(product.id);
      if (!p) {
        p = fetchShared(`p:${product.url}`, product.url, (m) => {
          sharpen(m, anisotropy);
          photoLook(m);
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
    /** a hung product reaching past the furniture under its hook (the shelf / rail below an upper rail) is scaled
     * down, about its hook, to end CLEAR above it - once, when it is hung: moving a shelf later never resizes it */
    const CLEAR = 0.03;
    const down = new THREE.Raycaster();
    const hungIds = new Set(scene.shots.flatMap((x) => (x.slots ?? []).map((y) => y.itemId)));
    const fitLength = (itemId: string) => {
      const h = swapped.get(itemId);
      const g = h?.userData.fitG as THREE.Group | undefined;
      if (!h || !g) return;
      g.scale.setScalar(1);
      h.updateMatrixWorld(true);
      const hook = h.getWorldPosition(new THREE.Vector3());
      const bottom = new THREE.Box3().setFromObject(g).min.y;
      // from just under the hook (past the rail / arm it hangs on), straight down to the first furniture
      down.set(hook.clone().setY(hook.y - 0.08), new THREE.Vector3(0, -1, 0));
      let below = -Infinity;
      for (const holder of itemHolders) {
        const id = (holder.userData.item as SceneItem | undefined)?.id;
        if (!holder.visible || (id && hungIds.has(id))) continue;
        // a fresh box: shelves move (levels), the cached itemBoxes do not follow
        if (!down.ray.intersectsBox(new THREE.Box3().setFromObject(holder))) continue;
        const hit = down.intersectObject(holder, true)[0];
        if (hit && hit.point.y > below) below = hit.point.y;
      }
      const room = hook.y - below - CLEAR;
      const len = hook.y - bottom;
      if (room > 0.25 && len > room) g.scale.setScalar(room / len);
    };
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
    /** 상품 표시 방향: item id -> degrees turned about its upright axis (caps, gloves, shoes ... not rack garments) */
    const turned = new Map<string, number>();
    const yaw = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
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
        original.visible = !item.renderHidden && !rackHidden.has(itemId) && !offItems.has(itemId);
        saveSwaps();
        refit(itemId);
        return;
      }
      const slotItem = original.userData.item as SceneItem;
      const src = await loadProduct(product);
      // the slot can say how its products sit (a bag on a shelf stands; hung on a hook it hangs)
      const mount = slotItem.mount ?? product.mount;
      const onHanger =
        !!scene.hanger &&
        mount === "hang" &&
        product.path[0] !== "가방" &&
        slotItem.fit !== "model" &&
        !garmentShape(product.id, src).hook;
      // trousers / skirts by the waist on the clip bar, everything else by the shoulders
      const pants = onHanger && !!scene.pantsHanger && PANTS_CATS.includes(product.path[0]);
      const hanger = onHanger ? (await loadModel((pants ? scene.pantsHanger : scene.hanger) ?? "")).clone(true) : null;
      if (disposed || swapping.get(itemId) !== call) return;
      const model = src.clone(true);
      // clothes to their real length (the glbs are all ~1 m tall); 착장 torsos keep the torso frame
      let real = 1;
      const target = slotItem.fit === "model" ? undefined : realHeight(product);
      if (target) {
        const full = new THREE.Box3().setFromObject(src);
        real = target / Math.max(full.max.y - full.min.y, 1e-6);
        model.scale.multiplyScalar(real);
      }
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
        model.position.set(-c.x, mount === "hang" ? -box.max.y : -box.min.y, -c.z);
        if (hanger && pants) {
          // hook top at the slot's hook point; the bar about as wide as the waist, its clips on the waistband
          const shape = garmentShape(product.id, src);
          const k = Math.min(1.4, Math.max(0.8, (PANTS_SPAN * shape.top * real) / PANTS_W));
          hanger.scale.multiplyScalar(k);
          model.position.y = -box.max.y - PANTS_TOP * k;
          h.add(hanger);
        } else if (hanger) {
          // hook top at the slot's hook point; the hanger sized to the garment's shoulders, its tips just inside them
          // (a hood can rise past the hook, as on a real hanger)
          const shape = garmentShape(product.id, src);
          const k = Math.min(1.4, Math.max(0.8, (HANGER_SPAN * shape.width * real) / HANGER_W));
          hanger.scale.multiplyScalar(k);
          model.position.y = -box.max.y + (shape.shoulder * real + HANGER_INSET - HANGER_TIPS * k);
          h.add(hanger);
        }
        const q = new THREE.Quaternion();
        // 매장연출 slots say which way the product faces; otherwise follow the item
        const pose = swapPose(slotItem);
        if (pose.facing !== undefined) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (pose.facing * Math.PI) / 180);
        else original.getWorldQuaternion(q);
        if (slotItem.tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (slotItem.tilt * Math.PI) / 180));
        const turn = turned.get(itemId);
        if (turn) q.premultiply(yaw(turn));
        h.quaternion.copy(q);
        h.scale.set(1, 1, pose.depth);
        h.position.copy(slotPoint(original, mount === "hang" ? 1 : -1));
      }
      h.userData.productId = product.id;
      h.userData.slotItem = itemId;
      if (mount === "hang" && slotItem.fit !== "model") {
        // the garment (+ its hanger) in one group under the hook, for fitLength
        const g = new THREE.Group();
        for (const c of [...h.children]) g.add(c);
        h.add(g);
        h.userData.fitG = g;
      }
      const clip = slotItem.clip;
      if (clip) {
        const level = original.parent?.position.y ?? 0; // floor group, mm
        clipModel(model, (level + clip[0]) / 1000, (level + clip[1]) / 1000);
      }
      h.visible = !offItems.has(itemId); // a 집기 option not shown keeps its products, hidden
      world.add(h);
      swapped.set(itemId, h);
      original.visible = false;
      saveSwaps();
      refit(itemId);
      fitLength(itemId);
    };
    try {
      // only what was swapped on this page (a fresh page shows the store's own models)
      const allSlots = scene.shots.flatMap((s) => s.slots ?? []);
      const saved = JSON.parse(pageMemory.get(swapKey) ?? "{}") as Swaps;
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
    const rackShift = new Map<string, THREE.Vector3>(); // rack id -> mm its level / 집기 moved it
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
      a.add(rackShift.get(r.id) ?? new THREE.Vector3()); // after dir: a moved rack keeps its direction
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
        holder.visible = !swapped.has(itemId) && !(holder.userData.item as SceneItem).renderHidden && !offItems.has(itemId);
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
      const up = rackShift.get(r.id) ?? new THREE.Vector3();
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
    /** move an item (and the product swapped in for it) by d mm: a number = up, a vector = any way */
    const shiftItem = (itemId: string, d: number | THREE.Vector3) => {
      const holder = itemById.get(itemId);
      if (!holder) return;
      const before = holder.getWorldPosition(new THREE.Vector3());
      const v = typeof d === "number" ? new THREE.Vector3(0, d, 0) : d;
      holder.matrix.elements[12] += v.x;
      holder.matrix.elements[13] += v.y;
      holder.matrix.elements[14] += v.z;
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
        rackShift.set(rid, (rackShift.get(rid) ?? new THREE.Vector3()).clone().add(new THREE.Vector3(0, d, 0)));
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
    // ---------------------------------------------------------------- 집기 (fixtures: type, place, taken off)
    const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
    const fixturesOfItem = new Map<string, SceneFixture[]>(); // item id -> its fixtures (a prop inside a bay: both)
    for (const f of fixtures)
      for (const o of f.options)
        for (const id of o.itemIds) {
          const list = fixturesOfItem.get(id) ?? [];
          if (!list.includes(f)) list.push(f);
          fixturesOfItem.set(id, list);
        }
    const stateOf = (id: string) => fixState.get(id) ?? FIXTURE_HOME;
    const saveFixtures = () => {
      const out = Object.fromEntries(fixState);
      try {
        pageMemory.set(fixtureKey, JSON.stringify(out));
      } catch {
        /* storage blocked */
      }
      if (!disposed) setFixState(out);
    };
    /** after a type change / take-off: show and hide items (their swapped products too); a model loads the first
     * time it shows */
    const syncFixtureItems = () => {
      const before = offItems;
      offItems = fixtureOff(scene.shots, Object.fromEntries(fixState)).items;
      for (const id of new Set([...before, ...offItems])) {
        if (before.has(id) === offItems.has(id)) continue;
        const holder = itemById.get(id);
        if (!holder) continue;
        const on = !offItems.has(id);
        const h = swapped.get(id);
        if (h) h.visible = on;
        holder.visible = on && !h && !(holder.userData.item as SceneItem).renderHidden && !rackHidden.has(id);
        const load = on ? pendingLoad.get(id) : undefined;
        if (load) {
          pendingLoad.delete(id);
          load();
        }
      }
    };
    /** put a fixture `off` mm from where it was built: every option's items and racks go along */
    const moveFixture = (f: SceneFixture, off: THREE.Vector3) => {
      const s = stateOf(f.id);
      const d = off.clone().sub(new THREE.Vector3(...s.off));
      if (d.lengthSq() === 0) return;
      for (const o of f.options) for (const id of o.itemIds) shiftItem(id, d);
      for (const o of f.options)
        for (const rid of o.rackIds) {
          const r = racks.find((x) => x.id === rid);
          if (!r) continue;
          rackShift.set(rid, (rackShift.get(rid) ?? new THREE.Vector3()).clone().add(d));
          const ts = spots.get(rid) ?? [];
          rackItems(r).slice(0, ts.length).forEach((id, i) => putOnRack(r, id, ts[i]));
        }
      fixState.set(f.id, { ...s, off: [off.x, off.y, off.z] });
    };
    for (const f of fixtures) {
      const s = fixState.get(f.id);
      if (!s?.off.some(Boolean)) continue;
      fixState.set(f.id, { ...s, off: [0, 0, 0] });
      moveFixture(f, new THREE.Vector3(...s.off));
    }
    if (fixtures.length) saveFixtures();
    const fixBox = new THREE.Box3();
    const fixHelper = new THREE.Box3Helper(fixBox, 0xf07c12);
    fixHelper.visible = false;
    world.add(fixHelper);
    let fixSelected: string[] = [];
    const fitFixtureBox = () => {
      fixBox.makeEmpty();
      for (const fid of fixSelected) {
        const f = fixtureById.get(fid);
        for (const id of f?.options[stateOf(f.id).o]?.itemIds ?? []) {
          const o = swapped.get(id) ?? itemById.get(id);
          if (o && !offItems.has(id) && visibleOf(o)) fixBox.expandByObject(o);
        }
      }
      fixHelper.visible = !fixBox.isEmpty();
    };
    /** the fixture under the pointer (a prop before the bay around it) and where the ray met it */
    const fixtureUnderPointer = () => {
      raycaster.near = camera.near;
      let best: { d: number; id: string; p: THREE.Vector3 } | null = null;
      for (const id of fixturesOfItem.keys()) {
        if (offItems.has(id)) continue;
        const o = swapped.get(id) ?? itemById.get(id);
        if (!o || !visibleOf(o)) continue;
        const hit = raycaster.intersectObject(o, true)[0];
        if (hit && (!best || hit.distance < best.d)) best = { d: hit.distance, id, p: hit.point };
      }
      if (!best) {
        // gaps (between side-hung garments, between a shelf and a rail) still pick: the ray through the box of a
        // shelf / rail with what it carries (that one lifts), else through the whole bay's box
        const boxOf = (ids: string[]) => {
          const box = new THREE.Box3();
          for (const id of ids) {
            const o = swapped.get(id) ?? itemById.get(id);
            if (o && !offItems.has(id) && visibleOf(o)) box.expandByObject(o);
          }
          return box;
        };
        let near: { d: number; f: SceneFixture; p: THREE.Vector3; itemId: string | null; lv: boolean } | null = null;
        for (const f of fixtures) {
          const st = stateOf(f.id);
          if (!(f.tier || f.part) || st.rm || (f.part && st.o === 0)) continue;
          const o = f.options[st.o];
          const tries: [string[], string | null][] = (o?.levelIds ?? []).map((lid) => {
            const lv = levels.find((x) => x.id === lid);
            const garments = (lv?.rackIds ?? []).flatMap((rid) => {
              const r = racks.find((x) => x.id === rid);
              return r ? rackItems(r) : [];
            });
            return [[...(lv?.itemIds ?? []), ...garments], lv?.itemIds[0] ?? null];
          });
          tries.push([o?.itemIds ?? [], null]);
          for (const [ids, itemId] of tries) {
            const box = boxOf(ids);
            const p = box.isEmpty() ? null : raycaster.ray.intersectBox(box, new THREE.Vector3());
            if (!p) continue;
            const d = p.distanceTo(raycaster.ray.origin);
            // a shelf / rail's own box wins over the bay's when both are hit
            if (!near || (itemId && !near.lv) || (!!itemId === near.lv && d < near.d)) near = { d, f, p, itemId, lv: !!itemId };
          }
        }
        return near ? { f: near.f, p: near.p, itemId: near.itemId } : null;
      }
      const size = (f: SceneFixture) => f.options[stateOf(f.id).o]?.itemIds.length ?? 0;
      const f = [...(fixturesOfItem.get(best.id) ?? [])].sort((a, b) => size(a) - size(b))[0];
      return f ? { f, p: best.p, itemId: best.id } : null;
    };
    /** the shelf / rail (level) a thing belongs to: the board / rail itself, what stands on it, a garment on its rack */
    const levelOfItem = (itemId: string | null) => {
      if (!itemId) return undefined;
      const rid = rackOf.get(itemId)?.id;
      return levels.find((l) => l.itemIds.includes(itemId) || (!!rid && !!l.rackIds?.includes(rid)));
    };
    let fixDrag: {
      f: SceneFixture;
      plane: THREE.Plane;
      p0: THREE.Vector3;
      off0: THREE.Vector3;
      dy0: number;
      x: number;
      y: number;
      moved: boolean;
    } | null = null;

    /** a vertical drag: plane through the grab point facing the camera; y in the level's (floor) mm */
    let lift: { lv: SceneLevel; plane: THREE.Plane; y0: number; dy0: number; parent: THREE.Object3D } | null = null;
    const liftY = () => {
      if (!lift) return null;
      const p = raycaster.ray.intersectPlane(lift.plane, new THREE.Vector3());
      return p ? lift.parent.worldToLocal(p).y : null;
    };

    let drag: { r: SceneRack; i: number; slot: string; x: number; y: number; moved: boolean } | null = null;
    // 상품 표시: things standing on a shelf / tray / plinth (caps, shoes, bags, gloves ...) slide left / right
    const slideKey = `vmd-slide:${scene.projectId}`;
    const slid = new Map<string, number>(); // item id -> mm moved sideways
    const SLIDE_CATS = ["모자", "신발", "가방", "장갑", "머플러", "이어워머"];
    const slidable = (slotId: string | null) => {
      const sl = slotId ? currentSlots.find((x) => x.id === slotId) : undefined;
      if (!sl || sl.kind === "image" || rackOf.has(sl.itemId)) return null;
      const item = itemById.get(sl.itemId)?.userData.item as SceneItem | undefined;
      if (!item || item.fit === "model") return null;
      return item.mount === "place" || SLIDE_CATS.includes(sl.category ?? "") ? sl.itemId : null;
    };
    const saveSlides = () => {
      try {
        pageMemory.set(slideKey, JSON.stringify(Object.fromEntries(slid)));
      } catch {
        /* storage blocked */
      }
    };
    try {
      const saved = JSON.parse(pageMemory.get(slideKey) ?? "{}") as Record<string, number>;
      for (const [id, dx] of Object.entries(saved)) {
        if (!dx || !itemById.has(id)) continue;
        shiftItem(id, new THREE.Vector3(dx, 0, 0));
        slid.set(id, dx);
      }
    } catch {
      /* nothing saved */
    }
    const turnKey = `vmd-turn:${scene.projectId}`;
    const turnItem = (itemId: string, deg: number) => {
      const holder = itemById.get(itemId);
      if (!holder || rackOf.has(itemId)) return;
      deg = ((Math.round(deg) % 360) + 360) % 360;
      const d = deg - (turned.get(itemId) ?? 0);
      if (!d) return;
      // about the item's own centre (the holder sits at its bbox centre), the swapped product about its base / hook
      const p = new THREE.Vector3().setFromMatrixPosition(holder.matrix);
      holder.matrix
        .premultiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z))
        .premultiply(new THREE.Matrix4().makeRotationY((d * Math.PI) / 180))
        .premultiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      holder.matrixWorldNeedsUpdate = true;
      holder.updateWorldMatrix(true, true);
      if (itemBoxes.has(holder)) itemBoxes.set(holder, new THREE.Box3().setFromObject(holder));
      swapped.get(itemId)?.quaternion.premultiply(yaw(d));
      if (deg) turned.set(itemId, deg);
      else turned.delete(itemId);
      pageMemory.set(turnKey, JSON.stringify(Object.fromEntries(turned)));
      fitMarks();
    };
    try {
      const saved = JSON.parse(pageMemory.get(turnKey) ?? "{}") as Record<string, number>;
      for (const [id, deg] of Object.entries(saved)) turnItem(id, deg);
    } catch {
      /* nothing saved */
    }
    let slide: { id: string; slot: string; plane: THREE.Plane; p0: THREE.Vector3; dx0: number; x: number; y: number; moved: boolean } | null =
      null;
    const draggable = (slotId: string | null) => {
      const itemId = slotId ? slotItem.get(slotId) : undefined;
      const r = itemId ? rackOf.get(itemId) : undefined;
      return r && rackUnderRay(r) !== null ? { r, i: rackItems(r).indexOf(itemId ?? "") } : null;
    };
    const shownSlots = () => currentSlots.filter((x) => !rackHidden.has(x.itemId) && !offItems.has(x.itemId));
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
      if (fixModeRef.current) {
        // 집기 편집: a click picks the fixture under it, a drag moves it (along the wall / stand, or on the floor)
        const got = fixtureUnderPointer();
        fixClickRef.current(got?.f.id ?? null);
        if (got && (got.f.tier || got.f.part)) {
          // shelves / rails (as built or put in) only go up / down: whatever is grabbed lifts the one it belongs to
          const lv = levelOfItem(got.itemId);
          const parent = got.itemId ? itemById.get(got.itemId)?.parent : null;
          if (lv && parent) {
            const n = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
            lift = {
              lv,
              plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, got.p),
              y0: 0,
              dy0: levelDy.get(lv.id) ?? 0,
              parent,
            };
            lift.y0 = liftY() ?? 0;
            renderer.domElement.setPointerCapture(e.pointerId);
            highlightLevel(lv.id);
          }
          return;
        }
        if (got) {
          const normal = got.f.move === "xz" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
          fixDrag = {
            f: got.f,
            plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, got.p),
            p0: got.p.clone(),
            off0: new THREE.Vector3(...stateOf(got.f.id).off),
            dy0: levelDy.get(got.f.options[1]?.levelIds[0] ?? "") ?? 0,
            x: e.clientX,
            y: e.clientY,
            moved: false,
          };
          renderer.domElement.setPointerCapture(e.pointerId);
        }
        return;
      }
      const holders = [...placedMap.values()].map((p) => p.holder);
      const hit = raycaster.intersectObjects(holders, true)[0];
      if (!hit) {
        const slot = showSlotsRef.current ? slotUnderPointer() : null;
        const d = draggable(slot);
        const sid = slot && !d ? slidable(slot) : null;
        if (slot && d) {
          // a rack garment: a click (no move) still opens it, on pointerup
          drag = { ...d, slot, x: e.clientX, y: e.clientY, moved: false };
          renderer.domElement.setPointerCapture(e.pointerId);
        } else if (slot && sid) {
          // a cap / shoe / bag ...: a click selects it (on pointerup), a drag slides it along its shelf
          const target = swapped.get(sid) ?? itemById.get(sid);
          const hit = target ? raycaster.intersectObject(target, true)[0] : undefined;
          const p0 = hit?.point ?? target?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
          slide = {
            id: sid,
            slot,
            plane: new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), p0),
            p0: p0.clone(),
            dx0: slid.get(sid) ?? 0,
            x: e.clientX,
            y: e.clientY,
            moved: false,
          };
          renderer.domElement.setPointerCapture(e.pointerId);
        } else if (slot) slotClickRef.current(slot);
        else if (showSlotsRef.current) emptyClickRef.current(); // shelves / rails move only in 집기 편집
        return;
      }
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.uid) o = o.parent;
      const entry = o ? placedMap.get(o.userData.uid as string) : undefined;
      if (entry) select(entry.uid);
    };
    let hoverAt = 0;
    const onPointerMove = (e: PointerEvent) => {
      if (lift) {
        setPointer(e);
        const y = liftY();
        if (y !== null && levelTo(lift.lv, lift.dy0 + y - lift.y0)) {
          highlightLevel(lift.lv.id);
          setAnchors(slotAnchorsNow());
          saveLevels();
        }
        renderer.domElement.style.cursor = "ns-resize";
        return;
      }
      if (fixDrag) {
        if (!fixDrag.moved && Math.hypot(e.clientX - fixDrag.x, e.clientY - fixDrag.y) < 4) return;
        fixDrag.moved = true;
        setPointer(e);
        const p = raycaster.ray.intersectPlane(fixDrag.plane, new THREE.Vector3());
        if (p) {
          // world m -> the floor's mm (the store group is mm scaled 1/1000, floors at level 0 here)
          const d = p.sub(fixDrag.p0).multiplyScalar(1000);
          const m = fixDrag.f.move;
          const snap = (v: number) => Math.max(-6000, Math.min(6000, Math.round(v / FIXTURE_SNAP) * FIXTURE_SNAP));
          const off = fixDrag.off0.clone().add(new THREE.Vector3(d.x, m === "xy" ? d.y : 0, m === "xz" ? d.z : 0));
          moveFixture(fixDrag.f, new THREE.Vector3(snap(off.x), snap(off.y), snap(off.z)));
          // a 도구 piece also goes up / down: its level
          const lv = fixDrag.f.part ? levels.find((x) => x.id === fixDrag?.f.options[1]?.levelIds[0]) : undefined;
          if (lv && levelTo(lv, fixDrag.dy0 + d.y)) {
            saveLevels();
            setAnchors(slotAnchorsNow());
          }
          fitFixtureBox();
        }
        renderer.domElement.style.cursor = "grabbing";
        return;
      }
      if (fixModeRef.current && !orbit) {
        const now = performance.now();
        if (now - hoverAt < 60) return; // a raycast over every fixture item: not on every mouse event
        hoverAt = now;
        setPointer(e);
        const over = fixtureUnderPointer();
        renderer.domElement.style.cursor = !over
          ? ""
          : over.f.tier || over.f.part
            ? levelOfItem(over.itemId)
              ? "ns-resize"
              : "pointer"
            : "grab";
        return;
      }
      if (orbit || !currentSlots.length || !showSlotsRef.current) {
        renderer.domElement.style.cursor = "";
        return;
      }
      setPointer(e);
      if (slide) {
        if (!slide.moved && Math.hypot(e.clientX - slide.x, e.clientY - slide.y) < 5) return;
        slide.moved = true;
        const p = raycaster.ray.intersectPlane(slide.plane, new THREE.Vector3());
        if (p) {
          const dx = Math.max(-800, Math.min(800, Math.round((slide.dx0 + (p.x - slide.p0.x) * 1000) / 10) * 10));
          const d = dx - (slid.get(slide.id) ?? 0);
          if (d) {
            shiftItem(slide.id, new THREE.Vector3(d, 0, 0));
            slid.set(slide.id, dx);
            setAnchors(slotAnchorsNow());
          }
        }
        renderer.domElement.style.cursor = "grabbing";
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
      renderer.domElement.style.cursor = draggable(slot) ? "grab" : slidable(slot) ? "ew-resize" : slot ? "pointer" : "";
    };
    const onPointerUp = (e: PointerEvent) => {
      if (fixDrag) {
        if (fixDrag.moved) saveFixtures();
        fixDrag = null;
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
        return;
      }
      if (lift) {
        lift = null;
        highlightLevel(null);
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
        return;
      }
      if (slide) {
        const { slot, moved } = slide;
        slide = null;
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
        if (!moved) {
          if (e.type === "pointerup") slotClickRef.current(slot);
        } else {
          saveSlides();
          renderer.domElement.style.cursor = "ew-resize";
        }
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
      if (!host.clientWidth || orbit || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) return;
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
      if (!host.clientWidth || !orbit || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) return;
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
    let frame = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!host.clientWidth) return; // a 매장연출 tab kept in the background
      const now = performance.now();
      moveBy(Math.min((now - last) / 1000, 0.1));
      last = now;
      controls?.update();
      if (marked.length || markBoxes.some((b) => b.visible)) fitMarks();
      // the selected 집기's box follows its models as they load in
      if (fixSelected.length && (frame += 1) % 12 === 0) fitFixtureBox();
      renderer.render(world, camera);
    };
    tick();

    const onResize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
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
      markSlots(itemIds) {
        marked = [...itemIds];
        fitMarks();
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
      reloadPlan() {
        let savedRacks: Record<string, number | { n: number; t?: number[] }> = {};
        let savedSwaps: Swaps = {};
        try {
          savedRacks = JSON.parse(pageMemory.get(rackKey) ?? "{}");
          savedSwaps = JSON.parse(pageMemory.get(swapKey) ?? "{}");
        } catch {
          /* keep what is shown */
        }
        for (const r of racks) {
          const v = savedRacks[r.id];
          const n = typeof v === "number" ? v : (v?.n ?? r.count);
          if (n === (counts.get(r.id) ?? r.count) && !(typeof v === "object" && v.t)) continue;
          spots.delete(r.id); // spread evenly, as a fresh load would
          layoutRack(r, n, typeof v === "object" ? v.t : undefined);
        }
        const allSlots = scene.shots.flatMap((x) => x.slots ?? []);
        const now = new Map([...swapped].map(([id, h]) => [id, h.userData.productId as string]));
        const jobs: Promise<void>[] = [];
        for (const id of new Set([...now.keys(), ...Object.keys(savedSwaps)])) {
          const want = savedSwaps[id];
          if (now.get(id) === want) continue;
          const cat = allSlots.find((x) => x.itemId === id)?.category;
          const product = want ? (productById.get(want) ?? productById.get(`${cat}/${want}`) ?? null) : null;
          jobs.push(setSwap(id, product).catch(() => {}));
        }
        saveRacks();
        return Promise.all(jobs).then(() => {});
      },
      turnItem(itemId, deg) {
        turnItem(itemId, deg);
      },
      turnOf(itemId: string) {
        return turned.get(itemId) ?? 0;
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
      setFixture(fixtureId, patch) {
        const f = fixtureById.get(fixtureId);
        if (!f) return;
        if (patch.off) moveFixture(f, new THREE.Vector3(...patch.off));
        const s = stateOf(fixtureId);
        const from = f.options[s.o];
        const to = patch.o !== undefined ? f.options[patch.o] : undefined;
        // 좌우 뒤집기: the mirrored option lists the same things in the same order - they keep their state
        const parallel =
          !!from && !!to && from !== to && from.kind !== "off" && to.kind !== "off" && from.itemIds.length === to.itemIds.length;
        const next = {
          ...s,
          ...(patch.o !== undefined ? { o: patch.o, hide: [] } : {}),
          ...(patch.rm !== undefined ? { rm: patch.rm } : {}),
          ...(patch.hide !== undefined ? { hide: patch.hide } : {}),
        };
        if (parallel && from && to)
          next.hide = (s.hide ?? []).map((lid) => to.levelIds[from.levelIds.indexOf(lid)]).filter((x): x is string => !!x);
        fixState.set(fixtureId, next);
        if (next.o !== s.o || next.rm !== s.rm || patch.hide !== undefined || patch.o !== undefined) syncFixtureItems();
        if (parallel && from && to) {
          from.levelIds.forEach((lid, i) => {
            const lv = levels.find((x) => x.id === to.levelIds[i]);
            if (lv) levelTo(lv, levelDy.get(lid) ?? 0);
          });
          from.rackIds.forEach((rid, i) => {
            const a = racks.find((x) => x.id === rid);
            const b = racks.find((x) => x.id === to.rackIds[i]);
            if (!a || !b) return;
            const side = sideOf.get(rackItems(a)[0]);
            if (side !== undefined)
              for (const id of rackItems(b)) {
                sideOf.set(id, side);
                const holder = itemById.get(id);
                if (holder) orient(holder);
              }
            spots.delete(b.id);
            layoutRack(b, counts.get(a.id) ?? a.count);
          });
          from.itemIds.forEach((id, i) => {
            const pid = swapped.get(id)?.userData.productId as string | undefined;
            const nid = to.itemIds[i];
            if (pid !== (swapped.get(nid)?.userData.productId as string | undefined))
              void setSwap(nid, pid ? (productById.get(pid) ?? null) : null);
          });
          saveLevels();
          saveRacks();
        }
        fitFixtureBox();
        saveFixtures();
      },
      selectFixture(fixtureIds) {
        fixSelected = [...fixtureIds];
        fitFixtureBox();
      },
      bayAt(clientX, clientY) {
        setPointer({ clientX, clientY });
        let best: { bay: string; y: number; d: number } | null = null;
        for (const b of scene.shots.flatMap((s) => s.bays ?? [])) {
          // the bay's face plane (mm -> world m); the point must fall inside its width and height
          const p = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -b.z / 1000), new THREE.Vector3());
          if (!p) continue;
          const x = p.x * 1000;
          const y = p.y * 1000;
          const d = Math.abs(x - b.x);
          if (d > b.w / 2 + 60 || y < b.y0 - 200 || y > b.y1 + 200) continue;
          if (!best || d < best.d) best = { bay: b.id, y: Math.round(y), d };
        }
        return best ? { bay: best.bay, y: best.y } : null;
      },
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
        const fixOn = fixHelper.visible;
        const marksOn = markBoxes.map((b) => b.visible);
        selBox.visible = rackHelper.visible = fixHelper.visible = false;
        for (const b of markBoxes) b.visible = false;
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
        fixHelper.visible = fixOn;
        markBoxes.forEach((b, i) => (b.visible = marksOn[i]));
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
    // debug handles: the last viewer opened, and every viewer by project id (매장연출 tabs load in the background)
    const dbg = window as unknown as { __store?: unknown; __stores?: Record<string, unknown> };
    dbg.__stores ??= {};
    dbg.__stores[scene.projectId] = dbg.__store = {
      THREE,
      camera,
      world,
      store,
      floorGroups,
      renderer,
      ceilings,
      debugTop,
      /** 집기 under a frame point (u, v in 0..1) */
      fixtureAt(u: number, v: number) {
        raycaster.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), camera);
        const got = fixtureUnderPointer();
        return got ? { id: got.f.id, n: [...fixturesOfItem.keys()].length } : { id: null, n: [...fixturesOfItem.keys()].length };
      },
    };

    return () => {
      disposed = true;
      downloads.abort();
      draco.dispose();
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
  }, [scene, products, storageKey, swapKey, rackKey, levelKey, fixtureKey, pictureKey, orbit]);

  // ---------------------------------------------------------------- UI
  const e = () => engineRef.current;
  const loading = progress.total > 0 && progress.done < progress.total;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    if (!loading && progress.total > 0) readyRef.current?.();
  }, [loading, progress.total]);
  const planDone = useRef(0);
  useEffect(() => {
    if (!planTick || planDone.current === planTick) return;
    const run = () => {
      if (planDone.current === planTick) return Promise.resolve();
      planDone.current = planTick;
      const job = engineRef.current?.reloadPlan() ?? Promise.resolve();
      // a tab closed mid-way never settles its downloads: the queue does not wait for it forever
      return Promise.race([job, new Promise<void>((r) => window.setTimeout(r, 60_000))]);
    };
    if (active) void run();
    else planQueue = planQueue.then(run, run); // one hidden tab at a time, after the one on screen
  }, [planTick, active]);
  // 매장연출 전체 보기: a picture once loaded and again after products / 집기 change (models load in after a swap)
  const snapRef = useRef(onSnapshot);
  snapRef.current = onSnapshot;
  useEffect(() => {
    if (!snapRef.current || loading || progress.total === 0) return;
    const t = window.setTimeout(() => {
      if (!hostRef.current?.clientWidth) return;
      const url = engineRef.current?.snapshot(640);
      if (url) snapRef.current?.(url);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [loading, progress.total, swaps, rackCounts, fixState, levelDys, shot, snapTick]);
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
  const selectSlots = (ids: string[]) => {
    setSel(ids);
    e()?.markSlots(ids.map((id) => slotOf(id)?.itemId).filter((x): x is string => !!x));
  };
  /** a number / garment click: an image slot opens its popup; a product slot toggles in the selection and shows the
   * 상품 tab. null clears both */
  const pickSlot = (slotId: string | null) => {
    const slot = slotId ? slotOf(slotId) : undefined;
    if (!slotId || slot?.kind === "image") {
      setOpenSlot(slotId);
      e()?.highlightSlot(slot ? slot.itemId : null);
      if (!slotId) selectSlots([]);
      return;
    }
    setOpenSlot(null);
    e()?.highlightSlot(null);
    selectSlots(sel.includes(slotId) ? sel.filter((x) => x !== slotId) : [...sel, slotId]);
    setTab("products");
    if (!panelOpen) setPanelOpen(true); // a selected item is changed from the 상품 tab
  };
  /** every product number on screen now (shown garments), for 모두 선택 */
  const productBadgeIds = showSlots ? badges.map((b) => b.id).filter((id) => slotOf(id)?.kind !== "image") : [];
  // every word of the search in the product's folders / file name / colour (case-insensitive)
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searched = words.length
    ? products.filter((p) => {
        const hay = [...p.path, p.id, p.name, p.color ?? ""].join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      })
    : products;
  const selSlots = sel.map(slotOf).filter((x): x is NonNullable<typeof x> => !!x);
  const selCats = [...new Set(selSlots.map((x) => x.category).filter((x): x is string => !!x))];
  const selRackItems = selSlots.filter((x) => (shot?.racks ?? []).some((r) => r.slotIds.includes(x.id)));
  // caps, gloves, shoes ... (not rack garments, not pictures) turn on the spot: by 45° steps, or to front / side
  const selPlaced = selSlots.filter((x) => x.kind !== "image" && !selRackItems.includes(x));
  const turnSel = (step: number | null, to?: number) => {
    for (const x of selPlaced) e()?.turnItem(x.itemId, step === null ? (to ?? 0) : (e()?.turnOf(x.itemId) ?? 0) + step);
  };
  const applyProduct = (p: VmdProduct | null) => {
    for (const x of selSlots) e()?.setSwap(x.itemId, p);
  };
  const open = openSlot ? slotOf(openSlot) : undefined;
  const openBadge = badges.find((a) => a.id === openSlot);
  const productName = (id: string | undefined) => products.find((p) => p.id === id)?.name;
  // racks / levels / slots of 집기 types not shown (or taken off) leave the bars and the counts
  const shotFixtures = shot?.fixtures ?? [];
  const fixOff = fixtureOff(shot ? [shot] : [], fixState);
  const shotRacks = (shot?.racks ?? []).filter((r) => !fixOff.racks.has(r.id));
  const countOf = (r: SceneRack) => rackCounts[r.id] ?? r.count;
  const openRack = open ? shotRacks.find((r) => r.slotIds.includes(open.id)) : undefined;
  const shownSlotCount =
    (shot?.slots ?? []).filter((x) => !fixOff.items.has(x.itemId)).length -
    shotRacks.reduce((n, r) => n + r.slotIds.length - countOf(r), 0);
  // the label says how it hangs now (옆걸이 / 정면걸이), after the per-rack switch
  const rackLabel = (r: SceneRack) =>
    rackSides[r.id] === undefined ? r.label : r.label.replace(/옆걸이|정면걸이/, rackSides[r.id] ? "옆걸이" : "정면걸이");
  const rackName = (r: SceneRack) => `${r.group ? `${r.group} ` : ""}${rackLabel(r)}`;
  const rackGroups = [...new Set(shotRacks.map((r) => r.group ?? ""))];
  const hoverRack = (r: SceneRack | null) => {
    setRackHover(r?.id ?? null);
    e()?.highlightRack(r?.id ?? null);
  };
  const shotLevels = (shot?.levels ?? []).filter((l) => !fixOff.levels.has(l.id));
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

  // ---------------------------------------------------------------- 집기 (fixtures)
  const fixStateOf = (id: string) => fixState[id] ?? FIXTURE_HOME;
  const shotBays = shot?.bays ?? [];
  const selFix = shotFixtures.find((f) => f.id === fixSel);
  const levelById = (id: string | undefined) => (shot?.levels ?? []).find((l) => l.id === id);
  /** a 도구 piece's one shelf / rail */
  const partLevel = (f: SceneFixture) => levelById(f.options[Math.max(1, fixStateOf(f.id).o)]?.levelIds[0]);
  const bayFixtures = (bay: string) => shotFixtures.filter((f) => f.group === bay && (f.tier || f.part));
  const bayParts = (bay: string) => shotFixtures.filter((f) => f.part?.bay === bay);
  const props = shotFixtures.filter((f) => !f.tier && !f.part);
  /** 집기 편집 on: canvas clicks pick fixtures (the product numbers go away); off: back to products */
  const setFixMode = (on: boolean) => {
    setFixModeState(on);
    if (on) {
      setShowSlots(false);
      pickSlot(null);
      setTab("fixtures");
      if (!panelOpen) setPanelOpen(true);
    }
  };
  /** what is shown in the bay now (zones as built + pieces put in): boxed when the bay is picked */
  const bayShown = (bay: string) =>
    bayFixtures(bay)
      .filter((f) => (f.part ? fixStateOf(f.id).o > 0 : !fixStateOf(f.id).rm))
      .map((f) => f.id);
  const pickFixture = (id: string | null) => {
    const f = shotFixtures.find((x) => x.id === id);
    setFixMsg(null);
    setFixSel(f ? f.id : null);
    setBaySel(f ? (f.part?.bay ?? (f.tier ? f.group : null)) : null);
    e()?.selectFixture(f ? [f.id] : []);
    if (f) {
      setTab("fixtures");
      if (!panelOpen) setPanelOpen(true);
    }
  };
  const pickBay = (bay: string | null) => {
    setFixMsg(null);
    setFixSel(null);
    setBaySel(bay);
    e()?.selectFixture(bay ? bayShown(bay) : []);
  };
  const changeFixture = (id: string, patch: Partial<FixtureState>) => {
    selectSlots([]);
    e()?.setFixture(id, patch);
    setAnchors(e()?.slotAnchors() ?? []);
  };
  const nudgeFixture = (f: SceneFixture, dx: number, dy: number, dz: number) => {
    const o = fixStateOf(f.id).off;
    changeFixture(f.id, { off: [o[0] + dx, o[1] + dy, o[2] + dz] });
  };
  const fixChanged = (f: SceneFixture) => {
    const st = fixStateOf(f.id);
    return f.part ? st.o > 0 : st.o !== 0 || st.rm || st.off.some(Boolean) || !!st.hide?.length;
  };
  const resetFixtures = () => {
    for (const f of shotFixtures) if (fixChanged(f)) changeFixture(f.id, { o: 0, off: [0, 0, 0], rm: false, hide: [] });
    pickBay(baySel);
  };
  /** how far up / down (mm, from its height) a shelf / rail and what it carries take room */
  const bandOf = (lid: string): [number, number] => {
    const part = shotFixtures.find((f) => f.part && f.options.some((o) => o.levelIds.includes(lid)))?.part;
    if (part) return PART_BAND[part.type] ?? [-40, 300];
    const lv = levelById(lid);
    // a shelf with a rail under it: the clothes hang down, what stands on it (heads, bags) goes up
    if (lv?.rackIds?.length) return lv.itemIds.length > 1 ? [PART_BAND.rail[0], 560] : PART_BAND.rail;
    return [-40, 320];
  };
  /** taken heights in a bay now: its shelves / rails as built (not taken off) + pieces put in + racks off any shelf */
  const bayTaken = (bay: string, skip?: string) => {
    const out: [number, number][] = [];
    for (const f of bayFixtures(bay)) {
      const st = fixStateOf(f.id);
      if (f.id === skip || st.rm || (f.part && st.o === 0)) continue;
      const o = f.options[st.o];
      for (const lid of o?.levelIds ?? []) {
        const lv = levelById(lid);
        if (!lv || st.hide?.includes(lid)) continue;
        const y = lv.y + (levelDys[lid] ?? 0);
        const [a, b] = bandOf(lid);
        out.push([y + a, y + b]);
      }
      const inLevel = new Set((o?.levelIds ?? []).flatMap((lid) => levelById(lid)?.rackIds ?? []));
      for (const rid of o?.rackIds ?? []) {
        const r = (shot?.racks ?? []).find((x) => x.id === rid);
        if (r && !inLevel.has(rid)) out.push([r.from[1] + PART_BAND.rail[0], r.from[1] + PART_BAND.rail[1]]);
      }
    }
    return out;
  };
  /** the highest height where a piece of this type fits between what is already in the bay */
  const freeHeight = (bay: string, f: SceneFixture, lv: SceneLevel) => {
    const [a, b] = PART_BAND[f.part?.type ?? ""] ?? [-40, 300];
    const taken = bayTaken(bay, f.id);
    for (let y = lv.max; y >= lv.min; y -= 10) if (taken.every(([lo, hi]) => y + b + 20 <= lo || y + a - 20 >= hi)) return y;
    return null;
  };
  /** put a 도구 piece in a bay: the next one of the pool not there yet, at `y` (dropped) or the highest free height */
  const addPart = (type: string, bay: string, y?: number) => {
    const f = bayParts(bay).find((x) => x.part?.type === type && fixStateOf(x.id).o === 0);
    const label = PART_TYPES.find(([t]) => t === type)?.[1] ?? type;
    if (!f) {
      setFixMsg(`${bay}에는 ${label}을(를) 더 넣을 수 없어요 (최대 ${bayParts(bay).filter((x) => x.part?.type === type).length}개).`);
      return;
    }
    const lv = partLevel(f);
    changeFixture(f.id, { o: 1, off: [0, 0, 0] });
    if (lv) {
      // no free height: hung pieces go to the top, the others to the middle
      const hung = PART_BAND[type]?.[0] < -500;
      const at = y !== undefined ? Math.min(Math.max(y, lv.min), lv.max) : (freeHeight(bay, f, lv) ?? (hung ? lv.max : (lv.min + lv.max) / 2));
      e()?.setLevel(lv.id, at - lv.y);
      e()?.highlightLevel(null);
      setAnchors(e()?.slotAnchors() ?? []);
      if (y === undefined && freeHeight(bay, f, lv) === null) setFixMsg(`${bay}에 빈 높이가 없어 겹치게 넣었어요. 다른 집기를 빼거나 높이를 옮겨 주세요.`);
      else setFixMsg(null);
    }
    setFixSel(f.id);
    setBaySel(bay);
    e()?.selectFixture([f.id]);
  };
  const removePart = (f: SceneFixture) => {
    changeFixture(f.id, { o: 0, off: [0, 0, 0] });
    if (fixSel === f.id) pickBay(f.part?.bay ?? null);
  };
  const clearBay = (bay: string) => {
    for (const f of bayFixtures(bay)) changeFixture(f.id, f.part ? { o: 0 } : { rm: true });
    pickBay(bay);
  };
  const resetBay = (bay: string) => {
    for (const f of bayFixtures(bay)) if (fixChanged(f)) changeFixture(f.id, { o: 0, off: [0, 0, 0], rm: false, hide: [] });
    pickBay(bay);
  };
  const offText = (off: [number, number, number]) => {
    const parts = [
      off[0] ? `${off[0] > 0 ? "오른쪽" : "왼쪽"} ${Math.abs(off[0]) / 10}cm` : "",
      off[1] ? `${off[1] > 0 ? "위" : "아래"} ${Math.abs(off[1]) / 10}cm` : "",
      off[2] ? `${off[2] > 0 ? "앞" : "뒤"} ${Math.abs(off[2]) / 10}cm` : "",
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "제자리";
  };
  const partLeft = (bay: string, type: string) =>
    bayParts(bay).filter((x) => x.part?.type === type && fixStateOf(x.id).o === 0).length;
  /** the bay's contents, top first: shelves / rails as built (each can come off) and pieces put in */
  const bayRows = (bay: string) => {
    type Row = {
      key: string;
      label: string;
      y: number | null;
      type?: string;
      on: boolean;
      act: () => void;
      pick?: () => void;
      lv?: SceneLevel;
      /** 좌우 뒤집기 (옆걸이+정면걸이 hangers) and whether it is flipped now */
      flip?: () => void;
      flipped?: boolean;
    };
    const rows: Row[] = [];
    for (const f of bayFixtures(bay)) {
      const st = fixStateOf(f.id);
      if (f.part) {
        const lv = partLevel(f);
        if (st.o === 0) continue;
        const canFlip = f.options.length > 2;
        rows.push({
          key: f.id,
          label: f.label,
          y: lv ? lv.y + (levelDys[lv.id] ?? 0) : null,
          type: f.part.type,
          on: true,
          lv,
          flip: canFlip ? () => changeFixture(f.id, { o: st.o === 1 ? 2 : 1 }) : undefined,
          flipped: st.o === 2,
          act: () => removePart(f),
          pick: () => pickFixture(f.id),
        });
        continue;
      }
      if (st.rm) {
        rows.push({ key: f.id, label: `${f.label} 원래 집기`, y: null, on: false, act: () => changeFixture(f.id, { rm: false }) });
        continue;
      }
      const lids = f.options[st.o]?.levelIds ?? [];
      const flipAt = f.options.findIndex((o) => o.kind === "flip");
      const zoneFlip = flipAt > 0 ? () => changeFixture(f.id, { o: st.o === flipAt ? 0 : flipAt }) : undefined;
      let flipShown = false;
      for (const lid of lids) {
        const lv = levelById(lid);
        const off = !!st.hide?.includes(lid);
        rows.push({
          key: lid,
          label: `${lv?.label ?? lid}${f.label !== bay ? ` (${f.label})` : ""}`,
          y: lv ? lv.y + (levelDys[lid] ?? 0) : null,
          type: lv?.fixed ? "combo" : lv?.rackIds?.length ? "rail" : "shelf",
          on: !off,
          lv: off ? undefined : lv,
          ...(lv?.fixed && zoneFlip && !off ? ((flipShown = true), { flip: zoneFlip, flipped: st.o === flipAt }) : {}),
          act: () => changeFixture(f.id, { hide: off ? (st.hide ?? []).filter((x) => x !== lid) : [...(st.hide ?? []), lid] }),
          pick: () => {
            setFixSel(null);
            e()?.selectFixture([]);
            e()?.highlightLevel(lid);
          },
        });
      }
      // what stands outside any shelf (loops, arms, posters): off only with the whole zone
      const inLevels = new Set(lids.flatMap((lid) => levelById(lid)?.itemIds ?? []));
      const rackItems = new Set(
        (f.options[st.o]?.rackIds ?? []).flatMap((rid) =>
          ((shot?.racks ?? []).find((r) => r.id === rid)?.slotIds ?? []).map((sid) => slotOf(sid)?.itemId),
        ),
      );
      const loose = (f.options[st.o]?.itemIds ?? []).filter((id) => !inLevels.has(id) && !rackItems.has(id));
      const looseRacks = (f.options[st.o]?.rackIds ?? []).filter((rid) => !lids.some((lid) => levelById(lid)?.rackIds?.includes(rid)));
      if (loose.length || looseRacks.length)
        rows.push({
          key: `${f.id}-rest`,
          label: lids.length ? `${f.label} 나머지 (고리·팔·포스터 등)` : `${f.label} 집기`,
          y: null,
          on: true,
          ...(zoneFlip && !flipShown ? ((flipShown = true), { flip: zoneFlip, flipped: st.o === flipAt, type: "combo" }) : {}),
          act: () => changeFixture(f.id, { rm: true }),
          pick: () => pickFixture(f.id),
        });
    }
    return rows.sort((a, b) => (b.y ?? 3000) - (a.y ?? 3000));
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
                if (ev.target.checked) setFixMode(false);
                if (!ev.target.checked) pickSlot(null);
              }}
            />
            상품 표시 ({shownSlotCount})
          </label>
        )}
        {shotFixtures.length > 0 && (
          <label className="store__check" title="집기(선반·행거·소도구)를 눌러 고르고, 끌어서 옮기고, 타입을 바꾸거나 뺍니다">
            <input type="checkbox" checked={fixMode} onChange={(ev) => setFixMode(ev.target.checked)} />
            집기 편집
          </label>
        )}
        <span className="filterbar__spacer" />
        <button
          type="button"
          className="btn btn--sm"
          aria-pressed={!panelOpen}
          title={panelOpen ? "오른쪽 렌더 시점·상품 패널을 숨기고 화면만 크게 봅니다" : "렌더 시점·상품 패널을 다시 엽니다"}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          {panelOpen ? "패널 숨기기 ▶" : "◀ 패널 보이기"}
        </button>
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

      {fixMode && shotLevels.length > 0 && (
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
        <div
          ref={stageRef}
          className="store__stage"
          style={{ ["--ar" as string]: String(shot ? shot.aspect : 16 / 9) }}
          onDragOver={(ev) => {
            if (!ev.dataTransfer.types.includes(PART_MIME)) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(ev) => {
            const type = ev.dataTransfer.getData(PART_MIME);
            if (!type) return;
            ev.preventDefault();
            if (!fixMode) setFixMode(true);
            const at = e()?.bayAt(ev.clientX, ev.clientY);
            if (at) addPart(type, at.bay, at.y);
            else setFixMsg("칸(벽판·행거) 위에 놓아 주세요.");
          }}
        >
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
                  className={`store__slot${openSlot === b.id ? " store__slot--on" : ""}${sel.includes(b.id) ? " store__slot--sel" : ""}${swappedTo ? " store__slot--swapped" : ""}${inHover ? " store__slot--rack" : ""}`}
                  style={{ left: b.bx, top: b.by }}
                  title={swappedTo ? `${b.id} → ${swappedTo}` : `${b.id} ${slot?.kind === "image" ? "이미지" : "상품"} 변경`}
                  onClick={() => pickSlot(openSlot === b.id ? null : b.id)}
                  aria-pressed={sel.includes(b.id)}
                >
                  {b.id}
                </button>
              );
            })}
          {open && open.kind === "image" && openBadge && (
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
            </div>
          )}
        </div>
        </div>

        {panelOpen && (
        <aside className={`store__panel${tab === "products" || tab === "fixtures" ? " store__panel--wide" : ""}`}>
          <div className="store__tabs">
            {(
              [
                ["shots", `렌더 시점 ${scene.shots.length}`],
                ["products", "상품"],
                ...(shotFixtures.length ? [["fixtures", "집기"]] : []),
              ] as [typeof tab, string][]
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
            <button
              type="button"
              className="store__tab store__panelx"
              aria-label="패널 숨기기"
              title="패널 숨기기 (화면만 크게)"
              onClick={() => setPanelOpen(false)}
            >
              ▶
            </button>
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
                <div className="store__pickbar">
                <div className="store__search">
                  <input
                    type="search"
                    value={query}
                    placeholder="상품 검색 (스타일명·품번·컬러, 띄어쓰기 = 모두 포함)"
                    aria-label="상품 검색"
                    onChange={(ev) => setQuery(ev.target.value)}
                  />
                  {query && (
                    <span className="muted">
                      {searched.length}개
                    </span>
                  )}
                </div>

                  {sel.length ? (
                    <>
                      <span>
                        선택한 아이템 <b>{sel.join(" · ")}</b>
                      </span>
                      <span className="muted">상품을 누르면 선택한 {sel.length}개가 모두 그 상품으로 바뀝니다</span>
                      <span className="store__pickbtns">
                        <button type="button" className="btn btn--sm" onClick={() => applyProduct(null)}>
                          원래 상품으로
                        </button>
                        {selRackItems.length > 0 && (
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => changeRack(() => selRackItems.forEach((x) => e()?.removeFromRack(x.itemId)))}
                          >
                            옷 빼기 {selRackItems.length}
                          </button>
                        )}
                        {selPlaced.length > 0 && (
                          <span className="store__turn" title="모자·장갑·신발 등 방향 (행거 옷은 행거 옆걸이/정면걸이로)">
                            방향
                            <button type="button" className="btn btn--sm" title="왼쪽으로 45°" onClick={() => turnSel(-45)}>
                              ↺
                            </button>
                            <button type="button" className="btn btn--sm" onClick={() => turnSel(null, 0)}>
                              정면
                            </button>
                            <button type="button" className="btn btn--sm" onClick={() => turnSel(null, 90)}>
                              옆면
                            </button>
                            <button type="button" className="btn btn--sm" title="오른쪽으로 45°" onClick={() => turnSel(45)}>
                              ↻
                            </button>
                          </span>
                        )}
                        <button type="button" className="btn btn--sm" onClick={() => selectSlots(productBadgeIds)}>
                          모두 선택
                        </button>
                        <button type="button" className="btn btn--sm" onClick={() => selectSlots([])}>
                          선택 해제
                        </button>
                      </span>
                    </>
                  ) : (
                    <span className="muted">
                      {showSlots && productBadgeIds.length > 0 && (
                        <button type="button" className="btn btn--sm" style={{ float: "right" }} onClick={() => selectSlots(productBadgeIds)}>
                          모두 선택
                        </button>
                      )}
                      {showSlots ? "화면에서 번호나 옷을 눌러 아이템을 고르세요 (여러 개 가능)" : "위 '상품 표시'를 켜고 번호나 옷을 눌러 아이템을 고르세요"}
                    </span>
                  )}
                </div>
              )}
              {query && searched.length === 0 && <div className="muted">'{query}' 에 맞는 상품이 없습니다.</div>}
              {[...productTree(searched).children]
                .sort((a, b) => Number(selCats.includes(b.name)) - Number(selCats.includes(a.name)))
                .map((c) => (
                  <ProductFolder
                    key={`${c.name}|${selCats.join()}|${query ? "q" : ""}`}
                    node={c}
                    open={!!query || !selCats.length || selCats.includes(c.name)}
                    current={selSlots.map((x) => swaps[x.itemId]).filter((x): x is string => !!x)}
                    onPick={sel.length ? applyProduct : null}
                  />
                ))}
            </div>
          )}

          {tab === "fixtures" && (
            <div className="store__fixtures">
              <div className="store__fixtitle">집기 도구</div>
              <div className="muted store__fixhint">
                도구를 화면의 칸 위로 끌어다 놓거나, 칸을 고른 뒤 도구를 누르면 들어갑니다. 선반·행거는 화면에서 잡고 끌면 위아래로 움직입니다.
              </div>
              <div className="store__tools">
                {PART_TYPES.map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    draggable
                    className="store__tool"
                    title={baySel ? `${baySel}에 ${label} 넣기` : `화면의 칸 위로 끌어다 놓기`}
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData(PART_MIME, type);
                      ev.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => (baySel ? addPart(type, baySel) : setFixMsg("먼저 칸을 고르거나, 도구를 화면의 칸 위로 끌어다 놓으세요."))}
                  >
                    <PartIcon type={type} />
                    <span>{label}</span>
                    {baySel && <span className="store__toolleft">{partLeft(baySel, type)}</span>}
                  </button>
                ))}
              </div>
              {fixMsg && <div className="store__fixmsg">{fixMsg}</div>}

              <div className="store__fixtitle">칸</div>
              <div className="store__fixopts">
                {shotBays.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`store__fixopt${baySel === b.id ? " store__fixopt--on" : ""}`}
                    onClick={() => pickBay(baySel === b.id ? null : b.id)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {baySel && (
                <div className="store__fixcard">
                  <div className="store__swaphead">
                    <b>{baySel}</b>
                    <span className="muted">들어 있는 집기 (위에서부터)</span>
                    <button type="button" className="store__swapx" aria-label="선택 해제" onClick={() => pickBay(null)}>
                      ×
                    </button>
                  </div>
                  {bayRows(baySel).length === 0 && <div className="muted">비어 있어요. 위 도구를 넣어 보세요.</div>}
                  {bayRows(baySel).map((r) => (
                    <div key={r.key} className={`store__bayrow${r.on ? "" : " store__bayrow--off"}${fixSel === r.key ? " store__bayrow--on" : ""}`}>
                      <button type="button" className="store__bayrowname" onClick={r.pick} disabled={!r.pick || !r.on}>
                        {r.type ? <PartIcon type={r.type} /> : <span className="store__iconph" />}
                        <span>{r.label}</span>
                        {r.y !== null && <span className="muted">{(r.y / 10).toFixed(0)}cm</span>}
                      </button>
                      {r.flip && (
                        <button
                          type="button"
                          className={`store__bayrowx${r.flipped ? " store__bayrowx--on" : ""}`}
                          title="좌우 뒤집기 (정면걸이를 반대쪽으로)"
                          onClick={r.flip}
                        >
                          ⇄
                        </button>
                      )}
                      {r.lv && (
                        <>
                          <button type="button" className="store__bayrowx" title="올리기" onClick={() => r.lv && moveLevel(r.lv, levelDyOf(r.lv) + r.lv.step)}>
                            ▲
                          </button>
                          <button type="button" className="store__bayrowx" title="내리기" onClick={() => r.lv && moveLevel(r.lv, levelDyOf(r.lv) - r.lv.step)}>
                            ▼
                          </button>
                        </>
                      )}
                      <button type="button" className="store__bayrowx" title={r.on ? "빼기" : "다시 넣기"} onClick={r.act}>
                        {r.on ? "✕" : "↺"}
                      </button>
                    </div>
                  ))}
                  {selFix?.part &&
                    (() => {
                      const lv = partLevel(selFix);
                      return (
                        <div className="store__fixmove">
                          <b className="store__fixmovename">{selFix.label}</b>
                          {lv && (
                            <>
                              <button type="button" onClick={() => moveLevel(lv, levelDyOf(lv) + lv.step)}>
                                ▲ 위
                              </button>
                              <button type="button" onClick={() => moveLevel(lv, levelDyOf(lv) - lv.step)}>
                                ▼ 아래
                              </button>
                            </>
                          )}
                          {lv && <span className="muted">{((lv.y + levelDyOf(lv)) / 10).toFixed(0)}cm</span>}
                        </div>
                      );
                    })()}
                  <div className="store__pickbtns">
                    <button type="button" className="btn btn--sm" onClick={() => clearBay(baySel)}>
                      칸 비우기
                    </button>
                    <button type="button" className="btn btn--sm" disabled={!bayFixtures(baySel).some(fixChanged)} onClick={() => resetBay(baySel)}>
                      칸 원래대로
                    </button>
                  </div>
                </div>
              )}

              {props.length > 0 && (
                <>
                  <div className="store__fixtitle">소도구</div>
                  {props
                    .filter((f) => {
                      const st = fixStateOf(f.id);
                      const its = f.options[0]?.itemIds ?? [];
                      // a prop on a shelf / zone taken off is not there now
                      return st.rm || !its.every((id) => fixOff.items.has(id));
                    })
                    .map((f) => {
                      const st = fixStateOf(f.id);
                      const on = fixSel === f.id;
                      return (
                        <div key={f.id} className={`store__bayrow${st.rm ? " store__bayrow--off" : ""}${on ? " store__bayrow--on" : ""}`}>
                          <button type="button" className="store__bayrowname" disabled={st.rm} onClick={() => pickFixture(on ? null : f.id)}>
                            <span className="store__iconph" />
                            <span>{f.label}</span>
                            <span className="muted">{f.group}{st.off.some(Boolean) ? ` · ${offText(st.off)}` : ""}</span>
                          </button>
                          <button type="button" className="store__bayrowx" title={st.rm ? "다시 놓기" : "빼기"} onClick={() => changeFixture(f.id, { rm: !st.rm })}>
                            {st.rm ? "↺" : "✕"}
                          </button>
                        </div>
                      );
                    })}
                  {selFix && !selFix.tier && !selFix.part && !fixStateOf(selFix.id).rm && (
                    <div className="store__fixmove">
                      <b className="store__fixmovename">{selFix.label}</b>
                      <button type="button" onClick={() => nudgeFixture(selFix, -FIXTURE_STEP, 0, 0)}>
                        ◀
                      </button>
                      <button type="button" onClick={() => nudgeFixture(selFix, FIXTURE_STEP, 0, 0)}>
                        ▶
                      </button>
                      {selFix.move === "xy" && (
                        <>
                          <button type="button" onClick={() => nudgeFixture(selFix, 0, FIXTURE_STEP, 0)}>
                            ▲
                          </button>
                          <button type="button" onClick={() => nudgeFixture(selFix, 0, -FIXTURE_STEP, 0)}>
                            ▼
                          </button>
                        </>
                      )}
                      {selFix.move === "xz" && (
                        <>
                          <button type="button" onClick={() => nudgeFixture(selFix, 0, 0, FIXTURE_STEP)}>
                            앞으로
                          </button>
                          <button type="button" onClick={() => nudgeFixture(selFix, 0, 0, -FIXTURE_STEP)}>
                            뒤로
                          </button>
                        </>
                      )}
                      <button type="button" disabled={!fixStateOf(selFix.id).off.some(Boolean)} onClick={() => changeFixture(selFix.id, { off: [0, 0, 0] })}>
                        제자리
                      </button>
                    </div>
                  )}
                </>
              )}
              <button type="button" className="btn btn--sm" disabled={!shotFixtures.some(fixChanged)} onClick={resetFixtures}>
                집기 모두 원래대로
              </button>
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
        )}
      </div>
    </div>
  );
}

/** one category of the 상품 tab: every product under it as a 3-wide card grid; click = pick / unpick */
function ProductFolder({
  node,
  open,
  current,
  onPick,
}: {
  node: ProductNode;
  open: boolean;
  /** products now on the selected items: orange */
  current: string[];
  /** null: no item selected, the cards do nothing */
  onPick: ((p: VmdProduct) => void) | null;
}) {
  const items = flatProducts(node);
  const n = items.filter((p) => current.includes(p.id)).length;
  return (
    <details className="store__folder" open={open}>
      <summary>
        <span aria-hidden>📁</span> {node.name} <span className="muted">({items.length})</span>
        {n > 0 && <span className="store__pickcount">{n}개 선택</span>}
      </summary>
      <div className="store__pgrid">
        {items.map((p) => {
          const on = current.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={`store__pcard${on ? " store__pcard--on" : ""}${onPick ? "" : " store__pcard--idle"}`}
              aria-pressed={on}
              title={`${p.path.slice(1).join(" / ")} · ${p.color ?? p.name} (${p.id})`}
              onClick={() => onPick?.(p)}
            >
              {p.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumb} alt="" loading="lazy" />
              ) : (
                <span className="store__pcardph" />
              )}
              {on && <span className="store__pcheck" aria-hidden>✓</span>}
              <b>{p.color ?? p.name}</b>
              <span>{(p.path[1] ?? p.name).replace(/^\S+\s/, "")}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
