"use server";

// Configurações (tela /settings): aparência de cada pessoa, foto e plano de
// fundo, e os ajustes do dashboard de vendas (só admin do workspace).

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DASHBOARD_CURRENCIES } from "@/lib/currency";
import { requireDashboard } from "@/server/access";
import { requireUser } from "@/server/auth/session";
import { removeAvatarLive, removeWallpaperLive, updateAppearanceLive } from "@/server/live/settings";
import { isLive } from "@/server/mode";
import { dropFile } from "@/server/files";
import { mutate } from "@/server/store/db";

import type { ActionResult } from "./cards";

const fail = (error: string): ActionResult<never> => ({ ok: false, error });
const ok = (): ActionResult => ({ ok: true, data: undefined });

const appearanceInput = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  showTaglines: z.boolean().optional(),
  homePage: z.enum(["inicio", "meus-cards", "resumo"]).optional(),
  /** Quanto a cor do tema cobre a imagem de fundo, de 0 (imagem pura) a 90%. */
  wallpaperDim: z.number().int().min(0).max(90).optional(),
  /** Desfoque da imagem de fundo, de 0 a 20 px. */
  wallpaperBlur: z.number().int().min(0).max(20).optional(),
});

export async function updateAppearance(input: z.input<typeof appearanceInput>): Promise<ActionResult> {
  const parsed = appearanceInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Valor inválido.");
  const v = parsed.data;
  const user = await requireUser();
  if (isLive()) {
    const error = await updateAppearanceLive(user.id, v);
    if (error) return fail(error);
    revalidatePath("/", "layout");
    return ok();
  }
  mutate((store) => {
    const u = store.users.find((x) => x.id === user.id)!;
    if (v.theme) u.theme = v.theme;
    if (v.showTaglines !== undefined) u.appearance.showTaglines = v.showTaglines;
    if (v.homePage) u.appearance.homePage = v.homePage;
    if (u.appearance.wallpaper) {
      if (v.wallpaperDim !== undefined) u.appearance.wallpaper.dim = v.wallpaperDim;
      if (v.wallpaperBlur !== undefined) u.appearance.wallpaper.blur = v.wallpaperBlur;
    }
  });
  revalidatePath("/", "layout");
  return ok();
}

export async function removeWallpaper(): Promise<ActionResult> {
  const user = await requireUser();
  if (isLive()) {
    await removeWallpaperLive(user.id);
    revalidatePath("/", "layout");
    return ok();
  }
  mutate((store) => {
    const u = store.users.find((x) => x.id === user.id)!;
    dropFile(store, u.appearance.wallpaper?.fileId);
    u.appearance.wallpaper = null;
  });
  revalidatePath("/", "layout");
  return ok();
}

export async function removeAvatar(): Promise<ActionResult> {
  const user = await requireUser();
  if (isLive()) {
    await removeAvatarLive(user.id);
    revalidatePath("/", "layout");
    return ok();
  }
  mutate((store) => {
    const u = store.users.find((x) => x.id === user.id)!;
    dropFile(store, u.avatarFileId);
    u.avatarFileId = null;
  });
  revalidatePath("/", "layout");
  return ok();
}

const dashboardInput = z.object({
  dashboardId: z.uuid(),
  name: z.string().trim().min(1, "Dê um nome ao dashboard.").max(100, "O nome pode ter até 100 caracteres."),
  currency: z.enum(DASHBOARD_CURRENCIES.map((c) => c.code) as [string, ...string[]], { error: "Escolha uma das moedas da lista." }),
  timezone: z.string().min(1),
  revenueBasis: z.enum(["net", "gross"]),
  includeInterest: z.boolean(),
  adPlatforms: z.array(z.enum(["meta", "google"])).max(2),
  weekStart: z.enum(["monday", "sunday"], { error: "Escolha o dia em que a semana começa." }),
});

export async function updateDashboardSettings(input: z.input<typeof dashboardInput>): Promise<ActionResult> {
  const parsed = dashboardInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const v = parsed.data;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: v.timezone });
  } catch {
    return fail("Fuso horário inválido.");
  }
  const user = await requireUser();
  requireDashboard({ user }, v.dashboardId, "admin");
  mutate((store) => {
    const d = store.dashboards.find((x) => x.id === v.dashboardId)!;
    d.name = v.name;
    d.currency = v.currency;
    d.timezone = v.timezone;
    d.revenueBasis = v.revenueBasis;
    d.includeInterest = v.includeInterest;
    d.adPlatforms = [...new Set(v.adPlatforms)];
    d.weekStart = v.weekStart;
  });
  revalidatePath("/", "layout");
  return ok();
}
