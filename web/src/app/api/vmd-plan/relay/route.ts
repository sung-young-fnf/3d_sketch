import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 연출표 AI relay for people who open this server from another PC. Their page cannot run their Claude Code, and a
 * browser may not reach their 127.0.0.1 from an http://<server ip> page, so their 도우미 (../helper, PowerShell)
 * calls in instead:
 *   helper  GET  ?t=<token>&wait=1&v=<claude version>  -> { job: { id, brief } | null }   (long poll, ~25 s)
 *   helper  POST ?t=<token>  { id, out }                 out = `claude -p --output-format json` stdout
 *   page    GET  ?t=<token>&status=1                     -> { online, version }
 *   page    POST ?t=<token>&submit=1  { brief }          -> { id }
 *   page    GET  ?t=<token>&job=<id>                     -> { done, out }
 * The token is random per browser (only that browser and its helper know it): each person's page reaches only their
 * own helper, so everyone's analysis runs on their own subscription. State lives in memory (jobs are minutes long).
 */
type Job = { id: string; brief: string; taken: boolean; out?: string; at: number };
type Peer = { seen: number; version: string; jobs: Map<string, Job>; wake: (() => void)[] };
const g = globalThis as unknown as { __vmdRelay?: Map<string, Peer> };
const peers = (g.__vmdRelay ??= new Map());

const peer = (t: string) => {
  let p = peers.get(t);
  if (!p) peers.set(t, (p = { seen: 0, version: "", jobs: new Map(), wake: [] }));
  for (const [id, j] of p.jobs) if (Date.now() - j.at > 30 * 60_000) p.jobs.delete(id);
  return p;
};
const tokenOf = (request: Request) => {
  const t = new URL(request.url).searchParams.get("t") ?? "";
  return /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
};
const nextJob = (p: Peer) => [...p.jobs.values()].find((j) => !j.taken);

export async function GET(request: Request) {
  const t = tokenOf(request);
  if (!t) return NextResponse.json({ ok: false, error: "bad token" }, { status: 400 });
  const q = new URL(request.url).searchParams;
  const p = peer(t);
  if (q.get("status")) return NextResponse.json({ ok: true, online: Date.now() - p.seen < 45_000, version: p.version });
  const jobId = q.get("job");
  if (jobId) {
    const j = p.jobs.get(jobId);
    if (!j) return NextResponse.json({ ok: false, error: "작업이 없습니다" }, { status: 404 });
    return NextResponse.json({ ok: true, done: j.out !== undefined, taken: j.taken, out: j.out ?? null });
  }
  // the helper asking for work
  p.seen = Date.now();
  p.version = (q.get("v") ?? "").slice(0, 80);
  let job = nextJob(p);
  if (!job && q.get("wait")) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 25_000);
      p.wake.push(() => (clearTimeout(timer), resolve()));
    });
    p.seen = Date.now();
    job = nextJob(p);
  }
  if (!job) return NextResponse.json({ ok: true, job: null });
  job.taken = true;
  return NextResponse.json({ ok: true, job: { id: job.id, brief: job.brief } });
}

export async function POST(request: Request) {
  const t = tokenOf(request);
  if (!t) return NextResponse.json({ ok: false, error: "bad token" }, { status: 400 });
  const q = new URL(request.url).searchParams;
  const p = peer(t);
  let body: { brief?: unknown; id?: string; out?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "요청 형식이 잘못되었습니다" }, { status: 400 });
  }
  if (q.get("submit")) {
    const brief = JSON.stringify(body.brief ?? null);
    if (!body.brief || brief.length > 400_000) return NextResponse.json({ ok: false, error: "요약이 비었거나 너무 큽니다" }, { status: 400 });
    const id = crypto.randomUUID();
    p.jobs.set(id, { id, brief, taken: false, at: Date.now() });
    for (const w of p.wake.splice(0)) w();
    return NextResponse.json({ ok: true, id });
  }
  // the helper's answer
  const j = body.id ? p.jobs.get(body.id) : undefined;
  if (!j) return NextResponse.json({ ok: false, error: "작업이 없습니다" }, { status: 404 });
  p.seen = Date.now();
  j.out = String(body.out ?? "").slice(0, 2_000_000);
  return NextResponse.json({ ok: true });
}
