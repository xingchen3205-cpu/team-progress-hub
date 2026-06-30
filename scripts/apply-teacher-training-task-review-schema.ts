import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ path: ".env.production.local", override: false });
config({ path: ".env.local", override: false });

const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  }),
});

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const tableColumns = {
  TeacherTrainingTask: [
    { name: "courseSessionId", type: "TEXT" },
    { name: "taskType", type: "TEXT NOT NULL DEFAULT 'cohort'" },
    { name: "releaseMode", type: "TEXT NOT NULL DEFAULT 'immediate'" },
    { name: "releaseAt", type: "TEXT" },
    { name: "enableAiReview", type: "BOOLEAN NOT NULL DEFAULT false" },
    { name: "scoringRubric", type: "TEXT" },
  ],
  TeacherTrainingSubmission: [
    { name: "aiScore", type: "INTEGER" },
    { name: "aiComment", type: "TEXT" },
    { name: "aiReviewedAt", type: "DATETIME" },
    { name: "finalScore", type: "INTEGER" },
    { name: "finalComment", type: "TEXT" },
    { name: "finalReviewedById", type: "TEXT" },
    { name: "finalReviewedAt", type: "DATETIME" },
  ],
} as const;

const indexes = [
  {
    name: "TeacherTrainingTask_courseSessionId_idx",
    table: "TeacherTrainingTask",
    columns: ["courseSessionId"],
  },
  {
    name: "TeacherTrainingTask_cohortId_taskType_releaseMode_idx",
    table: "TeacherTrainingTask",
    columns: ["cohortId", "taskType", "releaseMode"],
  },
  {
    name: "TeacherTrainingSubmission_finalReviewedById_finalReviewedAt_idx",
    table: "TeacherTrainingSubmission",
    columns: ["finalReviewedById", "finalReviewedAt"],
  },
] as const;

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

async function ensureColumns() {
  for (const [table, columns] of Object.entries(tableColumns)) {
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
  }
}

async function ensureIndexes() {
  for (const index of indexes) {
    if (!(await tableExists(index.table))) {
      continue;
    }

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(index.name)} ON ${quoteIdentifier(index.table)}(${index.columns
        .map(quoteIdentifier)
        .join(", ")})`,
    );
  }
}

async function main() {
  await ensureColumns();
  await ensureIndexes();
  console.log("teacher training task review schema ensured");
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
