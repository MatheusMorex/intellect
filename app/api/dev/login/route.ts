import { NextResponse } from "next/server";

import { fakeAuthAllowed, safeNext, startSession } from "@/server/auth/session";
import { readStore } from "@/server/store/db";

// Só no modo simulado e fora de produção: entra com um usuário de exemplo pela
// URL. Serve para as capturas de tela automáticas do build (replica/clone-screens).
export async function GET(request: Request) {
  if (!fakeAuthAllowed()) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? "ana@intellect.test";
  const user = readStore().users.find((u) => u.email === email);
  if (!user) return new NextResponse("Usuário de teste não encontrado.", { status: 404 });
  await startSession(user.id);
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next")), url));
}
