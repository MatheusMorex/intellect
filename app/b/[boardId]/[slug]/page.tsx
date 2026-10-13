import React, { useState, Suspense } from 'react';
import { BoardRepo } from '@/lib/db/board.repo';
import { MetricBadge } from '@/components/ds/MetricBadge';
import { CreateBoardModal } from '@/components/ds/CreateBoardModal';
import { Skeleton } from '@/components/ui/skeleton/Skeleton';

function PriorityBadge({ priority }: { priority: 'low' | 'medium' | 'high' }) {
  const colors = {
    low: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    high: 'bg-red-500/10 text-red-600 border-red-500/20',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${colors[priority] || colors.low}`}>
      {priority.toUpperCase()}
    </span>
  );
}

function SprintBadge({ sprint }: { sprint: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary text-muted-foreground border border-border">
      S{sprint}
    </span>
  );
}

async function getBoardData(boardId: string) {
  await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network
  try {
    return await BoardRepo.getBoard(boardId);
  } catch (e) {
    console.error("Erro ao buscar quadro:", e);
    return null;
  }
}

function BoardSkeleton() {
  return (
    <div className="h-full flex flex-col relative">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-48" />
          <div className="flex -space-x-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="w-8 h-8 rounded-full" />)}
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      </div>
      <div className="flex gap-6 h-full overflow-x-auto pb-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="w-80 flex-shrink-0 flex flex-col gap-3">
            <Skeleton className="h-4 w-32 mx-2" />
            <div className="space-y-3">
              {[1, 2, 3].map(j => (
                <Skeleton key={j} className="h-24 w-full rounded-lg" />
              ))}
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Page({ params }: { params: { boardId: string, slug: string } }) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <BoardContent params={params} />
    </Suspense>
  );
}

async function BoardContent({ params }: { params: { boardId: string, slug: string } }) {
  const board = await getBoardData(params.boardId);

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h1 className="text-2xl font-bold mb-2">Quadro não encontrado</h1>
        <p className="text-muted-foreground">O quadro solicitado não existe ou você não tem permissão.</p>
      </div>
    );
  }

  return (
    <BoardClientView board={board} />
  );
}

function BoardClientView({ board }: { board: any }) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <div className="h-full flex flex-col relative">
      {isCreateModalOpen && <CreateBoardModal onClose={() => setIsCreateModalOpen(false)} />}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight">{board.name}</h1>
          <div className="flex -space-x-2">
            {board.members?.slice(0, 3).map((m: any, i: number) => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-background bg-secondary" />
            ))}
            <button className="w-8 h-8 rounded-full border-2 border-background bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground hover:bg-accent transition-colors">
              +
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors">
            Filtrar
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Novo Card
          </button>
        </div>
      </div>

      <div className="flex gap-6 h-full overflow-x-auto pb-4">
        {board.lists.map((list: any) => (
          <div key={list.id} className="w-80 flex-shrink-0 flex flex-col gap-3">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">{list.name}</h2>
                <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground font-medium">
                  {list.cards.length}
                </span>
              </div>
              <button className="p-1 hover:bg-secondary rounded transition-colors">
                <span className="text-xs text-muted-foreground">⋯</span>
              </button>
            </div>

            <div className="space-y-3">
              {list.cards.map((card: any) => (
                <div key={card.id} className="bg-background border border-border p-3 rounded-lg shadow-sm hover:border-primary/50 transition-colors cursor-grab active:cursor-grabbing group relative">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <h3 className="text-sm font-medium group-hover:text-primary transition-colors">{card.name}</h3>
                      <div className="flex gap-1">
                        {card.priority && <PriorityBadge priority={card.priority} />}
                        {card.sprint && <SprintBadge sprint={card.sprint} />}
                        <span className="text-[10px] text-muted-foreground">#{card.number}</span>
                      </div>
                    </div>

                    {card.metricsLink && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <MetricBadge
                          label="ROAS"
                          value="4.81"
                          trend="12%"
                          trendUp={true}
                        />
                        <MetricBadge
                          label="Lucro"
                          value="R$ 12k"
                          trend="5%"
                          trendUp={true}
                        />
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
                    <div className="flex -space-x-1">
                      {card.members?.slice(0, 2).map((m: any, i: number) => (
                        <div key={i} className="w-5 h-5 rounded-full bg-secondary border border-background" />
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-3 h-3 rounded-full bg-blue-500" />
                      Configurações
                    </div>
                  </div>
                </div>
              ))}
              <button className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:bg-secondary/20 transition-colors">
                + Adicionar card
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
