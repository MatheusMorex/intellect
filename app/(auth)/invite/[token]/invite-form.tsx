"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { Banner } from "@/components/ds/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvite, type InviteState } from "@/server/actions/people";

// Formulário do S02: com sessão, só confirma; sem sessão, cria a conta e entra.
export function InviteForm({ token, email, signedInAs }: { token: string; email: string | null; signedInAs: string | null }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(acceptInvite, {});
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error && (
        <Banner variant="error" title="Não deu para aceitar" live>
          {state.error}
        </Banner>
      )}
      <input type="hidden" name="token" value={token} />
      {signedInAs ? (
        <p className="text-sm text-muted-foreground">
          Você vai entrar como <span className="font-medium text-foreground">{signedInAs}</span>.
        </p>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="inv-name">Seu nome</Label>
            <Input id="inv-name" name="name" autoComplete="name" required defaultValue={state.name} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inv-email">E-mail</Label>
            <Input id="inv-email" name="email" type="email" autoComplete="email" required defaultValue={email ?? state.email ?? ""} readOnly={!!email} aria-describedby={email ? "inv-email-hint" : undefined} />
            {email && (
              <p id="inv-email-hint" className="text-xs text-muted-foreground">
                O convite foi feito para este e-mail.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inv-password">Crie uma senha</Label>
            <div className="relative">
              <Input id="inv-password" name="password" type={show ? "text" : "password"} autoComplete="new-password" required className="pr-10" aria-describedby="inv-password-hint" />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-0.5 right-0.5"
                aria-label={show ? "Esconder a senha" : "Mostrar a senha"}
                aria-pressed={show}
                onClick={() => setShow((v) => !v)}
              >
                {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
            <p id="inv-password-hint" className="text-xs text-muted-foreground">
              De 8 a 50 caracteres, com letra maiúscula, número e um caractere especial.
            </p>
          </div>
        </>
      )}
      <Button type="submit" size="lg" loading={pending}>
        {signedInAs ? "Aceitar convite" : "Criar conta e entrar"}
      </Button>
    </form>
  );
}
