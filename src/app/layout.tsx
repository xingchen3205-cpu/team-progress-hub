import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "南京铁道职业技术学院大赛评审系统",
  description: "用于管理团队每日进度、任务安排、文档资料、评审协作与账号审批的平台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
