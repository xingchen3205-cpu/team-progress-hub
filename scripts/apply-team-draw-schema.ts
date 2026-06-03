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

async function getColumnNames(table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(${quoteIdentifier(table)})`);
  return new Set(rows.map((row) => row.name));
}

async function main() {
  const userColumns = await getColumnNames("User");
  if (!userColumns.has("phone")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${quoteIdentifier("User")} ADD COLUMN ${quoteIdentifier("phone")} TEXT`,
    );
    console.log("added User.phone");
  } else {
    console.log("User.phone already exists");
  }

  const sessionColumns = await getColumnNames("ReviewDisplaySession");
  if (!sessionColumns.has("teamDrawEnabled")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${quoteIdentifier("ReviewDisplaySession")} ADD COLUMN ${quoteIdentifier("teamDrawEnabled")} BOOLEAN NOT NULL DEFAULT false`,
    );
    console.log("added ReviewDisplaySession.teamDrawEnabled");
  } else {
    console.log("ReviewDisplaySession.teamDrawEnabled already exists");
  }

  if (!sessionColumns.has("teamDrawQueue")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${quoteIdentifier("ReviewDisplaySession")} ADD COLUMN ${quoteIdentifier("teamDrawQueue")} TEXT`,
    );
    console.log("added ReviewDisplaySession.teamDrawQueue");
  } else {
    console.log("ReviewDisplaySession.teamDrawQueue already exists");
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier("ReviewDisplayTeamDrawToken")} (
      ${quoteIdentifier("id")} TEXT NOT NULL PRIMARY KEY,
      ${quoteIdentifier("sessionId")} TEXT NOT NULL,
      ${quoteIdentifier("packageId")} TEXT NOT NULL,
      ${quoteIdentifier("tokenHash")} TEXT NOT NULL,
      ${quoteIdentifier("tokenExpiresAt")} DATETIME NOT NULL,
      ${quoteIdentifier("usedAt")} DATETIME,
      ${quoteIdentifier("createdAt")} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ${quoteIdentifier("updatedAt")} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ${quoteIdentifier("ReviewDisplayTeamDrawToken_sessionId_fkey")}
        FOREIGN KEY (${quoteIdentifier("sessionId")}) REFERENCES ${quoteIdentifier("ReviewDisplaySession")} (${quoteIdentifier("id")})
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT ${quoteIdentifier("ReviewDisplayTeamDrawToken_packageId_fkey")}
        FOREIGN KEY (${quoteIdentifier("packageId")}) REFERENCES ${quoteIdentifier("ExpertReviewPackage")} (${quoteIdentifier("id")})
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  console.log("ensured ReviewDisplayTeamDrawToken table");

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier("ReviewDisplayTeamDrawToken_tokenHash_key")}
      ON ${quoteIdentifier("ReviewDisplayTeamDrawToken")}(${quoteIdentifier("tokenHash")})`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier("ReviewDisplayTeamDrawToken_sessionId_packageId_key")}
      ON ${quoteIdentifier("ReviewDisplayTeamDrawToken")}(${quoteIdentifier("sessionId")}, ${quoteIdentifier("packageId")})`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS ${quoteIdentifier("ReviewDisplayTeamDrawToken_sessionId_usedAt_idx")}
      ON ${quoteIdentifier("ReviewDisplayTeamDrawToken")}(${quoteIdentifier("sessionId")}, ${quoteIdentifier("usedAt")})`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS ${quoteIdentifier("ReviewDisplayTeamDrawToken_packageId_idx")}
      ON ${quoteIdentifier("ReviewDisplayTeamDrawToken")}(${quoteIdentifier("packageId")})`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS ${quoteIdentifier("ReviewDisplayTeamDrawToken_tokenExpiresAt_idx")}
      ON ${quoteIdentifier("ReviewDisplayTeamDrawToken")}(${quoteIdentifier("tokenExpiresAt")})`,
  );
  console.log("ensured ReviewDisplayTeamDrawToken indexes");
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
