// Aparência, foto e plano de fundo no modo real (AUTH_MODE=live). As imagens
// ficam no bucket privado "uploads" do Storage; o caminho vai no perfil.

import crypto from "node:crypto";

import { adminClient } from "@/server/db/admin";
import { getLiveProfile, updateLiveProfile, type LiveAppearance } from "@/server/live/identity";
import { createClient } from "@/utils/supabase/server";

export const UPLOADS_BUCKET = "uploads";
/** Arquivos anexados aos cards (cards/<id do card>/<arquivo>), qualquer tipo, até 25 MB. */
export const ATTACHMENTS_BUCKET = "attachments";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Plano de fundo novo começa com a imagem visível, mas coberta o bastante para os números continuarem fáceis de ler. */
export const DEFAULT_DIM = 70;

export async function updateAppearanceLive(
  userId: string,
  v: { theme?: "light" | "dark" | "system"; showTaglines?: boolean; homePage?: LiveAppearance["homePage"]; wallpaperDim?: number; wallpaperBlur?: number },
): Promise<string | null> {
  const profile = await getLiveProfile(userId);
  if (!profile) return "Não deu para salvar. Entre de novo.";
  const appearance: LiveAppearance = { ...profile.appearance };
  if (v.showTaglines !== undefined) appearance.showTaglines = v.showTaglines;
  if (v.homePage) appearance.homePage = v.homePage;
  if (appearance.wallpaper) {
    appearance.wallpaper = {
      ...appearance.wallpaper,
      dim: v.wallpaperDim ?? appearance.wallpaper.dim,
      blur: v.wallpaperBlur ?? appearance.wallpaper.blur,
    };
  }
  const patch: Record<string, unknown> = { appearance };
  if (v.theme) patch.theme = v.theme;
  const error = await updateLiveProfile(userId, patch);
  return error ? "Não deu para salvar. Tente de novo." : null;
}

async function removeObject(path: string | null | undefined) {
  if (path) await adminClient().storage.from(UPLOADS_BUCKET).remove([path]);
}

export async function removeWallpaperLive(userId: string) {
  const profile = await getLiveProfile(userId);
  if (!profile) return;
  await removeObject(profile.appearance.wallpaper?.path);
  await updateLiveProfile(userId, { appearance: { ...profile.appearance, wallpaper: null } });
}

export async function removeAvatarLive(userId: string) {
  const profile = await getLiveProfile(userId);
  if (!profile) return;
  await removeObject(profile.avatarPath);
  await updateLiveProfile(userId, { avatar_path: null });
}

/**
 * Guarda a foto ou o plano de fundo. O envio usa a sessão da própria pessoa:
 * as regras do Storage só deixam gravar na pasta dela.
 */
export async function saveUploadLive(userId: string, kind: "avatar" | "wallpaper", bytes: Uint8Array, mime: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const profile = await getLiveProfile(userId);
  if (!profile) return { ok: false, error: "Entre de novo para enviar a imagem." };
  const folder = kind === "avatar" ? "avatars" : "wallpapers";
  const path = `${folder}/${userId}/${crypto.randomUUID()}.${EXT[mime]}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(UPLOADS_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) {
    console.error("[upload]", error.message);
    return { ok: false, error: "Não deu para guardar a imagem. Tente de novo." };
  }
  if (kind === "avatar") {
    await removeObject(profile.avatarPath);
    await updateLiveProfile(userId, { avatar_path: path });
  } else {
    await removeObject(profile.appearance.wallpaper?.path);
    const previous = profile.appearance.wallpaper;
    await updateLiveProfile(userId, { appearance: { ...profile.appearance, wallpaper: { path, dim: previous?.dim ?? DEFAULT_DIM, blur: previous?.blur ?? 0 } } });
  }
  return { ok: true, path };
}
