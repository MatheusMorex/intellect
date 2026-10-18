"use client";

import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Home,
  LayoutDashboard,
  Link2,
  ListChecks,
  Megaphone,
  Menu,
  Percent,
  Plug,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { CreateBoardDialog } from "@/components/board/create-board-dialog";
import { BrandSymbol, Logo } from "@/components/brand/logo";
import { GlobalSearch } from "@/components/shell/global-search";
import { NotificationsBell } from "@/components/shell/notifications";
import { ApplyPreferences, Shortcuts } from "@/components/shell/shortcuts";
import { UserMenu } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIDEBAR_COLLAPSED_KEY, usePersistentFlag } from "@/lib/use-persistent-flag";
import { cn } from "@/lib/utils";

// Estrutura de todas as telas logadas (components.md, "Layout"): barra superior
// de 56 px e menu lateral de 248 px. O menu nunca recolhe sozinho: só pelo
// botão com a flecha no meio da borda dele (fica só com os ícones, 56 px).
// Abaixo de 768 px não cabe ao lado do conteúdo e vira gaveta.

export type ShellProps = {
  user: { name: string; email: string; avatarColor: string; avatarUrl: string | null };
  workspace: { id: string; name: string; slug: string } | null;
  boards: { id: string; name: string }[];
  dashboards: { id: string; name: string; adPlatforms: ("meta" | "google")[] }[];
  unreadNotifications: number;
  preferences: { colorblind: boolean; reduceMotion: boolean; singleKeyShortcuts: boolean };
  appearance: { wallpaper: { url: string; dim: number; blur: number } | null };
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Duas primeiras letras do nome do quadro, para o menu recolhido. */
function shortName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

function NavLink({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item);
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        "aria-[current=page]:bg-primary-subtle aria-[current=page]:font-semibold aria-[current=page]:text-primary",
        collapsed && "justify-center px-0",
      )}
    >
      {item.icon ? (
        <item.icon aria-hidden="true" className="size-4 shrink-0" />
      ) : collapsed ? (
        // Quadro no menu recolhido: as iniciais do nome, sem cor.
        <span aria-hidden="true" className="text-[11px] font-semibold tracking-wide text-muted-foreground">
          {shortName(item.label)}
        </span>
      ) : null}
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function SectionTitle({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div aria-hidden="true" className="mx-2 my-2 h-px bg-border" />;
  return <p className="px-2.5 pt-4 pb-1 text-xs font-semibold text-muted-foreground">{children}</p>;
}

function SidebarNav({
  pathname,
  collapsed,
  props,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  props: Omit<ShellProps, "children" | "user" | "appearance">;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const slug = props.workspace?.slug ?? "";
  const currentDashboardId = /^\/d\/([^/]+)/.exec(pathname)?.[1] ?? props.dashboards[0]?.id;
  const dashboard = props.dashboards.find((d) => d.id === currentDashboardId) ?? props.dashboards[0];

  const work: NavItem[] = [
    { href: `/w/${slug}`, label: "Início", icon: Home, exact: true },
    { href: "/me/cards", label: "Meus cards", icon: ListChecks },
    { href: `/w/${slug}/members`, label: "Membros", icon: Users },
  ];
  const sales: NavItem[] = dashboard
    ? [
        { href: `/d/${dashboard.id}`, label: "Resumo", icon: BarChart3, exact: true },
        ...(dashboard.adPlatforms.includes("meta") ? [{ href: `/d/${dashboard.id}/meta`, label: "Meta", icon: Megaphone }] : []),
        ...(dashboard.adPlatforms.includes("google")
          ? [{ href: `/d/${dashboard.id}/google`, label: "Google", icon: Search }]
          : []),
        { href: `/d/${dashboard.id}/orders`, label: "Vendas", icon: ReceiptText },
        { href: `/d/${dashboard.id}/utms`, label: "UTMs", icon: Link2 },
        { href: `/d/${dashboard.id}/paineis`, label: "Painéis", icon: LayoutDashboard },
        { href: `/d/${dashboard.id}/fees`, label: "Taxas", icon: Percent },
        { href: `/d/${dashboard.id}/expenses`, label: "Despesas", icon: Wallet },
        { href: `/d/${dashboard.id}/integrations`, label: "Integrações", icon: Plug },
      ]
    : [];

  return (
    <nav aria-label="Principal" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
      <SectionTitle collapsed={collapsed}>Trabalho</SectionTitle>
      <div className="grid gap-0.5">
        {work.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        {props.boards.map((board) => (
          <NavLink key={board.id} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} item={{ href: `/b/${board.id}`, label: board.name }} />
        ))}
        {props.workspace && !collapsed && (
          <CreateBoardDialog
            workspaceId={props.workspace.id}
            workspaceName={props.workspace.name}
            trigger={
              <button type="button" className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                <Plus aria-hidden="true" className="size-4 shrink-0" />
                Criar quadro
              </button>
            }
          />
        )}
      </div>

      {dashboard && (
        <>
          <SectionTitle collapsed={collapsed}>Vendas</SectionTitle>
          {!collapsed && props.dashboards.length > 1 && (
            <div className="px-1 pb-1">
              <Select value={dashboard.id} onValueChange={(id) => router.push(`/d/${id}`)}>
                <SelectTrigger size="sm" className="w-full" aria-label="Dashboard">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.dashboards.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!collapsed && props.dashboards.length === 1 && (
            <p className="truncate px-2.5 pb-1 text-xs text-muted-foreground">{dashboard.name}</p>
          )}
          <div className="grid gap-0.5">
            {sales.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        </>
      )}

      <div className="mt-auto grid gap-0.5 pt-4">
        <NavLink item={{ href: "/settings", label: "Configurações", icon: Settings }} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

export function AppShell({ user, appearance, children, ...props }: ShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Uma escolha só, para todas as telas; começa aberto e só muda pelo botão.
  const [collapsed, setCollapsed] = usePersistentFlag(SIDEBAR_COLLAPSED_KEY, false);
  const wallpaper = appearance.wallpaper;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Plano de fundo escolhido pela pessoa: fica atrás do conteúdo; a camada da cor do tema por cima controla a intensidade. */}
      {wallpaper && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url("${wallpaper.url}")`,
              filter: wallpaper.blur ? `blur(${wallpaper.blur}px)` : undefined,
              transform: wallpaper.blur ? "scale(1.06)" : undefined,
            }}
          />
          <div className="absolute inset-0 bg-background" style={{ opacity: wallpaper.dim / 100 }} />
        </div>
      )}
      <a
        href="#conteudo"
        className="sr-only z-80 rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}>
          <Menu aria-hidden="true" />
        </Button>
        <Link href={props.workspace ? `/w/${props.workspace.slug}` : "/"} aria-label="INtellect, início" className="shrink-0 rounded-sm">
          {/* 37 px; no celular fica com 30 px para caber na barra junto com os botões. */}
          <Logo height={37} imgClassName="h-[30px] w-auto sm:h-[37px]" />
        </Link>
        <div className="flex-1" />
        <GlobalSearch singleKeyShortcuts={props.preferences.singleKeyShortcuts} workspaceSlug={props.workspace?.slug ?? null} />
        {props.workspace && (
          <CreateBoardDialog
            workspaceId={props.workspace.id}
            workspaceName={props.workspace.name}
            trigger={
              <Button size="sm" className="hidden sm:inline-flex">
                <Plus aria-hidden="true" />
                Criar
              </Button>
            }
          />
        )}
        <NotificationsBell unread={props.unreadNotifications} />
        <Shortcuts enabled={props.preferences.singleKeyShortcuts} />
        <UserMenu user={user} settingsHref="/settings" />
        <ApplyPreferences colorblind={props.preferences.colorblind} reduceMotion={props.preferences.reduceMotion} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r bg-card transition-[width] duration-200 md:flex",
            collapsed ? "w-14" : "w-62",
          )}
        >
          <SidebarNav pathname={pathname} collapsed={collapsed} props={props} />
          {/* O botão de abrir e recolher fica no meio da borda do menu. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? "Abrir o menu lateral" : "Recolher o menu lateral (fica só com os ícones)"}
                aria-expanded={!collapsed}
                className="absolute top-1/2 -right-3 z-30 grid size-6 -translate-y-1/2 place-items-center rounded-full border bg-card text-muted-foreground shadow-card outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {collapsed ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronLeft aria-hidden="true" className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Abrir o menu" : "Recolher o menu"}</TooltipContent>
          </Tooltip>
        </aside>

        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] gap-0 p-0">
          <SheetHeader className="flex-row items-center gap-2 border-b">
            <BrandSymbol size={28} alt="" />
            <SheetTitle className="text-base">Menu</SheetTitle>
            <SheetDescription className="sr-only">Navegação principal do INtellect</SheetDescription>
          </SheetHeader>
          <SidebarNav pathname={pathname} collapsed={false} props={props} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
