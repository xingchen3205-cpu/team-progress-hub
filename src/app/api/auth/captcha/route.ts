import { NextResponse } from "next/server";

import {
  createCaptchaChallenge,
  generateCaptchaCode,
  renderCaptchaSvg,
  setCaptchaCookie,
} from "@/lib/captcha";

export async function GET() {
  const code = generateCaptchaCode();
  const challenge = createCaptchaChallenge(code);
  const response = new NextResponse(renderCaptchaSvg(code), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });

  setCaptchaCookie(response, challenge);

  return response;
}
