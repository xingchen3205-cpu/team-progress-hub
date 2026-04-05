import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "中国国际大学生创新大赛备赛管理系统",
  description: "用于管理团队每日进度、任务安排、文档资料与备赛协作内容的平台原型。",
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
