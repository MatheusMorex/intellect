"use server";

// Verificação em duas etapas (2FA) no perfil, modo real: ligar com o
// aplicativo autenticador (QR code ou chave, depois o primeiro código) e
// desligar (pede um código, para quem só pegou o computador aberto não conseguir).

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { forgetFactor } from "@/server/auth/mfa";
import { requireUser } from "@/server/auth/session";
import { isLive } from "@/server/mode";
import { createClient } from "@/utils/supabase/server";

import type { ActionResult } from "./cards";

const fail = (error: string): ActionResult<never> => ({ ok: false, error });
const code = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Digite os 6 números que aparecem no aplicativo."));
const WRONG = "Código errado ou vencido. Espere o próximo código do aplicativo e tente de novo.";
const ONLY_LIVE = "A verificação em duas etapas funciona com o login de verdade.";

/** Começa a ligar: cria o fator e devolve o QR code e a chave. Só passa a valer depois do primeiro código (confirmTwoFactor). */
export async function startTwoFactor(): Promise<ActionResult<{ factorId: string; qrCode: string; secret: string }>> {
  await requireUser();
  if (!isLive()) return fail(ONLY_LIVE);
  const supabase = await createClient();
  const listed = await supabase.auth.mfa.listFactors();
  if (listed.error) return fail("Não consegui falar com o login. Tente de novo.");
  if (listed.data.totp.length > 0) return fail("A verificação em duas etapas já está ligada.");
  // Tentativas anteriores que não chegaram ao código.
  for (const factor of listed.data.all.filter((f) => f.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: factor.id });
  const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Aplicativo autenticador", issuer: "INtellect" });
  if (enrolled.error) return fail("Não consegui começar. Tente de novo.");
  return { ok: true, data: { factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret } };
}

/** O primeiro código do aplicativo: confere e liga. */
export async function confirmTwoFactor(factorId: string, typed: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isLive()) return fail(ONLY_LIVE);
  const id = z.uuid().safeParse(factorId);
  if (!id.success) return fail("Comece de novo pelo botão Ligar.");
  const parsed = code.safeParse(typed);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? WRONG);
  const supabase = await createClient();
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: id.data, code: parsed.data });
  if (verified.error) return fail(WRONG);
  forgetFactor(user.id);
  revalidatePath("/me");
  return { ok: true, data: undefined };
}

/** Desliga: confere um código do aplicativo e tira o fator. */
export async function disableTwoFactor(typed: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isLive()) return fail(ONLY_LIVE);
  const parsed = code.safeParse(typed);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? WRONG);
  const supabase = await createClient();
  const listed = await supabase.auth.mfa.listFactors();
  if (listed.error) return fail("Não consegui falar com o login. Tente de novo.");
  const factor = listed.data.totp[0];
  if (!factor) {
    forgetFactor(user.id);
    revalidatePath("/me");
    return fail("A verificação em duas etapas já está desligada.");
  }
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data });
  if (verified.error) return fail(WRONG);
  const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (removed.error) return fail("Não consegui desligar. Tente de novo.");
  forgetFactor(user.id);
  revalidatePath("/me");
  return { ok: true, data: undefined };
}
