import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Archisketch Enterprise (local clone)",
  description: "fnf.archisketch.com 대시보드의 로컬 클론 - 로컬 카탈로그 데이터 전용",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
