"use client";

import { useEffect, useMemo, useState } from "react";
import { pageMemory } from "@/components/StoreViewer";
import type { StoreScene, VmdProduct } from "@/lib/scene-types";
import {
  aiBrief,
  decodeHtml,
  applyMapping,
  cleanMapping,
  parsePlanHtml,
  substituteCandidates,
  vignetteTargets,
  type Plan,
  type PlanMapping,
} from "@/lib/vmd-plan";

/** opened from another PC (http://<server ip>:3939): the AI runs on that PC's own Claude Code - its 도우미
 *  (/api/vmd-plan/helper, PowerShell) takes the work through /api/vmd-plan/relay - not on the server's subscription */
const viaHelper = () => typeof window !== "undefined" && !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
type AiAnswer = { ok: boolean; mapping?: PlanMapping; error?: string; detail?: string };
/** this browser's pairing token with its 도우미 (crypto.getRandomValues works on plain http too) */
function helperToken() {
  let t = pageMemory.get("vmd-ai-token");
  if (!t) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    t = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    pageMemory.set("vmd-ai-token", t);
  }
  return t;
}
/** claude -p --output-format json stdout -> the same answer the server route gives */
function fromClaude(out: string): AiAnswer {
  try {
    const j = JSON.parse(out) as { structured_output?: PlanMapping; is_error?: boolean; result?: string };
    return j.structured_output && !j.is_error ? { ok: true, mapping: j.structured_output } : { ok: false, error: "AI 분석에 실패했습니다", detail: j.result };
  } catch {
    return { ok: false, error: "AI 분석에 실패했습니다. 도우미 창에서 claude 로그인을 확인하세요.", detail: out.slice(0, 300) };
  }
}
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
/** copy on plain http too (navigator.clipboard needs https) */
function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  return Promise.resolve();
}

/** a list-size copy of a product thumbnail (/api/assets ?w=) */
const small = (url: string) => `${url}${url.includes("?") ? "&" : "?"}w=120`;

/** the last plan + mapping (survive a reload so the preview can be reopened / undone) */
const LAST_KEY = "vmd-plan:last";
const BACKUP_KEY = "vmd-plan:backup";

type Saved = { plan: Plan; mapping: PlanMapping; file: string; appliedAt?: string };

/**
 * 연출표 불러오기: an HTML 연출표 -> (Claude Code) 벽장 ↔ 매장연출 연결 + 대체 상품 -> preview people can edit -> every
 * 매장연출 at once (writes the same storage keys StoreViewer reads: vmd-swaps / vmd-racks per vignette).
 */
export default function VmdPlanImport({
  scenes,
  products,
  onClose,
  onApplied,
}: {
  scenes: StoreScene[];
  products: VmdProduct[];
  onClose: () => void;
  onApplied: (projectIds: string[]) => void;
}) {
  const targets = useMemo(() => scenes.map(vignetteTargets), [scenes]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);
  const [saved, setSaved] = useState<Saved | null>(() => {
    try {
      return JSON.parse(pageMemory.get(LAST_KEY) ?? "null") as Saved | null;
    } catch {
      return null;
    }
  });
  const [plan, setPlan] = useState<Plan | null>(saved?.plan ?? null);
  const [file, setFile] = useState(saved?.file ?? "");
  const [mapping, setMapping] = useState<PlanMapping | null>(saved?.mapping ?? null);
  const [busy, setBusy] = useState<number | null>(null); // seconds since the AI step started
  const [error, setError] = useState<string | null>(null);
  const [cli, setCli] = useState<{ ok: boolean; version?: string; error?: string; provider?: string } | null>(null);
  // the server's company key serves everyone; without it, another PC goes through its own Claude Code (도우미)
  const [serverAi, setServerAi] = useState<boolean | null>(null);
  const remote = viaHelper() && serverAi === false;
  const [copied, setCopied] = useState(false);
  const token = remote ? helperToken() : "";
  const relay = `/api/vmd-plan/relay?t=${token}`;
  const helperCmd = remote ? `irm "${window.location.origin}/api/vmd-plan/helper?t=${token}" | iex` : "";
  const hasBackup = !!pageMemory.get(BACKUP_KEY);

  const checkCli = () => {
    setCli(null);
    if (serverAi === null) {
      fetch("/api/vmd-plan")
        .then((r) => r.json())
        .then((j: { ok: boolean; provider?: string; version?: string; error?: string }) => {
          const server = j.provider === "azure" || (j.ok && !viaHelper());
          setServerAi(server);
          if (server) setCli(j);
        })
        .catch(() => setServerAi(false));
      return;
    }
    (remote ? fetch(`${relay}&status=1`) : fetch("/api/vmd-plan"))
      .then((r) => r.json())
      .then((j: { ok: boolean; online?: boolean; version?: string; error?: string }) =>
        setCli(remote ? (j.online ? { ok: true, version: j.version } : { ok: false, error: "이 PC 의 AI 도우미가 켜져 있지 않습니다" }) : j),
      )
      .catch(() =>
        setCli({
          ok: false,
          error: remote ? "이 PC 에 AI 도우미가 켜져 있지 않습니다" : "서버에 연결하지 못했습니다",
        }),
      );
  };
  useEffect(checkCli, [serverAi]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (busy === null) return;
    const t = window.setTimeout(() => setBusy((b) => (b === null ? null : b + 1)), 1000);
    return () => window.clearTimeout(t);
  }, [busy]);

  const stats = useMemo(() => {
    if (!plan) return null;
    const all = plan.walls.flatMap((w) => w.blocks.flatMap((b) => b.items));
    const skus = new Map(all.map((i) => [i.k, i] as const));
    return { items: all.length, skus: skus.size, have: [...skus.values()].filter((i) => i.product).length };
  }, [plan]);

  const result = useMemo(
    () => (plan && mapping ? applyMapping(plan, mapping, targets, scenes, products) : null),
    [plan, mapping, targets, scenes, products],
  );

  const readFile = async (f: File) => {
    setError(null);
    const html = decodeHtml(await f.arrayBuffer());
    const p = parsePlanHtml(html, products);
    if (!p) {
      const kb = Math.round(f.size / 1024);
      setError(
        `연출표를 읽지 못했습니다 (${f.name}, ${kb.toLocaleString()} KB). 벽장별 연출상품 HTML 원본 파일인지 확인하세요 - ` +
          "브라우저에서 열어 「다른 이름으로 저장」 한 파일이나 메신저 미리보기로 받은 파일은 내용이 빠질 수 있어요.",
      );
      return;
    }
    setPlan(p);
    setFile(f.name);
    setMapping(null);
  };

  /** hand the brief to this PC's 도우미 through the server and wait for claude's answer */
  const viaRelay = async (brief: unknown): Promise<AiAnswer> => {
    const sub = (await (
      await fetch(`${relay}&submit=1`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief }) })
    ).json()) as { ok: boolean; id?: string; error?: string };
    if (!sub.ok || !sub.id) return { ok: false, error: sub.error ?? "요청을 보내지 못했습니다" };
    const t0 = Date.now();
    for (;;) {
      await sleep(2000);
      const st = (await (await fetch(`${relay}&job=${sub.id}`)).json()) as { ok: boolean; done?: boolean; taken?: boolean; out?: string };
      if (st.done && st.out !== undefined) return fromClaude(st.out ?? "");
      if (!st.taken && Date.now() - t0 > 30_000)
        return { ok: false, error: "AI 도우미가 응답하지 않습니다. 도우미 창이 열려 있는지 확인하고 다시 시도하세요." };
      if (Date.now() - t0 > 6 * 60_000) return { ok: false, error: "AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도하세요." };
    }
  };

  const runAi = async (fresh = false) => {
    if (!plan) return;
    setError(null);
    setBusy(0);
    try {
      const brief = aiBrief(plan, targets, products);
      const j: AiAnswer = remote
        ? await viaRelay(brief)
        : await (
            await fetch(`/api/vmd-plan${fresh ? "?fresh=1" : ""}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ brief }),
            })
          ).json();
      if (!j.ok || !j.mapping) throw new Error(`${j.error ?? "AI 분석 실패"}${j.detail ? ` (${j.detail.slice(0, 160)})` : ""}`);
      const m = cleanMapping(j.mapping, plan, targets, products);
      setMapping(m);
      remember(plan, m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remember = (p: Plan, m: PlanMapping, appliedAt?: string) => {
    const s = { plan: p, mapping: m, file, appliedAt };
    setSaved(s);
    pageMemory.set(LAST_KEY, JSON.stringify(s));
  };

  const editWall = (wall: string, fn: (w: PlanMapping["walls"][number]) => PlanMapping["walls"][number]) => {
    if (!mapping || !plan) return;
    const m = { ...mapping, walls: mapping.walls.map((w) => (w.wall === wall ? fn(w) : w)) };
    setMapping(m);
    remember(plan, m);
  };
  const editSub = (sku: string, product: string | null) => {
    if (!mapping || !plan) return;
    const rest = mapping.substitutes.filter((s) => s.sku !== sku);
    const old = mapping.substitutes.find((s) => s.sku === sku);
    const m = { ...mapping, substitutes: [...rest, { sku, product, note: product === old?.product ? old?.note : "직접 고름" }] };
    setMapping(m);
    remember(plan, m);
  };

  const apply = () => {
    if (!plan || !mapping || !result) return;
    // keep what each vignette had, for 되돌리기
    const backup: Record<string, Record<string, string | null>> = {};
    for (const s of scenes) {
      backup[s.projectId] = {
        swaps: pageMemory.get(`vmd-swaps:${s.projectId}`) ?? null,
        racks: pageMemory.get(`vmd-racks:${s.projectId}`) ?? null,
      };
    }
    pageMemory.set(BACKUP_KEY, JSON.stringify(backup));
    const touched: string[] = [];
    for (const [pid, rec] of Object.entries(result.byVignette)) {
      pageMemory.set(`vmd-swaps:${pid}`, JSON.stringify(rec.swaps));
      let racks: Record<string, unknown> = {};
      try {
        racks = JSON.parse(pageMemory.get(`vmd-racks:${pid}`) ?? "{}");
      } catch {
        /* none */
      }
      for (const [rid, n] of Object.entries(rec.racks)) {
        const old = racks[rid];
        racks[rid] = { n, ...(old && typeof old === "object" && "side" in old ? { side: (old as { side: boolean }).side } : {}) };
      }
      pageMemory.set(`vmd-racks:${pid}`, JSON.stringify(racks));
      touched.push(pid);
    }
    remember(plan, mapping, new Date().toISOString());
    onApplied(touched);
  };

  const undo = () => {
    try {
      const backup = JSON.parse(pageMemory.get(BACKUP_KEY) ?? "{}") as Record<string, Record<string, string | null>>;
      for (const [pid, b] of Object.entries(backup)) {
        for (const k of ["swaps", "racks"]) {
          if (b[k] === null) pageMemory.delete(`vmd-${k}:${pid}`);
          else pageMemory.set(`vmd-${k}:${pid}`, b[k] as string);
        }
      }
      pageMemory.delete(BACKUP_KEY);
      onApplied(Object.keys(backup));
    } catch {
      setError("되돌릴 내용이 없습니다");
    }
  };

  const missing = useMemo(() => {
    if (!plan) return [];
    const m = new Map<string, Plan["walls"][number]["blocks"][number]["items"][number]>();
    for (const w of plan.walls) for (const b of w.blocks) for (const it of b.items) if (!it.product) m.set(it.k, it);
    return [...m.values()];
  }, [plan]);

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal__box vplan" onClick={(e) => e.stopPropagation()}>
        <div className="vplan__head">
          <b>연출표 불러오기</b>
          <span className="muted">벽장별 연출상품 HTML → 매장연출 01~08 에 한 번에 입히기 (1층만)</span>
          <button type="button" className="btn btn--sm" style={{ marginLeft: "auto" }} onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="vplan__step">
          <div className="vplan__n">1</div>
          <div style={{ flex: 1 }}>
            <label className="btn btn--sm">
              HTML 파일 고르기
              <input
                type="file"
                accept=".html,.htm,text/html"
                hidden
                onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])}
              />
            </label>{" "}
            {plan && stats && (
              <span className="vplan__sum">
                <b>{file || plan.title}</b> · 1층 벽장 {plan.walls.length}개 · 상품 {stats.items}벌 · SKU {stats.skus}개 중 3D{" "}
                <b>{stats.have}</b>개
                {plan.skipped.length > 0 && <span className="muted"> · 제외(2층): {plan.skipped.length}개 벽장</span>}
                {plan.source === "cards" && <span className="muted"> · 데이터 블록이 없어 화면 카드에서 읽음</span>}
              </span>
            )}
          </div>
        </div>

        <div className="vplan__step">
          <div className="vplan__n">2</div>
          <div style={{ flex: 1 }}>
            <button
              type="button"
              className="btn btn--sm btn--accent"
              disabled={!plan || busy !== null || cli?.ok === false}
              onClick={() => void runAi(!!mapping)}
            >
              {busy !== null ? `AI 분석 중… ${busy}초` : mapping ? "AI 다시 분석" : "AI 로 벽장 연결·대체 상품 찾기"}
            </button>{" "}
            <span className="muted" style={{ fontSize: 12 }}>
              {cli === null
                ? "AI 확인 중…"
                : cli.ok
                  ? cli.provider === "azure"
                    ? "AI로 분석"
                    : `이 PC 의 Claude Code (${cli.version}) · 로그인한 구독으로 실행${remote ? " (AI 도우미)" : ""}`
                  : cli.error}
            </span>
            {remote && cli && !cli.ok && (
              <div className="vplan__helper">
                <b>내 PC 의 Claude Code 로 분석하려면</b> (처음 한 번, 쓰는 동안 창을 열어 두기)
                <ol>
                  <li>
                    Claude Code 가 설치·로그인되어 있어야 합니다 (터미널에서 <code>claude</code> 실행 → 로그인).
                  </li>
                  <li>
                    PowerShell 을 열고 아래 한 줄을 붙여넣어 실행 → 「AI 도우미 실행 중」 이 뜨면 그대로 둡니다.
                    <div className="vplan__cmd">
                      <code>{helperCmd}</code>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => {
                          void copyText(helperCmd).then(() => setCopied(true));
                        }}
                      >
                        {copied ? "복사됨" : "복사"}
                      </button>
                    </div>
                  </li>
                  <li>아래 「다시 확인」 → 「이 PC 의 Claude Code … (AI 도우미)」 가 보이면 준비 완료.</li>
                </ol>
                <button type="button" className="btn btn--sm" onClick={checkCli}>
                  다시 확인
                </button>
              </div>
            )}
          </div>
        </div>
        {error && <div className="vplan__err">{error}</div>}

        {plan && mapping && result && (
          <>
            <div className="vplan__step vplan__step--top">
              <div className="vplan__n">3</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vplan__title">벽장 → 매장연출 연결 (고칠 수 있어요)</div>
                {plan.walls.map((w) => {
                  const wm = mapping.walls.find((x) => x.wall === w.id);
                  const t = targets.find((x) => x.id === wm?.vignette);
                  return (
                    <div key={w.id} className="vplan__wall">
                      <div className="vplan__wallhead">
                        <b>
                          {w.id} {w.concept}
                        </b>
                        <span className="muted">
                          {w.sec} · {w.side}
                        </span>
                        <span>→</span>
                        <select
                          className="input"
                          value={wm?.vignette ?? ""}
                          onChange={(e) =>
                            editWall(w.id, (x) => ({
                              ...x,
                              vignette: e.target.value || null,
                              blocks: x.blocks.map((b) => ({ ...b, targets: [] })),
                            }))
                          }
                        >
                          <option value="">(넣지 않음)</option>
                          {targets.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        {wm?.note && <span className="muted vplan__note">{wm.note}</span>}
                      </div>
                      {t &&
                        w.blocks.filter((b) => b.items.length > 0).map((b) => {
                          const bm = wm?.blocks.find((x) => x.block === b.id);
                          const row = result.rows.find((r) => r.wall === w.id && r.block === b.title);
                          const options = [
                            ...t.racks.map((r) => ({ id: r.id, label: `${r.bay} ${r.label} (${r.cap})` })),
                            ...Object.entries(t.pools).map(([k, l]) => ({ id: `pool:${k}`, label: `${k} 진열 (${l.length})` })),
                          ];
                          const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? id;
                          return (
                            <div key={b.id} className="vplan__block">
                              <span className="vplan__bt">{b.title}</span>
                              <span className="vplan__targets">
                                {(bm?.targets ?? []).map((id) => (
                                  <span key={id} className="vplan__chip">
                                    {labelOf(id)}
                                    <button
                                      type="button"
                                      title="빼기"
                                      onClick={() =>
                                        editWall(w.id, (x) => ({
                                          ...x,
                                          blocks: x.blocks.map((y) =>
                                            y.block === b.id ? { ...y, targets: y.targets.filter((z) => z !== id) } : y,
                                          ),
                                        }))
                                      }
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ))}
                                <select
                                  className="input vplan__add"
                                  value=""
                                  onChange={(e) => {
                                    const id = e.target.value;
                                    if (!id) return;
                                    editWall(w.id, (x) => ({
                                      ...x,
                                      blocks: x.blocks.some((y) => y.block === b.id)
                                        ? x.blocks.map((y) => (y.block === b.id ? { ...y, targets: [...y.targets, id] } : y))
                                        : [...x.blocks, { block: b.id, targets: [id] }],
                                    }));
                                  }}
                                >
                                  <option value="">+ 자리</option>
                                  {options
                                    .filter((o) => !(bm?.targets ?? []).includes(o.id))
                                    .map((o) => (
                                      <option key={o.id} value={o.id}>
                                        {o.label}
                                      </option>
                                    ))}
                                </select>
                              </span>
                              <span className="vplan__strip" title="이 블록 상품 (거는 순서, 좌→우)">
                                {b.items.map((it, i) => {
                                  const subId = it.product ? null : mapping.substitutes.find((x) => x.sku === it.k)?.product;
                                  const p = productById.get(it.product ?? subId ?? "");
                                  return (
                                    <span
                                      key={`${it.k}-${i}`}
                                      className={`vplan__pc${p ? "" : " vplan__pc--none"}`}
                                      title={`${i + 1}. ${it.name}\n${it.k}${it.info ? ` · ${it.info}` : ""}${
                                        subId && p ? `\n→ 대체: ${p.name}` : p ? "" : "\n3D 없음 (비워 둠)"
                                      }`}
                                    >
                                      {p?.thumb ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={small(p.thumb)} alt="" loading="lazy" />
                                      ) : (
                                        <i>{it.r === "acc" ? "용품" : it.r === "shoe" ? "슈즈" : "없음"}</i>
                                      )}
                                      {subId && p && <b className="vplan__pcsub">대체</b>}
                                      <small>{it.k.split("-")[1]}</small>
                                    </span>
                                  );
                                })}
                              </span>
                              <span
                                className={`vplan__count${row && row.placed < row.total ? " vplan__count--short" : ""}`}
                                title={row?.note}
                              >
                                {row ? `${row.placed}/${row.total}` : ""}
                                {row?.note ? ` · ${row.note}` : ""}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </div>

            {missing.length > 0 && (
              <div className="vplan__step vplan__step--top">
                <div className="vplan__n">4</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="vplan__title">3D 가 없는 상품 {missing.length}개 → 대체 상품 (AI 추천)</div>
                  <div className="vplan__subs">
                    {missing.map((it) => {
                      const s = mapping.substitutes.find((x) => x.sku === it.k);
                      const cands = substituteCandidates(it, products);
                      const p = s?.product ? productById.get(s.product) : undefined;
                      return (
                        <div key={it.k} className="vplan__sub">
                          <span className="mono">{it.k}</span>
                          <span className="vplan__subname">{it.name}</span>
                          <span>→</span>
                          {p?.thumb && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={small(p.thumb)} alt="" className="vplan__thumb" />
                          )}
                          <select
                            className="input"
                            value={s?.product ?? ""}
                            onChange={(e) => editSub(it.k, e.target.value || null)}
                          >
                            <option value="">(비워 두기)</option>
                            {s?.product && !cands.some((c) => c.id === s.product) && (
                              <option value={s.product}>{productById.get(s.product)?.name ?? s.product}</option>
                            )}
                            {cands.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          {s?.note && <span className="muted vplan__note">{s.note}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {(mapping.fixtures?.length ?? 0) > 0 && (
              <div className="vplan__step vplan__step--top">
                <div className="vplan__n">!</div>
                <div style={{ flex: 1 }}>
                  <div className="vplan__title">집기 제안 (집기 편집에서 직접 바꿔 주세요)</div>
                  <ul className="vplan__fix">
                    {mapping.fixtures!.map((f, i) => (
                      <li key={i}>
                        <b>{targets.find((t) => t.id === f.vignette)?.name ?? f.vignette}</b> {f.note}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}

        <div className="vplan__foot">
          {saved?.appliedAt && (
            <span className="muted" style={{ fontSize: 12 }}>
              마지막 적용 {new Date(saved.appliedAt).toLocaleString("ko-KR")}
            </span>
          )}
          {hasBackup && (
            <button type="button" className="btn btn--sm" onClick={undo}>
              적용 전으로 되돌리기
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            style={{ marginLeft: "auto" }}
            disabled={!result || Object.keys(result.byVignette).length === 0}
            onClick={apply}
          >
            {result
              ? `${Object.keys(result.byVignette).length}개 매장연출에 적용 (${result.rows.reduce((a, r) => a + r.placed, 0)}벌)`
              : "적용"}
          </button>
        </div>
      </div>
    </div>
  );
}
