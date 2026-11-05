"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/** Element inventory transcribed from spec section 2. Local dummy session only. */
export default function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectUrl = params.get("redirect_url") || "/ko/home-page";

  const [email, setEmail] = useState("fnf@archisketch.com");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "로그인에 실패했습니다.");
        setBusy(false);
        return;
      }
      router.replace(redirectUrl.startsWith("/") ? redirectUrl : "/ko/home-page");
      router.refresh();
    } catch {
      setError("로그인에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth__box">
        <div className="auth__logo">
          <span className="auth__logo-mark">
            <span className="sidebar__brand-mark">AS</span>
            Archisketch
          </span>
          <span className="header__lang">
            <span className="is-on">KO</span>
            <span>EN</span>
          </span>
        </div>

        <h1 className="auth__h1">로그인</h1>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="auth__field">
            <label className="auth__label" htmlFor="email">
              <i>*</i> 이메일
            </label>
            <div className="auth__inputwrap">
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                autoComplete="username"
                placeholder="이메일을 입력해 주세요"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>

          <div className="auth__field">
            <label className="auth__label" htmlFor="password">
              <i>*</i> 비밀번호
            </label>
            <div className="auth__inputwrap">
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                className="input"
                autoComplete="current-password"
                placeholder="비밀번호를 입력해 주세요"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="button" className="auth__show" onClick={() => setShow((value) => !value)}>
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="auth__row">
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              아이디 기억하기
            </label>
          </div>

          {error && <p className="auth__error">{error}</p>}

          <button type="submit" className="btn btn--primary auth__submit" disabled={busy}>
            {busy ? "로그인 중…" : "로그인"}
          </button>
        </form>

        <div className="auth__links">
          <Link href="/ko/auth/sign-up">회원가입</Link>
          <span className="faint">|</span>
          <Link href="/ko/auth/reset-password">비밀번호 찾기</Link>
        </div>

        <div className="auth__divider">SNS로 시작하기</div>
        <div className="auth__sns">
          <button type="button" title="Google (클론에서는 동작하지 않음)">G</button>
          <button type="button" className="is-naver" title="Naver (클론에서는 동작하지 않음)">
            N
          </button>
          <button type="button" className="is-kakao" title="Kakao (클론에서는 동작하지 않음)">
            K
          </button>
        </div>

        <p className="auth__copy">ⓒ 2026. Archisketch Inc. All rights reserved.</p>
        <p className="auth__copy">
          로컬 클론입니다. 아무 이메일/비밀번호나 입력하면 더미 세션 쿠키가 발급됩니다.
        </p>
      </div>
    </main>
  );
}
