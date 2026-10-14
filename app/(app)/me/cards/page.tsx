import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ChecklistBadge, DueBadge, MetricBadge } from "@/components/ds/badges";
import { EmptyState } from "@/components/ds/empty-state";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { boardBackgroundStyle, type BoardBackgroundView } from "@/lib/board-backgrounds";
import { roas } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getMyCards } from "@/server/data/boards";
import { nowIso } from "@/server/store/db";

export const metadata: Metadata = { title: "Meus cards" };

type MyCard = Awaited<ReturnType<typeof getMyCards>>[number];
const DAY = 86_400_000;

function dueGroup(card: MyCard, now: number) {
  if (!card.dueAt) return "Sem prazo";
  if (card.dueComplete) return "Concluídos";
  const t = new Date(card.dueAt).getTime();
  if (t < now) return "Atrasados";
  if (t < now + DAY) return "Nas próximas 24 horas";
  if (t < now + 7 * DAY) return "Nos próximos 7 dias";
  return "Mais para frente";
}
const DUE_ORDER = ["Atrasados", "Nas próximas 24 horas", "Nos próximos 7 dias", "Mais para frente", "Sem prazo", "Concluídos"];

// S30 Meus cards: tudo o que está com você, por quadro ou por prazo. Atalho Q.
export default async function MyCardsPage({ searchParams }: { searchParams: Promise<{ agrupar?: string }> }) {
  const { agrupar } = await searchParams;
  const byDue = agrupar === "prazo";
  const user = await requireUser();
  const cards = await getMyCards({ user });
  const now = Date.parse(nowIso());

  const groups = new Map<string, { title: string; swatch?: BoardBackgroundView; cards: MyCard[] }>();
  for (const c of [...cards].sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))) {
    const key = byDue ? dueGroup(c, now) : c.boardId;
    if (!groups.has(key)) groups.set(key, { title: byDue ? key : c.boardName, swatch: byDue ? undefined : c.boardBackground, cards: [] });
    groups.get(key)!.cards.push(c);
  }
  const ordered = byDue ? DUE_ORDER.filter((k) => groups.has(k)).map((k) => groups.get(k)!) : [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));

  const tab = (value: "quadro" | "prazo", label: string) => {
    const active = (value === "prazo") === byDue;
    return (
      <Link
        href={value === "prazo" ? "/me/cards?agrupar=prazo" : "/me/cards"}
        aria-current={active ? "page" : undefined}
        className={cn("rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-card font-semibold shadow-card" : "text-muted-foreground hover:text-foreground")}
      >
        {label}
      </Link>
    );
  };

  return (
    <PageBody>
      <PageHeader
        title="Meus cards"
        help="meus-cards"
        description={cards.length ? `${cards.length} ${cards.length === 1 ? "card está" : "cards estão"} com você.` : undefined}
        actions={
          cards.length > 0 && (
            <nav aria-label="Agrupar" className="flex gap-1 rounded-lg bg-muted p-1">
              {tab("quadro", "Por quadro")}
              {tab("prazo", "Por prazo")}
            </nav>
          )
        }
      />
      {cards.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState icon={ListChecks} title="Nenhum card com você" description="Quando alguém colocar você num card, ou você entrar em um, ele aparece aqui." />
        </div>
      ) : (
        ordered.map((g) => (
          <section key={g.title} aria-label={g.title} className="grid gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {g.swatch && <span aria-hidden="true" className="size-4 rounded-sm" style={boardBackgroundStyle(g.swatch)} />}
              {g.title}
              <span className="text-sm font-normal text-muted-foreground">({g.cards.length})</span>
            </h2>
            <ul className="divide-y rounded-lg border bg-card">
              {g.cards.map((c) => (
                <li key={c.id}>
                  <Link href={`/b/${c.boardId}?card=${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                    <span className="min-w-0 flex-1 basis-60">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {byDue ? `${c.boardName} · ` : ""}
                        {c.listName}
                      </span>
                    </span>
                    {c.checklist && <ChecklistBadge done={c.checklist.done} total={c.checklist.total} />}
                    {c.metric && <MetricBadge label="ROAS" value={roas(c.metric.value)} trend={c.metric.trend ?? undefined} period="nos últimos 7 dias" />}
                    {c.dueAt && <DueBadge due={new Date(c.dueAt)} complete={c.dueComplete} now={new Date(now)} />}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </PageBody>
  );
}
