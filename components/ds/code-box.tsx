"use client";

import { Check, Copy, Eye } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Caixa de código com copiar (components.md). Segredo vem mascarado.
export function CodeBox({
  value,
  secret = false,
  wrap = false,
  label,
}: {
  value: string;
  secret?: boolean;
  wrap?: boolean;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-start gap-2">
      <code
        aria-label={label}
        className={cn(
          "min-w-0 flex-1 rounded-md border bg-muted p-3 font-mono text-xs",
          wrap ? "break-all" : "overflow-x-auto whitespace-nowrap",
        )}
      >
        {shown ? value : "•".repeat(Math.min(value.length, 24))}
      </code>
      {secret && !shown && (
        <Button variant="outline" size="sm" onClick={() => setShown(true)}>
          <Eye aria-hidden="true" />
          Mostrar
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copiado" : ""}
      </span>
    </div>
  );
}
