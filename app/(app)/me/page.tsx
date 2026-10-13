import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ProfileForm } from "@/components/me/profile-form";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { dateTime, relative } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/data/boards";

export const metadata: Metadata = { title: "Perfil e preferências" };

// S13 Perfil e preferências, com a sua atividade recente.
export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getProfile({ user });

  return (
    <PageBody>
      <PageHeader title="Perfil e preferências" description={profile.email} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ProfileForm
          profile={{
            name: profile.name,
            username: profile.username,
            bio: profile.bio,
            timezone: profile.timezone,
            theme: profile.theme,
            preferences: profile.preferences,
          }}
        />
        <div className="grid content-start gap-6">
          <section aria-labelledby="seguranca" className="grid gap-2 rounded-lg border bg-card p-4">
            <h2 id="seguranca" className="flex items-center gap-2 text-base font-semibold">
              <KeyRound aria-hidden="true" className="size-4 text-muted-foreground" />
              Senha e verificação em duas etapas
            </h2>
            <p className="text-sm text-muted-foreground">Trocar a senha e ligar a verificação em duas etapas chegam com o login de verdade. Hoje o app roda com usuários de teste.</p>
          </section>
          <section aria-labelledby="atividade" className="grid gap-2 rounded-lg border bg-card p-4">
            <h2 id="atividade" className="text-base font-semibold">
              Sua atividade
            </h2>
            {profile.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
            ) : (
              <ol className="grid gap-2">
                {profile.activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <span>Você {a.text}</span>
                    {a.cardName && a.cardId && (
                      <>
                        {" · "}
                        <Link href={`/c/${a.cardId}`} className="font-medium text-primary hover:underline">
                          {a.cardName}
                        </Link>
                      </>
                    )}
                    <br />
                    <time dateTime={a.createdAt} title={dateTime(new Date(a.createdAt))} className="text-xs text-muted-foreground">
                      {relative(new Date(a.createdAt))}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </PageBody>
  );
}
