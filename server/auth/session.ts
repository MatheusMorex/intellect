// Sessão do modo simulado (AUTH_MODE=fake): cookie assinado com HMAC com o id
// do usuário e a validade. No /replica-backend isto vira o Better Auth, com a
// mesma interface: getCurrentUser() e requireUser().

import crypto from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { readStore } from "@/server/store/db";

const COOKIE = "itl_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  avatarColor: string;
  timezone: string;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("Falta o AUTH_SECRET no arquivo .env.local (no mínimo 32 caracteres). Veja o .env.example.");
  }
  return value;
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function verify(token: string | undefined): string | null {
  if (!token) return null;
  const [userId, expires, signature] = token.split(".");
  if (!userId || !expires || !signature) return null;
  const expected = Buffer.from(sign(`${userId}.${expires}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (Number(expires) < Date.now()) return null;
  return userId;
}

export function fakeAuthAllowed() {
  return process.env.AUTH_MODE !== "live" && process.env.NODE_ENV !== "production";
}

export async function startSession(userId: string) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const value = `${userId}.${expires}`;
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const userId = verify((await cookies()).get(COOKIE)?.value);
  if (!userId) return null;
  const user = readStore().users.find((u) => u.id === userId);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    avatarColor: user.avatarColor,
    timezone: user.timezone,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const given = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, given);
}

/** Só aceita caminhos internos ("/d/…"), nunca outro site. */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
