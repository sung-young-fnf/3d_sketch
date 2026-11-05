import Link from "next/link";

export const metadata = { title: "비밀번호 찾기 | Archisketch" };

export default function ResetPasswordPage() {
  return (
    <main className="auth">
      <div className="auth__box">
        <div className="auth__logo">
          <span className="auth__logo-mark">
            <span className="sidebar__brand-mark">AS</span>
            Archisketch
          </span>
        </div>
        <h1 className="auth__h1">비밀번호 찾기</h1>
        <div className="notice">
          준비 중 — 로컬 클론에는 비밀번호 재설정 기능이 없습니다.
          <br />
          <span className="faint">원본: POST api.archisketch.com (클론에서는 호출하지 않음)</span>
        </div>
        <div className="auth__links">
          <Link href="/ko/auth/sign-in">로그인으로 돌아가기</Link>
        </div>
        <p className="auth__copy">ⓒ 2026. Archisketch Inc. All rights reserved.</p>
      </div>
    </main>
  );
}
