import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/server/auth/session";
import { getShellData } from "@/server/data/boards";

// Todas as telas logadas: exige sessão e monta barra superior e menu lateral.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const shell = await getShellData({ user });
  return (
    <AppShell
      user={{ name: user.name, email: user.email, avatarColor: user.avatarColor, avatarUrl: shell.avatarUrl }}
      workspace={shell.workspace}
      boards={shell.boards.map((b) => ({ id: b.id, name: b.name }))}
      dashboards={shell.dashboards}
      unreadNotifications={shell.unreadNotifications}
      preferences={shell.preferences}
      appearance={{ wallpaper: shell.appearance.wallpaper }}
    >
      {children}
    </AppShell>
  );
}
