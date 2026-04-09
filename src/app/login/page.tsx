import { LoginScreen } from "@/components/login-screen";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ resetToken?: string }>;
}) {
  const params = await searchParams;
  const resetToken = typeof params.resetToken === "string" ? params.resetToken : "";

  return <LoginScreen initialResetToken={resetToken} />;
}
