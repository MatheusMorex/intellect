import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { BoardCanvas } from "@/components/board/board-canvas";
import { BoardHeader } from "@/components/board/board-header";
import { CardDialog } from "@/components/board/card-dialog";
import { Banner } from "@/components/ds/banner";
import { boardBackgroundStyle } from "@/lib/board-backgrounds";
import { requireUser } from "@/server/auth/session";
import {
  getBoardArchive,
  getBoardSharing,
  getBoardView,
  getCardDetail,
  getCardPreview,
  getShellData,
  listWritableLists,
  recordBoardVisit,
} from "@/server/data/boards";
import { listDashboards } from "@/server/data/tracking";
import { nowIso } from "@/server/store/db";

type Props = { params: Promise<{ boardId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { boardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const view = await getBoardView({ user }, boardId);
  const cardId = typeof sp.card === "string" ? sp.card : null;
  const card = cardId ? view.cards.find((c) => c.id === cardId) : null;
  return { title: card ? `${card.name} · ${view.board.name}` : view.board.name };
}

// S05 Quadro, com o verso do card (S06) aberto por ?card=<id>.
export default async function BoardPage({ params, searchParams }: Props) {
  const { boardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const ctx = { user };
  const [view, archive, sharing, shell] = await Promise.all([getBoardView(ctx, boardId), getBoardArchive(ctx, boardId), getBoardSharing(ctx, boardId), getShellData(ctx)]);
  after(() => recordBoardVisit(ctx, boardId));

  const cardId = typeof sp.card === "string" ? sp.card : null;
  let missingCard = false;
  let detail = null;
  if (cardId) {
    const preview = await getCardPreview(ctx, cardId);
    if (!preview) missingCard = true;
    else if (preview.boardId !== boardId) redirect(`/b/${preview.boardId}?card=${cardId}`);
    else detail = await getCardDetail(ctx, cardId);
  }
  // Destinos de "mover" e "copiar" do card aberto, e os dashboards para ligar o card a uma campanha.
  const [writableLists, dashboards] = detail ? await Promise.all([listWritableLists(ctx), listDashboards(ctx)]) : [[], []];
  const now = Date.parse(nowIso());

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col" style={boardBackgroundStyle(view.board.background)}>
      <BoardHeader view={view} archive={archive} sharing={sharing} singleKeyShortcuts={shell.preferences.singleKeyShortcuts} />
      {missingCard && (
        <Banner variant="warning" title="Este card não existe mais" className="mx-4 mt-3 w-fit">
          Ele pode ter sido excluído por alguém do quadro.
        </Banner>
      )}
      <BoardCanvas view={view} now={now} shortcuts={shell.preferences.singleKeyShortcuts} />
      {detail && (
        <CardDialog
          key={detail.card.id}
          detail={detail}
          labels={view.labels}
          members={view.members}
          lists={writableLists}
          dashboards={dashboards.map((d) => ({ id: d.id, name: d.name }))}
          buttons={view.buttons.card}
          now={now}
        />
      )}
    </div>
  );
}
