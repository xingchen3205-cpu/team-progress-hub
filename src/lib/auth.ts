import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME } from "@/lib/demo-auth";

type AuthTokenPayload = {
  sub: string;
  role: "teacher" | "leader" | "member";
  email: string;
  name: string;
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
};

export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export const signAuthToken = (payload: AuthTokenPayload) =>
  jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });

export const verifyAuthToken = (token: string) =>
  jwt.verify(token, getJwtSecret()) as AuthTokenPayload;

export const getTokenFromRequest = (request: NextRequest) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return request.cookies.get(AUTH_COOKIE_NAME)?.value ?? null;
};

export const getTokenFromCookieStore = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
};

export const getSessionUser = async (request: NextRequest) => {
  const token = getTokenFromRequest(request);
  if (!token) {
    return null;
  }

  try {
    const payload = verifyAuthToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        responsibility: true,
        createdAt: true,
      },
    });

    return user;
  } catch {
    return null;
  }
};

export const setAuthCookie = (response: NextResponse, token: string) => {
  response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);
};

export const clearAuthCookie = (response: NextResponse) => {
  response.cookies.set(AUTH_COOKIE_NAME, "", { ...authCookieOptions, maxAge: 0 });
};
