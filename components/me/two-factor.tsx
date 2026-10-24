"use client";

// Verificação em duas etapas no perfil (S13): ligar com o aplicativo
// autenticador do celular e desligar. Só no login de verdade (modo real).

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/ds/badges";
import { CodeBox } from "@/components/ds/code-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmTwoFactor, disableTwoFactor, startTwoFactor } from "@/server/actions/two-factor";

type Setup = { factorId: string; qrCode: string; secret: string };

function CodeInput({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      className="w-36 text-center tracking-[0.3em] tabular-nums"
      aria-invalid={invalid || undefined}
    />
  );
}

/** enabled: null no modo de teste (sem login de verdade). */
export function TwoFactorSection({ enabled }: { enabled: boolean | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const codeId = useId();
  const errorId = useId();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSetup(null);
      setCode("");
      toast.success(done);
      router.refresh();
    });

  function start() {
    startTransition(async () => {
      setError(null);
      const result = await startTwoFactor();
      if (!result.ok) setError(result.error);
      else setSetup(result.data);
    });
  }

  const errorText = error && (
    <p id={errorId} role="alert" className="text-sm text-danger">
      {error}
    </p>
  );

  return (
    <section aria-labelledby="seguranca" className="grid gap-3 rounded-lg border bg-card p-4">
      <h2 id="seguranca" className="flex flex-wrap items-center gap-2 text-base font-semibold">
        <KeyRound aria-hidden="true" className="size-4 text-muted-foreground" />
        Verificação em duas etapas
        {enabled && <StatusPill status="connected">Ligada</StatusPill>}
      </h2>

      {enabled === null ? (
        <p className="text-sm text-muted-foreground">Funciona com o login de verdade (Supabase). No modo de teste as contas entram sem senha, então ela fica de fora.</p>
      ) : enabled ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => disableTwoFactor(code), "Verificação em duas etapas desligada");
          }}
        >
          <p className="text-sm text-muted-foreground">Ao entrar, o app pede o código do aplicativo autenticador além da senha.</p>
          <div className="grid gap-1.5">
            <Label htmlFor={codeId}>Código do aplicativo, para desligar</Label>
            <div className="flex flex-wrap items-center gap-2">
              <CodeInput id={codeId} value={code} onChange={setCode} invalid={!!error} />
              <Button type="submit" variant="outline" loading={pending} disabled={code.length !== 6}>
                Desligar
              </Button>
            </div>
          </div>
          {errorText}
        </form>
      ) : setup ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => confirmTwoFactor(setup.factorId, code), "Verificação em duas etapas ligada");
          }}
        >
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            <li>Abra o aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator, Authy…).</li>
            <li>Escaneie o QR code ou digite a chave.</li>
            <li>Digite aqui o código de 6 dígitos que aparecer.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code em SVG (data:) gerado pelo Supabase */}
          <img src={setup.qrCode} alt="QR code para o aplicativo autenticador" width={176} height={176} className="size-44 justify-self-center rounded-md bg-white p-2" />
          <div className="grid gap-1.5">
            <p className="text-sm text-muted-foreground">Não dá para escanear? Digite esta chave:</p>
            <CodeBox value={setup.secret} wrap label="Chave para o aplicativo autenticador" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={codeId}>Código do aplicativo</Label>
            <div className="flex flex-wrap items-center gap-2">
              <CodeInput id={codeId} value={code} onChange={setCode} invalid={!!error} />
              <Button type="submit" loading={pending} disabled={code.length !== 6}>
                Confirmar e ligar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSetup(null);
                  setCode("");
                  setError(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
          {errorText}
        </form>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Além da senha, o app pede um código do aplicativo autenticador do celular. Protege também as contas de anúncio e a loja ligadas aqui.
          </p>
          <Button className="justify-self-start" variant="outline" loading={pending} onClick={start}>
            Ligar
          </Button>
          {errorText}
        </div>
      )}
    </section>
  );
}
