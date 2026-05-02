import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { config as loadEnv } from "dotenv";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const outputDir = path.join(rootDir, "docs/manual/assets");
const baseUrl = process.env.MANUAL_BASE_URL ?? "http://127.0.0.1:3000";

loadEnv({ path: path.join(rootDir, ".env.production.local") });
loadEnv({ path: path.join(rootDir, ".env.local") });
loadEnv({ path: path.join(rootDir, ".env") });

const prisma = new PrismaClient({
  adapter: new PrismaLibSQL({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  }),
});

const roleQueries = {
  admin: { role: "admin" },
  teacher: { role: "teacher" },
  student: { OR: [{ role: "leader" }, { role: "member" }] },
};

const roleUsers = {};
for (const [key, where] of Object.entries(roleQueries)) {
  const user = await prisma.user.findFirst({
    where: { ...where, approvalStatus: "approved" },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, email: true, username: true, name: true },
  });
  if (!user) {
    throw new Error(`No approved user found for ${key}`);
  }
  roleUsers[key] = user;
}

const allUsers = await prisma.user.findMany({
  select: { name: true, username: true, email: true, avatar: true, role: true },
  orderBy: { createdAt: "asc" },
});
const allGroups = await prisma.teamGroup.findMany({
  select: { name: true },
  orderBy: { createdAt: "asc" },
});
await prisma.$disconnect();

const roleLabelByKey = {
  admin: "管理员",
  school_admin: "管理员",
  teacher: "教师",
  leader: "学生",
  member: "学生",
  expert: "专家",
};
const roleCounters = {};
const replacements = [];
const addReplacement = (value, replacement, minLength = 2) => {
  const text = value?.trim();
  if (!text || text.length < minLength) {
    return;
  }
  replacements.push([text, replacement]);
};

for (const user of allUsers) {
  const label = roleLabelByKey[user.role] ?? "用户";
  roleCounters[label] = (roleCounters[label] ?? 0) + 1;
  const display = `${label}${String.fromCharCode(64 + Math.min(roleCounters[label], 26))}`;
  addReplacement(user.name, display);
  addReplacement(user.username, `${label}账号`, 4);
  addReplacement(user.email, `${label}邮箱`);
  if (/^[\u4e00-\u9fff]$/.test(user.avatar?.trim() ?? "")) {
    addReplacement(user.avatar, label.slice(0, 1), 1);
  }
}
allGroups.forEach((group, index) => addReplacement(group.name, `演示项目组${String.fromCharCode(65 + index)}`));
replacements.sort((left, right) => right[0].length - left[0].length);

const signUserToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email ?? user.username,
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

const waitForApp = async (page) => {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1300);
};

const waitForWorkspace = async (page, name) => {
  await waitForApp(page);
  await page
    .waitForFunction(
      () => !document.body.innerText.includes("正在进入管理中心"),
      undefined,
      { timeout: 60_000 },
    )
    .catch(() => {});
  await waitForApp(page);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (bodyText.includes("用户登录") || bodyText.includes("正在进入管理中心")) {
    console.warn(`Screenshot ${name} may not be a workspace page: ${page.url()}`);
  }
};

const dismissOverlays = async (page) => {
  const closeButtons = page.locator('button:has-text("关闭")');
  const count = await closeButtons.count().catch(() => 0);
  if (count > 0) {
    await closeButtons.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
};

const anonymizePage = async (page) => {
  await page.evaluate((pairs) => {
    const replaceText = (input) => {
      let next = input;
      for (const [source, target] of pairs) {
        next = next.split(source).join(target);
      }
      return next;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    for (const node of nodes) {
      const next = replaceText(node.nodeValue || "");
      if (next !== node.nodeValue) {
        node.nodeValue = next;
      }
    }
    for (const element of document.querySelectorAll("input, textarea")) {
      const input = element;
      if ("value" in input && typeof input.value === "string") {
        input.value = replaceText(input.value);
      }
      if ("placeholder" in input && typeof input.placeholder === "string") {
        input.placeholder = replaceText(input.placeholder);
      }
    }
  }, replacements);
  await page.waitForTimeout(250);
};

const safeCapture = async (page, name) => {
  const filePath = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
};

const browser = await chromium.launch({ headless: true });

const publicContext = await browser.newContext({
  viewport: { width: 1440, height: 920 },
  deviceScaleFactor: 1,
  locale: "zh-CN",
});
const publicPage = await publicContext.newPage();
await publicPage.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
await waitForApp(publicPage);
await safeCapture(publicPage, "00-login");

for (const label of ["账号注册", "注册账号", "立即注册", "申请账号"]) {
  const target = publicPage.getByText(label, { exact: false }).first();
  if (await target.count()) {
    await target.click().catch(() => {});
    await publicPage.waitForTimeout(800);
    break;
  }
}
await safeCapture(publicPage, "01-register");
await publicContext.close();

const scenarios = [
  ["student", "02-student-overview", "/workspace"],
  ["student", "03-student-reports", "/workspace?tab=reports"],
  ["student", "04-student-board", "/workspace?tab=board"],
  ["student", "05-student-project", "/workspace?tab=project"],
  ["student", "06-student-experts", "/workspace?tab=experts"],
  ["teacher", "07-teacher-overview", "/workspace"],
  ["teacher", "08-teacher-reports", "/workspace?tab=reports"],
  ["teacher", "09-teacher-project", "/workspace?tab=project"],
  ["teacher", "10-teacher-documents", "/workspace?tab=documents"],
  ["admin", "11-admin-overview", "/workspace"],
  ["admin", "12-admin-team", "/workspace?tab=team"],
  ["admin", "13-admin-project", "/workspace?tab=project"],
  ["admin", "14-admin-review", "/workspace?tab=review"],
  ["admin", "15-admin-reports", "/workspace?tab=reports"],
  ["admin", "16-admin-board", "/workspace?tab=board"],
];

for (const [role, name, route] of scenarios) {
  const user = roleUsers[role];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
  });
  await context.addCookies([
    {
      name: "team-progress-hub-token",
      value: signUserToken(user),
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await waitForWorkspace(page, name);
  await dismissOverlays(page);
  await anonymizePage(page);
  await safeCapture(page, name);
  await context.close();
}

await browser.close();
console.log(`Screenshots written to ${outputDir}`);
