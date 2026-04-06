import { WorkspaceDashboard } from "@/components/workspace-dashboard";

type SearchParams = Promise<{
  tab?: string;
  doc?: string;
}>;

const validTabs = [
  "overview",
  "timeline",
  "board",
  "reports",
  "experts",
  "review",
  "documents",
  "team",
  "profile",
] as const;

type ValidTab = (typeof validTabs)[number];

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

  return <WorkspaceDashboard activeTab={activeTab} targetDocumentId={params.doc ?? null} />;
}
