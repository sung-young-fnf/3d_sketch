import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { DATA_DIR } from "@/lib/paths";
import { PLAN_PROMPT, PLAN_SCHEMA } from "@/lib/vmd-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 연출표 AI step: the browser sends the compact brief (lib/vmd-plan.ts aiBrief), this runs the Claude Code CLI
 * installed and logged in on this PC (`claude -p`, the user's own subscription - no key in the app) and returns
 * the structured answer. Answers are kept in data/vmd-plans/<hash>.json so the same brief is not asked twice.
 * Only for the PC itself: the server runs on each person's machine and someone on the LAN must not spend its plan.
 */
// the native installer's place when the server's PATH does not have it
const HOME_BIN = path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
const CLAUDE = process.env.CLAUDE_BIN || (fs.existsSync(HOME_BIN) ? HOME_BIN : "claude");
const CACHE_DIR = path.join(DATA_DIR, "vmd-plans");
const TIMEOUT_MS = 240_000;

// ------------------------------------------------------------------ Azure OpenAI (the company key in ../.env)
/** fnf_3dsketch/.env: model / key / endPoint (…/openai/responses?api-version=…) / deployment. Read per request so a
 *  changed key needs no restart; never sent to the browser. */
function azureConfig() {
  try {
    const text = fs.readFileSync(path.resolve(process.cwd(), "..", ".env"), "utf8");
    const env = Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
    if (!env.key || !env.endPoint || !env.deployment) return null;
    return { key: env.key, url: env.endPoint, deployment: env.deployment, model: env.model || env.deployment };
  } catch {
    return null;
  }
}

/** strict structured output wants every property required and no extras: optional notes become required strings */
function strict(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strict);
  if (!schema || typeof schema !== "object") return schema;
  const o = Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, strict(v)])) as Record<string, unknown>;
  if (o.type === "object" && o.properties) {
    o.required = Object.keys(o.properties as object);
    o.additionalProperties = false;
  }
  return o;
}

async function askAzure(az: NonNullable<ReturnType<typeof azureConfig>>, body: string) {
  const r = await fetch(az.url, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": az.key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: az.deployment,
      input: [
        { role: "system", content: PLAN_PROMPT },
        { role: "user", content: `<data>\n${body}\n</data>` },
      ],
      text: { format: { type: "json_schema", name: "vmd_plan", strict: true, schema: strict(PLAN_SCHEMA) } },
    }),
  });
  const j = (await r.json().catch(() => ({}))) as {
    output?: { type: string; content?: { type: string; text?: string }[] }[];
    error?: { message?: string };
  };
  const text = j.output?.find((o) => o.type === "message")?.content?.find((c) => c.type === "output_text")?.text;
  if (!r.ok || !text) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
  return JSON.parse(text) as unknown;
}

function local(request: Request) {
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  return ["localhost", "127.0.0.1", "[::1]"].includes(host);
}

function run(args: string[], input: string | null, timeout: number) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    let out = "";
    let err = "";
    let child;
    try {
      child = spawn(CLAUDE, args, { cwd: os.tmpdir(), windowsHide: true, env: process.env });
    } catch (e) {
      resolve({ code: -1, out: "", err: String(e) });
      return;
    }
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => (err += String(e)));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
    if (input !== null) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** is the CLI there (and which version) */
export async function GET(request: Request) {
  const az = azureConfig();
  if (az) return NextResponse.json({ ok: true, provider: "azure", version: `회사 키 · Azure OpenAI ${az.model}` });
  // no key: Claude Code on this PC only (someone on another PC uses their own through the 도우미)
  if (!local(request)) return NextResponse.json({ ok: false, provider: "none", error: "이 PC 에서만 쓸 수 있습니다" });
  const r = await run(["--version"], null, 20_000);
  if (r.code !== 0)
    return NextResponse.json({ ok: false, error: "Claude Code(claude) 를 찾지 못했습니다. 설치 후 터미널에서 claude 로 로그인하세요." });
  return NextResponse.json({ ok: true, provider: "claude", version: r.out.trim() });
}

export async function POST(request: Request) {
  const az = azureConfig();
  if (!az && !local(request)) return NextResponse.json({ ok: false, error: "이 PC 에서만 쓸 수 있습니다" }, { status: 403 });
  let brief: unknown;
  try {
    brief = (await request.json()).brief;
  } catch {
    return NextResponse.json({ ok: false, error: "요청 형식이 잘못되었습니다" }, { status: 400 });
  }
  const body = JSON.stringify(brief);
  if (!brief || body.length > 400_000) return NextResponse.json({ ok: false, error: "요약이 비었거나 너무 큽니다" }, { status: 400 });

  const hash = crypto
    .createHash("sha1")
    .update(az ? `azure:${az.deployment}` : "claude")
    .update(PLAN_PROMPT)
    .update(body)
    .digest("hex")
    .slice(0, 16);
  const cacheFile = path.join(CACHE_DIR, `${hash}.json`);
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  if (!fresh && fs.existsSync(cacheFile)) {
    return NextResponse.json({ ok: true, cached: true, ...JSON.parse(fs.readFileSync(cacheFile, "utf8")) });
  }

  const t0 = Date.now();
  if (az) {
    try {
      const mapping = await askAzure(az, body);
      const saved = { mapping, ms: Date.now() - t0, at: new Date().toISOString(), provider: "azure" };
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(saved));
      } catch {
        /* cache is optional */
      }
      return NextResponse.json({ ok: true, cached: false, ...saved });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      const hint = /timeout|abort/i.test(why) ? "AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도하세요." : "AI 분석에 실패했습니다 (회사 키).";
      return NextResponse.json({ ok: false, error: hint, detail: why.slice(0, 400) }, { status: 502 });
    }
  }
  const r = await run(
    [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(PLAN_SCHEMA),
      "--tools",
      "",
      "--strict-mcp-config",
      "--no-session-persistence",
    ],
    `${PLAN_PROMPT}\n\n<data>\n${body}\n</data>`,
    TIMEOUT_MS,
  );
  let res: { structured_output?: unknown; result?: string; is_error?: boolean; total_cost_usd?: number } = {};
  try {
    res = JSON.parse(r.out);
  } catch {
    /* not json: login prompt, missing CLI ... */
  }
  const mapping = res.structured_output;
  if (!mapping || res.is_error) {
    const why = (res.result || r.err || r.out || "").slice(0, 400);
    const hint = /login|auth|credential/i.test(why)
      ? "Claude Code 로그인이 필요합니다. 터미널에서 claude 를 실행해 로그인하세요."
      : r.code === null
        ? "AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도하세요."
        : "AI 분석에 실패했습니다.";
    return NextResponse.json({ ok: false, error: hint, detail: why }, { status: 502 });
  }
  const saved = { mapping, ms: Date.now() - t0, at: new Date().toISOString() };
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(saved));
  } catch {
    /* cache is optional */
  }
  return NextResponse.json({ ok: true, cached: false, ...saved });
}
