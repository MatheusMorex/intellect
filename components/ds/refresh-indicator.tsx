"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { dateTime, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

// Indicador de atualização (components.md). stale = passou de 2 ciclos de sincronização.
export function RefreshIndicator({
  updatedAt,
  stale = false,
  onRefresh,
}: {
  updatedAt: Date;
  stale?: boolean;
  onRefresh?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    setBusy(true);
    setDone("");
    try {
      await onRefresh?.();
      setDone("Dados atualizados");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {stale && !busy && <AlertTriangle aria-hidden="true" className="size-3.5 text-warning" />}
      <span
        className={cn(stale && !busy ? "text-warning" : "text-muted-foreground")}
        title={dateTime(updatedAt)}
        suppressHydrationWarning
      >
        {busy ? "Atualizando…" : stale ? "Os dados podem estar atrasados" : `Atualizado ${relative(updatedAt)}`}
      </span>
      <Button variant="ghost" size="sm" onClick={refresh} disabled={busy}>
        <RefreshCw aria-hidden="true" className={cn(busy && "animate-spin")} />
        Atualizar
      </Button>
      <span className="sr-only" aria-live="polite">
        {done}
      </span>
    </div>
  );
}
