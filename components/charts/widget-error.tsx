"use client";

import { OctagonAlert } from "lucide-react";
import { catchError, type ErrorInfo } from "next/error";

import { EmptyState } from "@/components/ds/empty-state";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/charts/messages";
import { OUTLINE_BOX } from "@/lib/surfaces";
import { cn } from "@/lib/utils";

// Erro num widget só: os outros continuam na tela. "Tentar de novo" busca e
// desenha de novo só este pedaço (retry do Next).

function WidgetErrorFallback({ title }: { title: string }, { retry }: ErrorInfo) {
  return (
    <div role="alert" className={cn("text-foreground", OUTLINE_BOX)}>
      <EmptyState
        icon={OctagonAlert}
        title={msg.panel.error.title}
        description={`${title}. ${msg.panel.error.description}`}
        action={
          <Button size="sm" variant="outline" onClick={() => retry()}>
            {msg.panel.error.retry}
          </Button>
        }
        className="py-6"
      />
    </div>
  );
}

export const WidgetErrorBoundary = catchError(WidgetErrorFallback);
