"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { endSession, fakeAuthAllowed, safeNext, startSession, verifyPassword } from "@/server/auth/session";
import { readStore } from "@/server/store/db";

export type LoginState = { error?: string; email?: string };

const loginInput = z.object({
  email: z.string().trim().toLowerCase().email("Digite um e-mail válido."),
  password: z.string().min(1, "Digite a senha."),
  next: z.string().optional(),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const user = readStore().users.find((u) => u.email.toLowerCase() === parsed.data.email);
  // A mesma mensagem para e-mail desconhecido e senha errada: não revela quem tem conta.
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return { error: "E-mail ou senha não conferem.", email };
  }
  await startSession(user.id);
  redirect(safeNext(parsed.data.next));
}

/** Só no modo simulado: entra com um usuário de exemplo, sem senha. */
export async function loginAsTestUser(formData: FormData) {
  if (!fakeAuthAllowed()) throw new Error("Entrada de teste desligada.");
  const userId = String(formData.get("userId") ?? "");
  const user = readStore().users.find((u) => u.id === userId);
  if (!user) redirect("/login");
  await startSession(user.id);
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logout() {
  await endSession();
  redirect("/login");
}
