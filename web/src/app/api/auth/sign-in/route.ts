import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AUTH_COOKIE = "enterprise-token";

/**
 * Local dummy session. The original POSTs api.archisketch.com/login and stores
 * a JWT in `enterprise-token`; the clone never calls that host and accepts any
 * non-empty pair. This is a visual clone - there is no real authentication.
 */
export async function POST(request: Request) {
  let email = "";
  let password = "";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    email = body.email ?? "";
    password = body.password ?? "";
  } else {
    const form = await request.formData();
    email = String(form.get("email") ?? "");
    password = String(form.get("password") ?? "");
  }

  if (!email.trim() || !password.trim()) {
    return NextResponse.json({ ok: false, error: "이메일과 비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const response = NextResponse.json({
    ok: true,
    user: { email: email.trim(), name: "에프앤에프", role: 3, plan: "ENTERPRISE_PRO_PLAN" },
    token: "local-dummy-token",
  });
  const common = { httpOnly: false as const, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 7 };
  response.cookies.set(AUTH_COOKIE, "local-dummy-token", common);
  response.cookies.set("locale", "ko", common);
  response.cookies.set("last-origin", "local-clone", common);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE);
  return response;
}
