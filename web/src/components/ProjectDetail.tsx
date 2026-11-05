"use client";

import Link from "next/link";
import { useState } from "react";
import FloorPlan from "@/components/FloorPlan";
import StoreViewer from "@/components/StoreViewer";
import Thumb from "@/components/Thumb";
import type { Floor } from "@/lib/floorplan";
import type { Counts, ProjectUser, RenderPanel, RenderTag } from "@/lib/projects";
import type { DrawingPage, StoreScene, VmdProduct } from "@/lib/scene-types";

/** Serializable view model resolved server-side (local asset URLs + fallbacks). */
export type RenderView = {
  id: string;
  title: string;
  resolution: { x: number; y: number };
  createdAt: string;
  thumb: string | null;
  thumbFallback: string | null;
  full: string | null;
  panel: RenderPanel | null;
  tags: RenderTag[];
};

export type ProjectView = {
  id: string;
  name: string;
  coverUrl: string | null;
  owner: ProjectUser;
  sharedWith: ProjectUser[];
  createdAt: string;
  updatedAt: string;
  floorCount: number;
  areaM2: number;
  counts: Counts;
  floors: Floor[];
  renders: RenderView[];
  /** data/scenes/<id>.json -> 3D 매장 tab + 준공도면 in the 도면 tab */
  store?: { scene: StoreScene; products: VmdProduct[]; vignettes?: StoreScene[] } | null;
};

const nf = new Intl.NumberFormat("ko-KR");

function dateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getUTCFullYear()}.${String(parsed.getUTCMonth() + 1).padStart(2, "0")}.${String(
    parsed.getUTCDate(),
  ).padStart(2, "0")}`;
}

type MainTab = "content" | "portfolio" | "estimate";
type SubTab = "overview" | "render" | "store" | "vmd" | "drawing";

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="notice">
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <p style={{ margin: 0 }}>{hint}</p>
    </div>
  );
}

function PanelRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="panelrow">
      <span className="panelrow__k">{k}</span>
      <span className="panelrow__v">{v}</span>
    </div>
  );
}

/** 이미지 상세 정보 — labels verbatim from the live panel, values from render.panel. */
function RenderPanelView({ render }: { render: RenderView }) {
  const panel: RenderPanel | null = render.panel;
  if (!panel) return <div className="notice">이 렌더의 상세 정보가 없습니다.</div>;

  return (
    <div className="panel">
      <div className="panel__head">이미지 상세 정보</div>

      <div className="panel__group">카메라</div>
      <PanelRow k="렌더 모드" v="실내" />
      <PanelRow k="뷰 종류" v="3인칭" />
      <PanelRow k="해상도" v={panel.resolution} />
      <PanelRow k="카메라 높이" v={`${nf.format(panel.cameraHeightMm)} (mm)`} />
      <PanelRow k="카메라 클립" v={nf.format(panel.cameraClip)} />
      <PanelRow k="시야각" v={`${panel.fov}°`} />
      <PanelRow k="화면 비율" v={panel.aspect} />

      <div className="panel__group">햇빛</div>
      <PanelRow k="월" v={`${panel.sun.month}월`} />
      <PanelRow k="시간" v={panel.sun.time} />
      <PanelRow k="강도" v={panel.sun.intensity} />
      <PanelRow k="방위각" v={`${panel.sun.orientation}°`} />

      <div className="panel__group">간접 조명</div>
      <PanelRow k="강도" v={panel.indirectIntensity} />

      <div className="panel__group">환경값</div>
      <PanelRow k="온도" v={`${nf.format(panel.world.temperature)} K`} />
      <PanelRow k="강도" v={panel.world.intensity} />
      <PanelRow k="수평 회전" v={`${panel.world.rotation}°`} />
      <PanelRow k="실내 온도" v={`${nf.format(panel.interiorTemperature)} K`} />

      <div className="panel__group">기타</div>
      <PanelRow k="배경" v="기본" />
      <PanelRow k="생성일" v={dateLabel(render.createdAt)} />
    </div>
  );
}

function RenderShots({ renders }: { renders: RenderView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = renders.find((render) => render.id === openId) ?? null;

  if (renders.length === 0) {
    return <EmptyState title="렌더샷이 없습니다" hint="이 프로젝트에는 렌더샷이 없습니다." />;
  }

  if (open) {
    return (
      <div>
        <button type="button" className="btn btn--sm" onClick={() => setOpenId(null)} style={{ marginBottom: 12 }}>
          ← 렌더샷 목록
        </button>
        <div className="renderdetail">
          <div className="renderdetail__img">
            <Thumb src={open.thumb} fallback={open.thumbFallback} alt={open.title} className="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <RenderPanelView render={open} />
            {open.full && (
              <a className="btn btn--accent" href={open.full} target="_blank" rel="noreferrer" download>
                ⬇ 다운로드 ({open.resolution.x}×{open.resolution.y})
              </a>
            )}
            {open.tags.length > 0 && (
              <div className="panel">
                <div className="panel__head">화면에 찍힌 제품 {open.tags.length}개</div>
                <div style={{ padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {open.tags.map((tag, index) => (
                    <span key={`${tag.productId}-${index}`} className="chip">
                      {tag.productType} · {tag.productId.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rendergrid">
      {renders.map((render) => (
        <button key={render.id} type="button" className="rendercard" onClick={() => setOpenId(render.id)}>
          <Thumb src={render.thumb} fallback={render.thumbFallback} alt={render.title} className="" />
          <span className="rendercard__cap">
            <span>{render.title}</span>
            <span className="faint">
              {render.resolution.x}×{render.resolution.y}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function FloorPlans({ floors, localProductIds }: { floors: Floor[]; localProductIds: Set<string> }) {
  const [activeId, setActiveId] = useState(floors[0]?.id ?? "");
  const active = floors.find((floor) => floor.id === activeId) ?? floors[0];

  if (!active) return <EmptyState title="도면이 없습니다" hint="이 프로젝트에는 도면이 없습니다." />;

  return (
    <div>
      {floors.length > 1 && (
        <div className="subtabs">
          {floors.map((floor) => (
            <button
              key={floor.id}
              type="button"
              className={`subtab${floor.id === active.id ? " subtab--on" : ""}`}
              onClick={() => setActiveId(floor.id)}
            >
              {floor.title}
            </button>
          ))}
        </div>
      )}
      <FloorPlan floor={active} localProductIds={localProductIds} />
    </div>
  );
}

/** 준공도면 pages (data/drawings/<id>.json) - one large page at a time */
/** 매장연출: one display wall per reference photo, same 상품 표시 / 상품 변경 as 3D 매장 보기 */
function Vignettes({ scenes, products }: { scenes: StoreScene[]; products: VmdProduct[] }) {
  const [active, setActive] = useState(scenes[0]?.projectId);
  const scene = scenes.find((s) => s.projectId === active) ?? scenes[0];
  if (!scene) return null;
  return (
    <div>
      <div className="subtabs">
        {scenes.map((s) => (
          <button
            key={s.projectId}
            type="button"
            className={`subtab${s.projectId === scene.projectId ? " subtab--on" : ""}`}
            onClick={() => setActive(s.projectId)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <StoreViewer key={scene.projectId} scene={scene} products={products} />
    </div>
  );
}

function Drawings({ pages }: { pages: DrawingPage[] }) {
  const [activePage, setActivePage] = useState(pages[0]?.page);
  const active = pages.find((p) => p.page === activePage) ?? pages[0];
  if (!active) return null;

  return (
    <div>
      <div className="subtabs">
        {pages.map((p) => (
          <button
            key={p.page}
            type="button"
            className={`subtab${p.page === active.page ? " subtab--on" : ""}`}
            onClick={() => setActivePage(p.page)}
          >
            {p.title}
          </button>
        ))}
      </div>
      <a className="drawview" href={active.url} target="_blank" rel="noreferrer" title="원본 크기로 열기">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={active.url} alt={active.title} />
      </a>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        준공도면 p.{active.page} · {active.title} · 클릭하면 원본 크기로 열립니다.
      </div>
    </div>
  );
}

export default function ProjectDetail({
  project,
  localProductIds,
}: {
  project: ProjectView;
  localProductIds: string[];
}) {
  const [tab, setTab] = useState<MainTab>("content");
  const store = project.store ?? null;
  const [sub, setSub] = useState<SubTab>(store ? "overview" : "render");
  const linkedSet = new Set(localProductIds);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="projhero">
        {project.coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className="projhero__img" src={project.coverUrl} alt={project.name} />
        ) : (
          <div className="projhero__img" style={{ background: "#2b2f36" }} />
        )}
        <Link href="/ko/projects/team" className="projhero__back" aria-label="뒤로">
          ←
        </Link>
        <div className="projhero__actions">
          {store && (
            <button
              type="button"
              className="btn btn--sm btn--accent"
              onClick={() => (setTab("content"), setSub("store"))}
            >
              3D 매장 보기
            </button>
          )}
          <button type="button" className="btn btn--sm btn--disabled" disabled>
            에디터로 이동
          </button>
          <button type="button" className="btn btn--sm btn--disabled" disabled>
            프로젝트 커버 변경
          </button>
        </div>
        <div className="projhero__overlay">
          <div className="projhero__meta">
            {nf.format(project.floorCount)} 개의 층 · 프로젝트 전체 면적 : 약{" "}
            {nf.format(Math.round(project.areaM2))} m² · 수정일 : {dateLabel(project.updatedAt)} ·
            생성일 : {dateLabel(project.createdAt)}
          </div>
          <div className="projhero__name">{project.name || "Untitled"}</div>
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={`tab${tab === "content" ? " tab--on" : ""}`} onClick={() => setTab("content")}>
          콘텐츠
        </button>
        <button type="button" className={`tab${tab === "portfolio" ? " tab--on" : ""}`} onClick={() => setTab("portfolio")}>
          포트폴리오
        </button>
        <button type="button" className={`tab${tab === "estimate" ? " tab--on" : ""}`} onClick={() => setTab("estimate")}>
          AI 견적 <span className="chip" style={{ marginLeft: 4 }}>Beta</span>
        </button>
      </div>

      {tab === "content" && (
        <div>
          <div className="subtabs">
            {([
              ...(store ? ([["overview", "전체 렌더링"]] as Array<[SubTab, string]>) : []),
              ["render", `렌더 샷${project.counts.render ? ` ${project.counts.render}` : ""}`],
              ["store", "3D 매장 보기"],
              ...(store?.vignettes?.length ? ([["vmd", "매장연출"]] as Array<[SubTab, string]>) : []),
              ["drawing", "도면"],
            ] as Array<[SubTab, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`subtab${sub === key ? " subtab--on" : ""}`}
                onClick={() => setSub(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {sub === "overview" && store && <StoreViewer scene={store.scene} products={store.products} mode="orbit" />}
          {sub === "render" && <RenderShots renders={project.renders} />}
          {sub === "store" &&
            (store ? (
              <StoreViewer scene={store.scene} products={store.products} />
            ) : (
              <EmptyState
                title="3D 매장이 없습니다"
                hint="아직 조립하지 않은 매장입니다 (docs/store-assembly.md 참고)."
              />
            ))}
          {sub === "vmd" && store?.vignettes?.length ? (
            <Vignettes scenes={store.vignettes} products={store.products} />
          ) : null}
          {sub === "drawing" &&
            (store && store.scene.drawings.length > 0 ? (
              <Drawings pages={store.scene.drawings} />
            ) : (
              <FloorPlans floors={project.floors} localProductIds={linkedSet} />
            ))}
        </div>
      )}

      {tab === "portfolio" && (
        <EmptyState
          title="포트폴리오가 없습니다"
          hint={`이 프로젝트에는 포트폴리오가 없습니다.${
            project.counts.bundle > 0 ? ` (포토북 ${project.counts.bundle}건은 수집 범위 밖입니다.)` : ""
          }`}
        />
      )}

      {tab === "estimate" && (
        <EmptyState title="AI 견적이 없습니다" hint="이 프로젝트에는 생성된 AI 견적이 없습니다." />
      )}
    </div>
  );
}
