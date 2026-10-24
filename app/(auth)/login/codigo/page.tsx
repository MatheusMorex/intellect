import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { logout } from "@/server/actions/auth";
import { getCurrentUser, safeNext, secondFactorPending } from "@/server/auth/session";

import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "Código de verificação" };

// Segunda etapa do login (modo real, com a verificação em duas etapas ligada):
// depois da senha, o código de 6 dígitos do aplicativo autenticador.
export default async function SecondFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await getCurrentUser()) redirect(target);
  if (!(await secondFactorPending())) redirect(target === "/" ? "/login" : `/login?next=${encodeURIComponent(target)}`);

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="grid w-full max-w-sm gap-6">
        <div className="grid justify-items-center gap-2 text-center">
          <Logo height={40} />
          <h1 className="mt-4 text-xl">Verificação em duas etapas</h1>
          <p className="text-muted-foreground">Abra o aplicativo autenticador no celular e digite o código de 6 dígitos da INtellect.</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-card">
          <CodeForm next={target} />
        </div>
        <form action={logout} className="justify-self-center">
          <Button type="submit" variant="link">
            Entrar com outra conta
          </Button>
        </form>
      </div>
    </main>
  );
}
