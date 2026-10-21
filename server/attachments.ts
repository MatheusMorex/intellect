// Anexos dos cards (S06/S07, F04): arquivo do computador (até 25 MB) ou link.
//
// O arquivo fica no modo simulado em .data/attachments e no Supabase no bucket
// privado "attachments" (supabase/migrations/20261021120000_attachments_storage.sql).
// O caminho é sempre cards/<id do card>/<id novo>: o nome original fica só na
// tabela, então ninguém adivinha o endereço de um arquivo.
//
// Segurança: o arquivo pode ser qualquer coisa (até um HTML com script). Por isso
// o download só abre no navegador imagens conferidas pelos primeiros bytes; todo
// o resto sai como "application/octet-stream" para baixar, com nosniff e sandbox.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { boardRole } from "@/server/access";
import type { SessionUser } from "@/server/auth/session";
import { adminClient } from "@/server/db/admin";
import { detectImageType } from "@/server/files";
import { bumpCard, logActivity } from "@/server/kanban/core";
import { withLiveRead, withLiveWrite } from "@/server/live/scope";
import { ATTACHMENTS_BUCKET } from "@/server/live/settings";
import { rowFromDb, tableOf } from "@/server/live/tables";
import { isLive } from "@/server/mode";
import { mutate, newId, nowIso, readStore } from "@/server/store/db";
import type { AttachmentRow, CardRow, Store } from "@/server/store/types";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_CARD = 100;

const DIR = path.join(process.cwd(), ".data", "attachments");

/** Imagens que o navegador pode mostrar direto (conferidas pelos primeiros bytes). */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function attachmentUrl(id: string) {
  return `/api/attachments/${id}`;
}

export function isImageAttachment(row: Pick<AttachmentRow, "kind" | "mimeType">) {
  return row.kind === "file" && !!row.mimeType && IMAGE_TYPES.has(row.mimeType);
}

/** Tipo pelos primeiros bytes, só para imagens (JPG, PNG, WebP e GIF). */
function sniffImage(bytes: Uint8Array): string | null {
  const image = detectImageType(bytes);
  if (image) return image;
  const head = String.fromCharCode(...bytes.slice(0, 6));
  return head === "GIF87a" || head === "GIF89a" ? "image/gif" : null;
}

/**
 * O tipo guardado: o da imagem conferida; nos outros arquivos, o que o navegador
 * mandou (só para o ícone), nunca um tipo de imagem que os bytes não confirmam.
 */
export function storedType(bytes: Uint8Array, declared: string): string {
  const image = sniffImage(bytes);
  if (image) return image;
  const type = declared.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(type) || type.startsWith("image/")) return "application/octet-stream";
  return type;
}

/** Nome para mostrar: sem pasta, sem caracteres invisíveis, até 256 caracteres. */
export function cleanName(name: string, fallback = "arquivo") {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return (clean || fallback).slice(0, 256);
}

/** Link aceito: só http e https (nada de javascript: ou data:). Devolve o endereço normalizado. */
export function safeLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Cabeçalhos do download. Imagem conferida abre no navegador; o resto sempre baixa. */
export function downloadHeaders(row: Pick<AttachmentRow, "name" | "kind" | "mimeType">, size: number, download: boolean): Record<string, string> {
  const inline = !download && isImageAttachment(row);
  const ascii = row.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return {
    "Content-Type": inline ? row.mimeType! : "application/octet-stream",
    "Content-Length": String(size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    "Cache-Control": "private, max-age=3600",
  };
}

// ---- onde o arquivo fica ------------------------------------------------------------------------

/** Guardar e ler o arquivo: no disco (simulado) ou no Storage (real, com a sessão de quem pede). */
export type AttachmentStorage = {
  upload(key: string, bytes: Uint8Array, contentType: string): Promise<string | null>;
  download(key: string): Promise<Uint8Array | null>;
};

const diskStorage: AttachmentStorage = {
  async upload(key, bytes) {
    const file = path.join(DIR, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return null;
  },
  async download(key) {
    try {
      return new Uint8Array(fs.readFileSync(path.join(DIR, key)));
    } catch {
      return null;
    }
  },
};

/** O bucket com a sessão de uma pessoa: as regras do Storage decidem quem envia e quem baixa. */
export function bucketStorage(client: SupabaseClient): AttachmentStorage {
  const bucket = client.storage.from(ATTACHMENTS_BUCKET);
  return {
    async upload(key, bytes, contentType) {
      const { error } = await bucket.upload(key, bytes, { contentType, upsert: false });
      return error ? error.message : null;
    },
    async download(key) {
      const { data, error } = await bucket.download(key);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
  };
}

async function defaultStorage(): Promise<AttachmentStorage> {
  if (!isLive()) return diskStorage;
  const { createClient } = await import("@/utils/supabase/server");
  return bucketStorage((await createClient()) as unknown as SupabaseClient);
}

/** Apaga arquivos que saíram de uso. No real usa a chave secreta (a linha já foi removida). */
export async function removeStoredFiles(keys: string[]) {
  if (keys.length === 0) return;
  if (isLive()) {
    const { error } = await adminClient().storage.from(ATTACHMENTS_BUCKET).remove(keys);
    if (error) console.error("[anexos] apagar arquivos:", error.message);
    return;
  }
  for (const key of keys) {
    try {
      fs.unlinkSync(path.join(DIR, key));
    } catch {
      // já não existia
    }
  }
}

/** Copia arquivos (copiar card com os anexos). Devolve os destinos que não deram certo. */
export async function copyStoredFiles(jobs: { from: string; to: string }[]): Promise<string[]> {
  const failed: string[] = [];
  for (const job of jobs) {
    if (isLive()) {
      const { error } = await adminClient().storage.from(ATTACHMENTS_BUCKET).copy(job.from, job.to);
      if (error) {
        console.error("[anexos] copiar arquivo:", error.message);
        failed.push(job.to);
      }
      continue;
    }
    try {
      const to = path.join(DIR, job.to);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(DIR, job.from), to);
    } catch {
      failed.push(job.to);
    }
  }
  return failed;
}

/**
 * Tira anexos do armazenamento (dentro de um mutate). No simulado o arquivo sai
 * junto; no real, o Storage é limpo depois de gravar (server/live/scope.ts).
 */
export function dropAttachments(store: Store, which: (row: AttachmentRow) => boolean) {
  const gone = store.attachments.filter(which);
  if (gone.length === 0) return gone;
  const ids = new Set(gone.map((a) => a.id));
  store.attachments = store.attachments.filter((a) => !ids.has(a.id));
  for (const card of store.cards) if (card.cover?.attachmentId && ids.has(card.cover.attachmentId)) card.cover = null;
  if (!isLive()) void removeStoredFiles(gone.flatMap((a) => (a.storageKey ? [a.storageKey] : [])));
  return gone;
}

// ---- acesso -----------------------------------------------------------------------------------------

type Failure = { ok: false; error: string; status: number };
type Access = { ok: true; card: CardRow } | Failure;

const failure = (error: string, status = 400): Failure => ({ ok: false, error, status });

/** Quem vê o quadro do card vê os anexos; quem edita (com o quadro aberto) anexa, renomeia e apaga. */
export function cardAccess(user: SessionUser, cardId: string, write: boolean): Access {
  const store = readStore();
  const card = store.cards.find((c) => c.id === cardId);
  const board = card ? store.boards.find((b) => b.id === card.boardId) : undefined;
  const role = board ? boardRole({ user }, board) : null;
  if (!card || !board || !role) return failure("Card não encontrado.", 404);
  if (!write) return { ok: true, card };
  if (role === "observer") return failure("Só quem edita o quadro mexe nos anexos.", 403);
  if (board.closedAt) return failure("Este quadro está fechado. Reabra o quadro para mudar alguma coisa.");
  return { ok: true, card };
}

function addRow(user: SessionUser, row: AttachmentRow): { ok: true; id: string; boardId: string } | Failure {
  const access = cardAccess(user, row.cardId, true);
  if (!access.ok) return access;
  if (readStore().attachments.filter((a) => a.cardId === row.cardId).length >= MAX_ATTACHMENTS_PER_CARD) {
    return failure(`Este card já tem ${MAX_ATTACHMENTS_PER_CARD} anexos. Tire algum antes de anexar outro.`);
  }
  mutate((store) => {
    const card = store.cards.find((c) => c.id === row.cardId)!;
    const board = store.boards.find((b) => b.id === card.boardId)!;
    store.attachments.push(row);
    logActivity(store, { workspaceId: board.workspaceId, boardId: board.id, cardId: card.id, actorId: user.id, type: "card.attachment", data: { name: row.name, added: true } });
    bumpCard(store, card);
  });
  return { ok: true, id: row.id, boardId: access.card.boardId };
}

// ---- envio e download --------------------------------------------------------------------------------

/**
 * Anexa um arquivo. O arquivo vai primeiro para o Storage (com a sessão da pessoa)
 * e só depois a linha entra; se a linha não entrar, o arquivo é apagado.
 */
export async function addFileAttachment(
  user: SessionUser,
  cardId: string,
  file: { name: string; type: string; bytes: Uint8Array },
  storage?: AttachmentStorage,
): Promise<{ ok: true; id: string; boardId: string } | Failure> {
  if (file.bytes.length === 0) return failure("Escolha um arquivo.");
  if (file.bytes.length > MAX_ATTACHMENT_BYTES) return failure("O arquivo passou de 25 MB. Escolha um menor ou anexe um link.", 413);
  const access = await withLiveRead(user.id, () => cardAccess(user, cardId, true));
  if (!access.ok) return access;

  const key = `cards/${cardId}/${crypto.randomUUID()}`;
  const type = storedType(file.bytes, file.type);
  const uploadError = await (storage ?? (await defaultStorage())).upload(key, file.bytes, type);
  if (uploadError) {
    console.error("[anexos] enviar:", uploadError);
    return failure("Não deu para guardar o arquivo. Tente de novo.", 500);
  }
  const row: AttachmentRow = {
    id: newId(),
    cardId,
    uploaderId: user.id,
    kind: "file",
    name: cleanName(file.name),
    url: null,
    storageKey: key,
    bytes: file.bytes.length,
    mimeType: type,
    createdAt: nowIso(),
  };
  try {
    const result = await withLiveWrite(user.id, async () => addRow(user, row));
    if (!result.ok) await removeStoredFiles([key]);
    return result;
  } catch (error) {
    await removeStoredFiles([key]);
    throw error;
  }
}

/** Anexa um link (só http e https). Sem texto, o próprio endereço vira o nome. */
export function addLinkRow(user: SessionUser, cardId: string, url: string, name: string | null) {
  const link = safeLink(url);
  if (!link) return failure("Cole um link completo, começando com https://.");
  const row: AttachmentRow = {
    id: newId(),
    cardId,
    uploaderId: user.id,
    kind: "link",
    name: cleanName(name ?? "", link.replace(/^https?:\/\//, "").replace(/\/$/, "")),
    url: link,
    storageKey: null,
    bytes: null,
    mimeType: null,
    createdAt: nowIso(),
  };
  return addRow(user, row);
}

/** A linha de um anexo direto do banco, sem carregar o retrato (cada miniatura e capa pede uma). */
async function attachmentRowLive(attachmentId: string): Promise<AttachmentRow | null> {
  const spec = tableOf("attachments");
  const { data, error } = await adminClient().from(spec.table).select(spec.columns.join(", ")).eq("id", attachmentId).maybeSingle();
  if (error) console.error("[anexos] ler o anexo:", error.message);
  return data ? (rowFromDb(spec, data as unknown as Record<string, unknown>) as unknown as AttachmentRow) : null;
}

/**
 * O arquivo de um anexo, para quem vê o quadro do card. Link ou sem acesso: null.
 * No modo real quem decide é a regra do Storage: o download usa a sessão da própria
 * pessoa, e o Storage só entrega para quem vê o quadro do card.
 */
export async function readAttachment(
  user: SessionUser,
  attachmentId: string,
  storage?: AttachmentStorage,
): Promise<{ row: AttachmentRow; bytes: Uint8Array } | null> {
  let row: AttachmentRow | null;
  if (isLive()) {
    row = await attachmentRowLive(attachmentId);
    // O caminho tem que ser da pasta do próprio card (é ele que a regra do Storage confere).
    if (row && !row.storageKey?.startsWith(`cards/${row.cardId}/`)) row = null;
  } else {
    const found = readStore().attachments.find((a) => a.id === attachmentId);
    row = found && cardAccess(user, found.cardId, false).ok ? found : null;
  }
  if (!row || row.kind !== "file" || !row.storageKey) return null;
  const bytes = await (storage ?? (await defaultStorage())).download(row.storageKey);
  return bytes ? { row, bytes } : null;
}
