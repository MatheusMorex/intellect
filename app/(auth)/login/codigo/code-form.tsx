"use client";

import { useActionState } from "react";

import { Banner } from "@/components/ds/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifySecondFactor, type CodeState } from "@/server/actions/auth";

export function CodeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(verifySecondFactor, {});

  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error && (
        <Banner variant="error" title="Não deu para entrar" live>
          {state.error}
        </Banner>
      )}
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-1.5">
        <Label htmlFor="code">Código</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="text-center text-lg tracking-[0.4em] tabular-nums"
          aria-invalid={state.error ? true : undefined}
        />
      </div>
      <Button type="submit" size="lg" loading={pending}>
        Confirmar
      </Button>
    </form>
  );
}
