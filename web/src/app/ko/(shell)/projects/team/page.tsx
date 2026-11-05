import ProjectList, { type ProjectListParams } from "@/components/ProjectList";

export const dynamic = "force-dynamic";
export const metadata = { title: "전체 프로젝트" };

export default async function TeamProjectsPage({
  searchParams,
}: {
  searchParams: Promise<ProjectListParams>;
}) {
  const params = await searchParams;
  return <ProjectList params={params} />;
}
