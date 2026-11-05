import { redirect } from "next/navigation";

// 내 프로젝트 / 공유 프로젝트 were removed; only 전체 프로젝트 (/ko/projects/team) remains.
export default function Page() {
  redirect("/ko/projects/team");
}
