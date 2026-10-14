import type { Metadata } from "next";
import Link from "next/link";

import { ProfileForm } from "@/components/me/profile-form";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { AvatarSettings } from "@/components/settings/avatar-settings";
import { DashboardSettingsForm } from "@/components/settings/dashboard-settings";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { WorkspaceSettingsForm } from "@/components/workspace/settings-form";
import { cn } from "@/lib/utils";
import { requireDashboard } from "@/server/access";
import { requireUser } from "@/server/auth/session";
import { getProfile, getShellData, getWorkspaceMembers } from "@/server/data/boards";
import { listDashboardsFor } from "@/server/data/tracking";

export const metadata: Metadata = { title: "Configurações" };

const TABS = [
  { id: "aparencia", label: "Aparência" },
  { id: "perfil", label: "Perfil e preferências" },
  { id: "vendas", label: "Vendas e moeda" },
  { id: "workspace", label: "Workspace" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// Configurações: tudo o que dá para mudar no INtellect, em abas.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ aba?: string; dashboard?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.aba) ? (sp.aba as Tab) : "aparencia";
  const user = await requireUser();
  const ctx = { user };
  const [shell, profile] = await Promise.all([getShellData(ctx), getProfile(ctx)]);
  const dashboards = listDashboardsFor(ctx);
  const selected = dashboards.find((d) => d.id === sp.dashboard) ?? dashboards[0];

  return (
    <PageBody>
      <PageHeader title="Configurações" help="configuracoes" description="Aparência, perfil, moeda e as regras do workspace." />
      <nav aria-label="Seções das configurações" className="flex flex-wrap gap-x-6 gap-y-2 border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/settings?aba=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "border-b-2 px-1 pb-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.id ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "aparencia" && (
        <AppearanceSettings
          appearance={{ theme: profile.theme, showTaglines: profile.appearance.showTaglines, homePage: profile.appearance.homePage, wallpaper: profile.appearance.wallpaper }}
        />
      )}

      {tab === "perfil" && (
        <div className="grid gap-6">
          <AvatarSettings person={{ name: profile.name, avatarColor: profile.avatarColor, avatarUrl: profile.avatarUrl }} />
          <ProfileForm
            hideTheme
            profile={{ name: profile.name, username: profile.username, bio: profile.bio, timezone: profile.timezone, theme: profile.theme, preferences: profile.preferences }}
          />
        </div>
      )}

      {tab === "vendas" &&
        (selected ? (
          <DashboardTab dashboardId={selected.id} all={dashboards.map((d) => ({ id: d.id, name: d.name }))} user={user} />
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum dashboard de vendas neste workspace ainda.</p>
        ))}

      {tab === "workspace" &&
        (shell.workspace ? (
          <WorkspaceTab slug={shell.workspace.slug} user={user} />
        ) : (
          <p className="text-sm text-muted-foreground">Você ainda não está em nenhum workspace.</p>
        ))}
    </PageBody>
  );
}

async function DashboardTab({ dashboardId, all, user }: { dashboardId: string; all: { id: string; name: string }[]; user: Awaited<ReturnType<typeof requireUser>> }) {
  const { dashboard, role } = requireDashboard({ user }, dashboardId);
  return (
    <div className="grid gap-4">
      {all.length > 1 && (
        <nav aria-label="Dashboards" className="flex flex-wrap gap-2">
          {all.map((d) => (
            <Link
              key={d.id}
              href={`/settings?aba=vendas&dashboard=${d.id}`}
              aria-current={d.id === dashboard.id ? "page" : undefined}
              className={cn("rounded-md border px-3 py-1.5 text-sm", d.id === dashboard.id ? "border-primary font-semibold" : "text-muted-foreground hover:text-foreground")}
            >
              {d.name}
            </Link>
          ))}
        </nav>
      )}
      <DashboardSettingsForm
        key={dashboard.id}
        canEdit={role === "admin"}
        dashboard={{
          id: dashboard.id,
          name: dashboard.name,
          currency: dashboard.currency,
          timezone: dashboard.timezone,
          revenueBasis: dashboard.revenueBasis,
          includeInterest: dashboard.includeInterest,
          adPlatforms: dashboard.adPlatforms,
        }}
      />
    </div>
  );
}

async function WorkspaceTab({ slug, user }: { slug: string; user: Awaited<ReturnType<typeof requireUser>> }) {
  const data = await getWorkspaceMembers({ user }, slug);
  return <WorkspaceSettingsForm workspace={data.workspace} canEdit={data.isAdmin} />;
}
