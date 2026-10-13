import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/server/auth/session";
import { getCardPreview } from "@/server/data/boards";

// Link curto de um card (/c/<id>): abre o quadro com o verso do card por cima.
export default async function CardPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const user = await requireUser();
  const preview = await getCardPreview({ user }, cardId);
  if (!preview) notFound();
  redirect(`/b/${preview.boardId}?card=${cardId}`);
}
