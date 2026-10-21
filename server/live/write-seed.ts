// Grava um conjunto inteiro de dados (o exemplo do modo simulado) num projeto do
// Supabase: contas, perfis, workspace, membros e todo o resto pela mesma gravação
// do modo real (a diferença entre "nada" e os dados). Usado pelo
// npm run seed:teste-real e pelos testes do modo real (tests/live), sempre no
// projeto de TESTE.

import crypto from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { emptyStore } from "@/server/store/seed";
import type { Store } from "@/server/store/types";

import { diffSnapshot, flushChanges, type TableChanges } from "./snapshot";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/**
 * Uma cópia do exemplo com ids, e-mails, usuários, endereço do workspace e loja
 * novos: os testes gravam a sua sem esbarrar no npm run seed:teste-real (nem
 * em outro teste rodando ao mesmo tempo).
 */
export function copyWithNewIds(store: Store, suffix: string): Store {
  const ids = new Map<string, string>();
  const data = JSON.parse(
    JSON.stringify(store).replace(UUID, (old) => {
      if (!ids.has(old)) ids.set(old, crypto.randomUUID());
      return ids.get(old)!;
    }),
  ) as Store;
  for (const u of data.users) {
    u.email = u.email.replace("@intellect.test", `-${suffix}@teste.intellect.local`);
    // O usuário só aceita letras minúsculas, números, ponto e sublinhado.
    u.username = u.username ? `${u.username}_${suffix}`.replace(/[^a-z0-9._]/g, "_") : null;
  }
  for (const w of data.workspaces) w.slug = `${w.slug}-${suffix}`;
  for (const s of data.stores) s.shopDomain = `loja-${suffix}.myshopify.com`;
  return data;
}

/**
 * Imagens enviadas (fundos de quadro, fotos) ficam de fora: os arquivos ainda
 * não estão no Storage. Devolve os dados como foram gravados.
 */
export function withoutFiles(store: Store): Store {
  const data = structuredClone({ ...store, files: [] });
  for (const b of data.boards) if (b.background.type === "image") b.background = { type: "color", value: "purple" };
  return data;
}

export async function writeSeed(admin: SupabaseClient, store: Store, password: string): Promise<{ data: Store; changes: TableChanges[] }> {
  const data = withoutFiles(store);

  for (const u of data.users) {
    const created = await admin.auth.admin.createUser({ id: u.id, email: u.email, password, email_confirm: true, user_metadata: { name: u.name } });
    if (created.error) throw new Error(`criar ${u.email}: ${created.error.message}`);
    const { error } = await admin
      .from("profiles")
      .update({
        name: u.name,
        username: u.username,
        bio: u.bio,
        timezone: u.timezone,
        theme: u.theme,
        avatar_color: u.avatarColor,
        preferences: u.preferences,
        appearance: { ...u.appearance, wallpaper: null },
      })
      .eq("id", u.id);
    if (error) throw new Error(`perfil de ${u.email}: ${error.message}`);
  }

  // Workspaces e quem participa: o retrato só lê essas duas tabelas.
  for (const w of data.workspaces) {
    const { error } = await admin.from("workspaces").insert({ id: w.id, name: w.name, slug: w.slug, description: w.description, allowed_email_domain: w.allowedEmailDomain });
    if (error) throw new Error(`workspace: ${error.message}`);
  }
  const { error: membersError } = await admin
    .from("workspace_members")
    .insert(data.workspaceMembers.map((m) => ({ id: m.id, workspace_id: m.workspaceId, user_id: m.userId, role: m.role })));
  if (membersError) throw new Error(`membros: ${membersError.message}`);

  const changes = diffSnapshot(emptyStore(), data);
  await flushChanges(changes);
  return { data, changes };
}
