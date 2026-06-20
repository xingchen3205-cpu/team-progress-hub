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

const statements = [
  `CREATE TABLE IF NOT EXISTS "AiTrainingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "teamGroupId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "summaryJson" TEXT,
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("teamGroupId") REFERENCES "TeamGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "AiTrainingTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT,
    "turnNumber" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerPointsSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("sessionId") REFERENCES "AiTrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("questionId") REFERENCES "TrainingQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "AiTrainingAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "turnId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "answerText" TEXT NOT NULL,
    "answerHash" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "feedbackJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("turnId") REFERENCES "AiTrainingTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "TrainingQuestionRevisionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "teamGroupId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "originalAnswerPoints" TEXT NOT NULL,
    "proposedAnswerPoints" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewComment" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("questionId") REFERENCES "TrainingQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("attemptId") REFERENCES "AiTrainingAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("teamGroupId") REFERENCES "TeamGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "AiTrainingSession_createdById_startedAt_idx" ON "AiTrainingSession"("createdById", "startedAt")`,
  `CREATE INDEX IF NOT EXISTS "AiTrainingSession_teamGroupId_startedAt_idx" ON "AiTrainingSession"("teamGroupId", "startedAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AiTrainingTurn_sessionId_turnNumber_key" ON "AiTrainingTurn"("sessionId", "turnNumber")`,
  `CREATE INDEX IF NOT EXISTS "AiTrainingTurn_questionId_createdAt_idx" ON "AiTrainingTurn"("questionId", "createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AiTrainingAttempt_turnId_attemptNumber_key" ON "AiTrainingAttempt"("turnId", "attemptNumber")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AiTrainingAttempt_turnId_answerHash_key" ON "AiTrainingAttempt"("turnId", "answerHash")`,
  `CREATE INDEX IF NOT EXISTS "AiTrainingAttempt_createdAt_idx" ON "AiTrainingAttempt"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "TrainingQuestionRevisionRequest_questionId_status_createdAt_idx" ON "TrainingQuestionRevisionRequest"("questionId", "status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "TrainingQuestionRevisionRequest_submittedById_status_createdAt_idx" ON "TrainingQuestionRevisionRequest"("submittedById", "status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "TrainingQuestionRevisionRequest_teamGroupId_status_createdAt_idx" ON "TrainingQuestionRevisionRequest"("teamGroupId", "status", "createdAt")`,
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log("AI defense training schema ensured");
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
