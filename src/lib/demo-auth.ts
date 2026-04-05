import type { RoleKey } from "@/data/demo-data";

export const DEMO_AUTH_STORAGE_KEY = "team-progress-hub-demo-auth";

export type DemoAuthState = {
  role: RoleKey;
  accountId: string;
};
