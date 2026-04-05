import path from "node:path";

import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

export default defineConfig({
  experimental: {
    adapter: true,
  },
  schema: "prisma/schema.prisma",
  adapter: async () =>
    new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    }),
  migrations: {
    seed: "node --import tsx prisma/seed.ts",
  },
});
