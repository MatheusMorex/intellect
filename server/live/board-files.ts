// Fundo de quadro com imagem no modo real (AUTH_MODE=live). A imagem vai para
// o bucket privado "uploads", em boards/<id do quadro>/<arquivo>, enviada com a
// sessão da própria pessoa: as regras do Storage só deixam gravar ali quem edita
// o quadro (e só deixam ver quem vê o quadro).

import crypto from "node:crypto";

import { boardRole } from "@/server/access";
import type { SessionUser } from "@/server/auth/session";
import { logActivity } from "@/server/kanban/core";
import { UPLOADS_BUCKET } from "@/server/live/settings";
import { mutate, readStore } from "@/server/store/db";
import { createClient } from "@/utils/supabase/server";

import { withLiveWrite } from "./scope";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Saved = { ok: true; path: string } | { ok: false; error: string; status: number };

export async function saveBoardBackgroundLive(user: SessionUser, boardId: string, bytes: Uint8Array, mime: string): Promise<Saved> {
  return withLiveWrite(user.id, async (): Promise<Saved> => {
    const board = readStore().boards.find((b) => b.id === boardId);
    const role = board ? boardRole({ user }, board) : null;
    if (!board || !role) return { ok: false, error: "Quadro não encontrado.", status: 404 };
    if (role === "observer") return { ok: false, error: "Só quem edita o quadro muda o fundo.", status: 403 };
    if (board.closedAt) return { ok: false, error: "Este quadro está fechado. Reabra para mudar o fundo.", status: 400 };
    const path = `boards/${board.id}/${crypto.randomUUID()}.${EXT[mime]}`;
    const { error } = await (await createClient()).storage.from(UPLOADS_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    if (error) {
      console.error("[upload] fundo do quadro:", error.message);
      return { ok: false, error: "Não deu para guardar a imagem. Tente de novo.", status: 500 };
    }
    mutate((store) => {
      const b = store.boards.find((x) => x.id === board.id)!;
      b.background = { type: "image", fileId: path };
      logActivity(store, { workspaceId: b.workspaceId, boardId: b.id, cardId: null, actorId: user.id, type: "board.updated", data: {} });
    });
    return { ok: true, path };
  });
}

