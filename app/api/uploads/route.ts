import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { boardRole } from "@/server/access";
import { getCurrentUser } from "@/server/auth/session";
import { detectImageType, dropFile, fileUrl, MAX_UPLOAD_BYTES, storageFileUrl, writeFileData } from "@/server/files";
import { saveUploadLive } from "@/server/live/settings";
import { isLive } from "@/server/mode";
import { logActivity } from "@/server/kanban/core";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";
import type { FileRow } from "@/server/store/types";

// POST /api/uploads: recebe uma imagem do computador da pessoa e já liga ela
// onde vai ser usada. Campos: kind (avatar | wallpaper | board_background),
// boardId (só no fundo de quadro) e file.

const KINDS = ["avatar", "wallpaper", "board_background"] as const;
type Kind = (typeof KINDS)[number];

/** Plano de fundo novo começa com a imagem visível, mas coberta o bastante para os números continuarem fáceis de ler. */
const DEFAULT_DIM = 70;

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Entre de novo para enviar a imagem.", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Não deu para ler o envio. Tente de novo.");
  }
  const kind = String(form.get("kind") ?? "") as Kind;
  if (!KINDS.includes(kind)) return fail("Tipo de imagem inválido.");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Escolha uma imagem.");
  if (file.size > MAX_UPLOAD_BYTES) return fail("A imagem passou de 5 MB. Escolha uma menor.");

  const boardId = kind === "board_background" ? String(form.get("boardId") ?? "") : null;
  if (isLive()) {
    // O fundo de quadro entra junto com os quadros, na próxima etapa.
    if (kind === "board_background") return fail("Quadro não encontrado.", 404);
    const live = detectImageType(new Uint8Array(await file.arrayBuffer()));
    if (!live) return fail("Use uma imagem JPG, PNG ou WebP.");
    const saved = await saveUploadLive(user.id, kind, new Uint8Array(await file.arrayBuffer()), live);
    if (!saved.ok) return fail(saved.error, 500);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, url: storageFileUrl(saved.path) });
  }
  if (kind === "board_background") {
    const board = readStore().boards.find((b) => b.id === boardId);
    const role = board ? boardRole({ user }, board) : null;
    if (!board || !role) return fail("Quadro não encontrado.", 404);
    if (role === "observer") return fail("Só quem edita o quadro muda o fundo.", 403);
    if (board.closedAt) return fail("Este quadro está fechado. Reabra para mudar o fundo.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageType(bytes);
  if (!mime) return fail("Use uma imagem JPG, PNG ou WebP.");

  const row: FileRow = { id: newId(), ownerId: user.id, kind, boardId, mime, size: bytes.length, createdAt: nowIso() };
  writeFileData(row, bytes);

  mutate((store) => {
    store.files.push(row);
    if (kind === "avatar") {
      const u = store.users.find((x) => x.id === user.id)!;
      dropFile(store, u.avatarFileId);
      u.avatarFileId = row.id;
    } else if (kind === "wallpaper") {
      const u = store.users.find((x) => x.id === user.id)!;
      const previous = u.appearance.wallpaper;
      dropFile(store, previous?.fileId);
      u.appearance.wallpaper = { fileId: row.id, dim: previous?.dim ?? DEFAULT_DIM, blur: previous?.blur ?? 0 };
    } else {
      const b = store.boards.find((x) => x.id === boardId)!;
      if (b.background.type === "image") dropFile(store, b.background.fileId);
      b.background = { type: "image", fileId: row.id };
      logActivity(store, { workspaceId: b.workspaceId, boardId: b.id, cardId: null, actorId: user.id, type: "board.updated", data: {} });
    }
  });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, url: fileUrl(row.id) });
}
