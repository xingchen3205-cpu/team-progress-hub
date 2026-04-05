import type { RoleKey } from "@/data/demo-data";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";

type SearchParams = Promise<{
  tab?: string;
  role?: string;
}>;

const validTabs = [
  "overview",
  "timeline",
  "board",
  "reports",
  "experts",
  "documents",
  "team",
] as const;

type ValidTab = (typeof validTabs)[number];
const validRoles: RoleKey[] = ["teacher", "leader", "member"];

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const activeTab =
    params.tab && validTabs.includes(params.tab as ValidTab)
      ? (params.tab as ValidTab)
      : "overview";
  const role =
    params.role && validRoles.includes(params.role as RoleKey)
      ? (params.role as RoleKey)
      : "leader";

  return <WorkspaceDashboard activeTab={activeTab} role={role} />;
}
