import type { Metadata } from "next";
import Link from "next/link";

import { ProfileForm } from "@/components/me/profile-form";
import { TwoFactorSection } from "@/components/me/two-factor";
import { AvatarSettings } from "@/components/settings/avatar-settings";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { dateTime, relative } from "@/lib/format";
import { hasVerifiedFactor } from "@/server/auth/mfa";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/data/boards";
import { isLive } from "@/server/mode";

export const metadata: Metadata = { title: "Perfil e preferências" };

// S13 Perfil e preferências, com a sua atividade recente.
export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getProfile({ user });

  return (
    <PageBody>
      <PageHeader title="Perfil e preferências" help="perfil" description={profile.email} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-6">
          <AvatarSettings person={{ name: profile.name, avatarColor: profile.avatarColor, avatarUrl: profile.avatarUrl }} />
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
        </div>
        <div className="grid content-start gap-6">
          <TwoFactorSection enabled={isLive() ? await hasVerifiedFactor(user.id) : null} />
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
