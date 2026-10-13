import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DueBadge, MetricBadge } from "@/components/ds/badges";
import { PageBody } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { roas } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getCardPreview } from "@/server/data/boards";

export const metadata: Metadata = { title: "Card" };

// S06 Verso do card: nesta etapa, só o essencial e o painel de métrica (S25).
// O modal completo (descrição, checklists, comentários) chega na fase do kanban.
export default async function CardPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const user = await requireUser();
  const preview = await getCardPreview({ user }, cardId);
  if (!preview) notFound();
  const { card, board, listName, metric } = preview;

  return (
    <PageBody>
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/b/${board.id}`}>
            <ArrowLeft aria-hidden="true" />
            {board.name}
          </Link>
        </Button>
      </div>
      <article className="grid max-w-card-modal gap-4 rounded-lg border bg-card p-6">
        <header className="grid gap-1">
          <p className="text-xs text-muted-foreground">
            #{card.number} · na lista {listName}
          </p>
          <h1 className="text-lg">{card.name}</h1>
        </header>
        {card.dueAt && (
          <div className="flex items-center gap-2 text-sm">
            Entrega <DueBadge due={new Date(card.dueAt)} complete={card.dueComplete} now={new Date()} />
          </div>
        )}
        {metric ? (
          <section aria-labelledby="metricas" className="grid gap-2 rounded-md bg-muted p-4">
            <h2 id="metricas" className="text-sm font-semibold">
              Métricas da campanha
            </h2>
            <p className="text-sm">{metric.targetName}</p>
            <div className="flex flex-wrap items-center gap-3">
              <MetricBadge
                label="ROAS"
                value={roas(metric.value)}
                trend={metric.trend ?? undefined}
                period="nos últimos 7 dias"
              />
              <span className="text-xs text-muted-foreground">últimos 7 dias</span>
              <Button asChild size="sm" variant="outline">
                <Link href={`/d/${metric.dashboardId}/${metric.provider ?? "meta"}?periodo=7d`}>Abrir no relatório</Link>
              </Button>
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">Este card não está ligado a nenhuma campanha.</p>
        )}
        <p className="text-xs text-muted-foreground">
          O verso completo do card (descrição, etiquetas, checklists e comentários) chega na fase do kanban.
        </p>
      </article>
    </PageBody>
  );
}
