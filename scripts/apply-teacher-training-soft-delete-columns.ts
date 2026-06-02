import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ path: ".env.production.local", override: false });
config({ path: ".env.local", override: false });

const tables = [
  "TeacherTrainingCohort",
  "TeacherTrainingCourseSession",
  "TeacherTrainingCheckInTask",
  "TeacherTrainingTask",
] as const;

const columns = [
  { name: "deletedAt", type: "DATETIME" },
  { name: "deletedById", type: "TEXT" },
  { name: "deletedByName", type: "TEXT" },
] as const;

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  }),
});

async function tableExists(table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    table,
  );
  return rows.length > 0;
}

async function getColumnNames(table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(${quoteIdentifier(table)})`);
  return new Set(rows.map((row) => row.name));
}

async function main() {
  for (const table of tables) {
    if (!(await tableExists(table))) {
      console.log(`skip ${table}: table not found`);
      continue;
    }

    const existingColumns = await getColumnNames(table);
    for (const column of columns) {
      if (existingColumns.has(column.name)) {
        continue;
      }
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column.name)} ${column.type}`,
      );
      console.log(`added ${table}.${column.name}`);
    }

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${table}_deletedAt_idx`)} ON ${quoteIdentifier(table)}(${quoteIdentifier("deletedAt")})`,
    );
  }
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
