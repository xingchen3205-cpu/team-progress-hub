import { DingTalkEntry } from "@/components/dingtalk-entry";
import { getDingTalkPublicConfig } from "@/lib/dingtalk";

export const dynamic = "force-dynamic";

export default function DingTalkWorkbenchEntryPage() {
  return <DingTalkEntry config={getDingTalkPublicConfig()} />;
}
