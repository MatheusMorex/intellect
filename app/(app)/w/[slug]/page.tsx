import { BarChart3, CalendarClock, Clock, LayoutGrid, Plus, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BoardTile, ClosedBoardRow, CreateBoardTile } from "@/components/board/board-tiles";
import { CreateBoardDialog } from "@/components/board/create-board-dialog";
import { DueBadge } from "@/components/ds/badges";
import { EmptyState } from "@/components/ds/empty-state";
import { HelpTip } from "@/components/ds/help-tip";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import type { HelpTopic } from "@/lib/help";
import { OUTLINE_BOX } from "@/lib/surfaces";
import { HOME_TAGLINE } from "@/lib/taglines";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getShellData, getWorkspaceHome } from "@/server/data/boards";
import { nowIso } from "@/server/store/db";

export const metadata: Metadata = { title: "Início" };

const SECTION_HELP: Record<string, HelpTopic> = {
  prazos: "inicio-prazos",
  favoritos: "inicio-favoritos",
  recentes: "inicio-recentes",
  quadros: "inicio-quadros",
  dashboards: "inicio-dashboards",
};

function Section({ id, icon: Icon, title, children }: { id: string; icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <div className="flex items-center gap-1">
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          {title}
        </h2>
        {SECTION_HELP[id] && <HelpTip topic={SECTION_HELP[id]} className="size-5" />}
      </div>
      {children}
    </section>
  );
}

const grid = "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3";

// S03 Início do workspace: prazos, favoritos, recentes, quadros, dashboards e fechados.
export default async function WorkspaceHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const [home, shell] = await Promise.all([getWorkspaceHome({ user }, slug), getShellData({ user })]);
  const now = new Date(nowIso());

  return (
    <PageBody>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}`}
        help="inicio"
        description={`Workspace ${home.workspace.name}`}
        actions={
          <CreateBoardDialog
            workspaceId={home.workspace.id}
            workspaceName={home.workspace.name}
            trigger={
              <Button>
                <Plus aria-hidden="true" />
                Criar quadro
              </Button>
            }
          />
        }
      />

      {/* A frase da INtellect em destaque: só aqui no Início (dá para esconder em Configurações → Aparência). */}
      {shell.appearance.showTaglines && (
        <section
          aria-label="INtellect"
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-indigo via-brand-indigo to-[#140d45] px-6 py-8 shadow-card sm:px-10 sm:py-10"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático, sem otimização */}
          <img
            src="/marca/intellect-simbolo-branco.svg"
            alt=""
            aria-hidden="true"
            width={256}
            height={256}
            className="pointer-events-none absolute -right-8 -bottom-12 size-44 opacity-10 sm:size-64"
          />
          <p className="relative max-w-4xl text-2xl leading-tight font-extrabold tracking-tight text-balance text-white sm:text-3xl lg:text-4xl">
            {HOME_TAGLINE}
          </p>
        </section>
      )}

      {home.upcoming.length > 0 && (
        <Section id="prazos" icon={CalendarClock} title="Seus prazos nos próximos 7 dias">
          <ul className={cn("grid gap-1 p-2", OUTLINE_BOX)}>
            {home.upcoming.map((c) => (
              <li key={c.id}>
                <Link href={`/b/${c.boardId}?card=${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.boardName}</span>
                  <DueBadge due={new Date(c.dueAt)} now={now} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {home.starred.length > 0 && (
        <Section id="favoritos" icon={Star} title="Favoritos">
          <ul className={grid}>
            {home.starred.map((b) => (
              <BoardTile key={b.id} board={b} />
            ))}
          </ul>
        </Section>
      )}

      {home.recent.length > 0 && (
        <Section id="recentes" icon={Clock} title="Vistos recentemente">
          <ul className={grid}>
            {home.recent.map((b) => (
              <BoardTile key={b.id} board={b} />
            ))}
          </ul>
        </Section>
      )}

      <Section id="quadros" icon={LayoutGrid} title={`Quadros do ${home.workspace.name}`}>
        {home.boards.length === 0 ? (
          <div className={OUTLINE_BOX}>
            <EmptyState
              icon={LayoutGrid}
              title="Nenhum quadro ainda"
              description="Crie o primeiro quadro para organizar campanhas, criativos e tarefas da equipe."
              action={
                <CreateBoardDialog
                  workspaceId={home.workspace.id}
                  workspaceName={home.workspace.name}
                  trigger={
                    <Button>
                      <Plus aria-hidden="true" />
                      Criar quadro
                    </Button>
                  }
                />
              }
            />
          </div>
        ) : (
          <ul className={grid}>
            {home.boards.map((b) => (
              <BoardTile key={b.id} board={b} />
            ))}
            <CreateBoardTile workspaceId={home.workspace.id} workspaceName={home.workspace.name} />
          </ul>
        )}
      </Section>

      {home.dashboards.length > 0 && (
        <Section id="dashboards" icon={BarChart3} title="Dashboards de vendas">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {home.dashboards.map((d) => (
              <li key={d.id}>
                <Link href={`/d/${d.id}`} className={cn("flex items-center gap-3 p-4 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring", OUTLINE_BOX)}>
                  <BarChart3 aria-hidden="true" className="size-5 text-primary" />
                  <span className="grid">
                    <span className="font-semibold">{d.name}</span>
                    <span className="text-xs text-muted-foreground">{d.adPlatforms.map((p) => (p === "meta" ? "Meta" : "Google")).join(" e ")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {home.closed.length > 0 && (
        <details className={cn("group px-4 py-2", OUTLINE_BOX)}>
          <summary className="cursor-pointer py-1 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Quadros fechados ({home.closed.length})</summary>
          <ul className="divide-y">
            {home.closed.map((b) => (
              <ClosedBoardRow key={b.id} board={b} />
            ))}
          </ul>
        </details>
      )}
    </PageBody>
  );
}
