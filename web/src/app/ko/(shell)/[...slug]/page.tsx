import { labelForPath } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** Every sidebar entry the clone does not implement lands here. */
export default async function ComingSoonPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const pathname = "/ko/" + (slug ?? []).join("/");
  const label = labelForPath(pathname);

  return (
    <>
      <h1 className="page-title">
        {label ?? "준비 중"}
        <span className="page-title__help">?</span>
      </h1>
      <div className="notice">
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>준비 중</div>
        <p style={{ margin: "0 0 10px" }}>
          이 화면은 로컬 클론의 범위에 없습니다 (스펙 11절).
        </p>
        <p className="mono" style={{ margin: 0 }}>
          {pathname}
        </p>
      </div>
    </>
  );
}
