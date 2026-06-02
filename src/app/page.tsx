import { Suspense } from "react";

import { LoginScreen } from "@/components/login-screen";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
