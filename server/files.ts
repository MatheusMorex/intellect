// Imagens enviadas do computador da pessoa: foto de perfil, plano de fundo do
// app e fundo de quadro. No modo simulado o arquivo fica em .data/uploads; no
// Supabase, no Storage (bucket "uploads", ver supabase/migrations).
//
// O navegador já reduz e converte a imagem antes de enviar (lib/image-prepare.ts),
// mas o servidor não confia nisso: confere o tamanho e os primeiros bytes do
// arquivo, e só aceita JPG, PNG e WebP (SVG fica de fora: pode carregar script).

import fs from "node:fs";
import path from "node:path";

import { boardRole } from "@/server/access";
import type { SessionUser } from "@/server/auth/session";
import { readStore } from "@/server/store/db";
import type { FileRow, Store } from "@/server/store/types";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const DIR = path.join(process.cwd(), ".data", "uploads");
const EXT: Record<FileRow["mime"], string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function fileUrl(fileId: string) {
  return `/api/files/${fileId}`;
}

/** Modo real: a imagem fica no Storage, no caminho "avatars/<pessoa>/<arquivo>" (ver a migração). */
export function storageFileUrl(path: string) {
  return `/api/files/${path}`;
}

/** Tipo real da imagem pelos primeiros bytes (a extensão e o tipo enviados não contam). */
export function detectImageType(bytes: Uint8Array): FileRow["mime"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

function filePath(file: Pick<FileRow, "id" | "mime">) {
  return path.join(DIR, `${file.id}.${EXT[file.mime]}`);
}

export function writeFileData(file: Pick<FileRow, "id" | "mime">, bytes: Uint8Array) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(filePath(file), bytes);
}

export function readFileData(file: Pick<FileRow, "id" | "mime">): Buffer | null {
  try {
    return fs.readFileSync(filePath(file));
  } catch {
    return null;
  }
}

/** Apaga o registro e o arquivo de uma imagem que não é mais usada (dentro de um mutate). */
export function dropFile(store: Store, fileId: string | null | undefined) {
  if (!fileId) return;
  const file = store.files.find((f) => f.id === fileId);
  store.files = store.files.filter((f) => f.id !== fileId);
  if (file) {
    try {
      fs.unlinkSync(filePath(file));
    } catch {
      // já não existia
    }
  }
}

/** Quem pode ver cada imagem: a foto, quem divide um workspace com o dono; o plano de fundo, só o dono; o fundo do quadro, quem vê o quadro. */
export function canReadFile(user: SessionUser, file: FileRow): boolean {
  const store = readStore();
  if (file.ownerId === user.id && file.kind !== "board_background") return true;
  if (file.kind === "wallpaper") return false;
  if (file.kind === "avatar") {
    const mine = new Set(store.workspaceMembers.filter((m) => m.userId === user.id).map((m) => m.workspaceId));
    return store.workspaceMembers.some((m) => m.userId === file.ownerId && mine.has(m.workspaceId));
  }
  const board = store.boards.find((b) => b.id === file.boardId);
  return !!board && boardRole({ user }, board) != null;
}
