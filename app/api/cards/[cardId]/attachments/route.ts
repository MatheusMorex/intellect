import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { addFileAttachment, MAX_ATTACHMENT_BYTES } from "@/server/attachments";
import { getCurrentUser } from "@/server/auth/session";

// POST /api/cards/<id>/attachments: recebe um arquivo do computador da pessoa
// (campo "file", até 25 MB) e anexa ao card. As regras ficam em server/attachments.ts.

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail("Entre de novo para anexar o arquivo.", 401);
  const { cardId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) return fail("Card não encontrado.", 404);

  // Recusa cedo, pelo tamanho anunciado, antes de ler 25 MB à toa.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES + 64 * 1024) return fail("O arquivo passou de 25 MB. Escolha um menor ou anexe um link.", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Não deu para ler o envio. Tente de novo.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Escolha um arquivo.");

  const result = await addFileAttachment(user, cardId, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  if (!result.ok) return fail(result.error, result.status);
  revalidatePath(`/b/${result.boardId}`);
  return NextResponse.json({ ok: true, id: result.id });
}
