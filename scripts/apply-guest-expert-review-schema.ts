import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ path: ".env.production.local", override: false });
config({ path: ".env.local", override: false });

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  }),
});

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier("ExpertReviewGuestToken")} (
      ${quoteIdentifier("id")} TEXT NOT NULL PRIMARY KEY,
      ${quoteIdentifier("expertUserId")} TEXT NOT NULL,
      ${quoteIdentifier("projectReviewStageId")} TEXT NOT NULL,
      ${quoteIdentifier("tokenHash")} TEXT NOT NULL,
      ${quoteIdentifier("tokenExpiresAt")} DATETIME NOT NULL,
      ${quoteIdentifier("revokedAt")} DATETIME,
      ${quoteIdentifier("lastUsedAt")} DATETIME,
      ${quoteIdentifier("createdById")} TEXT NOT NULL,
      ${quoteIdentifier("createdAt")} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ${quoteIdentifier("updatedAt")} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ${quoteIdentifier("ExpertReviewGuestToken_expertUserId_fkey")}
        FOREIGN KEY (${quoteIdentifier("expertUserId")}) REFERENCES ${quoteIdentifier("User")} (${quoteIdentifier("id")})
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT ${quoteIdentifier("ExpertReviewGuestToken_projectReviewStageId_fkey")}
        FOREIGN KEY (${quoteIdentifier("projectReviewStageId")}) REFERENCES ${quoteIdentifier("ProjectReviewStage")} (${quoteIdentifier("id")})
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT ${quoteIdentifier("ExpertReviewGuestToken_createdById_fkey")}
        FOREIGN KEY (${quoteIdentifier("createdById")}) REFERENCES ${quoteIdentifier("User")} (${quoteIdentifier("id")})
        ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  console.log("ensured ExpertReviewGuestToken table");

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier("ExpertReviewGuestToken_tokenHash_key")}
      ON ${quoteIdentifier("ExpertReviewGuestToken")}(${quoteIdentifier("tokenHash")})`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier("ExpertReviewGuestToken_expertUserId_projectReviewStageId_key")}
      ON ${quoteIdentifier("ExpertReviewGuestToken")}(${quoteIdentifier("expertUserId")}, ${quoteIdentifier("projectReviewStageId")})`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS ${quoteIdentifier("ExpertReviewGuestToken_projectReviewStageId_revokedAt_idx")}
      ON ${quoteIdentifier("ExpertReviewGuestToken")}(${quoteIdentifier("projectReviewStageId")}, ${quoteIdentifier("revokedAt")})`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS ${quoteIdentifier("ExpertReviewGuestToken_expertUserId_tokenExpiresAt_idx")}
      ON ${quoteIdentifier("ExpertReviewGuestToken")}(${quoteIdentifier("expertUserId")}, ${quoteIdentifier("tokenExpiresAt")})`,
  );
  console.log("ensured ExpertReviewGuestToken indexes");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
