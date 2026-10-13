import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/initials";
import { loginAsTestUser } from "@/server/actions/auth";
import { fakeAuthAllowed, getCurrentUser, safeNext } from "@/server/auth/session";
import { readStore } from "@/server/store/db";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

// S01 Login. Sem cadastro público: quem entra foi convidado.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await getCurrentUser()) redirect(target);
  const testUsers = fakeAuthAllowed()
    ? readStore().users.map((u) => ({ id: u.id, name: u.name, email: u.email, avatarColor: u.avatarColor }))
    : [];

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="grid w-full max-w-sm gap-6">
        <div className="grid justify-items-center gap-2 text-center">
          <Logo height={32} />
          <h1 className="mt-4 text-xl">Entrar</h1>
          <p className="text-muted-foreground">Use o e-mail do convite que você recebeu.</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-card">
          <LoginForm next={target} />
        </div>

        {testUsers.length > 0 && (
          <section aria-labelledby="teste-titulo" className="rounded-lg border border-dashed border-input p-4">
            <h2 id="teste-titulo" className="text-sm font-semibold">
              Modo de teste
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Os dados são de exemplo. Entre com um usuário de teste, sem senha.
            </p>
            <div className="mt-3 grid gap-2">
              {testUsers.map((u) => (
                <form key={u.id} action={loginAsTestUser}>
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="next" value={target} />
                  <Button type="submit" variant="outline" className="h-auto w-full justify-start gap-3 py-2">
                    <Avatar className="size-7">
                      <AvatarFallback
                        className="text-[11px] font-semibold"
                        style={{ background: `var(--ds-label-${u.avatarColor}-bold)`, color: "var(--ds-label-text-bold)" }}
                      >
                        {initials(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="grid text-left">
                      <span>Entrar como {u.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">{u.email}</span>
                    </span>
                  </Button>
                </form>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
