"use client";

import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  Home,
  Link2,
  ListChecks,
  Megaphone,
  Menu,
  Percent,
  Plug,
  ReceiptText,
  Search,
  Settings,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { BrandSymbol, Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePersistentFlag } from "@/lib/use-persistent-flag";
import { cn } from "@/lib/utils";

// Estrutura de todas as telas logadas (components.md, "Layout"): barra superior
// de 56 px, menu lateral de 248 px que recolhe para 56 px e vira gaveta abaixo de 1024 px.

export type ShellProps = {
  user: { name: string; email: string; avatarColor: string };
  workspace: { name: string; slug: string } | null;
  boards: { id: string; name: string; background: string }[];
  dashboards: { id: string; name: string; adPlatforms: ("meta" | "google")[] }[];
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  swatch?: string; // cor do quadro, no lugar do ícone
  exact?: boolean;
};

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
      ) : (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-sm"
          style={{ background: `var(--ds-label-${item.swatch ?? "black"}-bold)` }}
        />
      )}
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
  props: Omit<ShellProps, "children" | "user">;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const slug = props.workspace?.slug ?? "";
  const currentDashboardId = /^\/d\/([^/]+)/.exec(pathname)?.[1] ?? props.dashboards[0]?.id;
  const dashboard = props.dashboards.find((d) => d.id === currentDashboardId) ?? props.dashboards[0];

  const work: NavItem[] = [
    { href: `/w/${slug}`, label: "Início", icon: Home, exact: true },
    { href: "/me/cards", label: "Meus cards", icon: ListChecks },
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
        { href: `/d/${dashboard.id}/reports`, label: "Relatórios", icon: FileSpreadsheet },
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
          <NavLink
            key={board.id}
            pathname={pathname}
            collapsed={collapsed}
            onNavigate={onNavigate}
            item={{ href: `/b/${board.id}`, label: board.name, swatch: board.background }}
          />
        ))}
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
        <NavLink
          item={{ href: `/w/${slug}/settings`, label: "Configurações", icon: Settings }}
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>
    </nav>
  );
}

export function AppShell({ user, children, ...props }: ShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const onBoard = pathname.startsWith("/b/");
  const [collapsedChoice, setCollapsed] = usePersistentFlag(onBoard ? "itl-menu-recolhido-quadro" : "itl-menu-recolhido", onBoard);
  const collapsed = collapsedChoice;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only z-80 rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Abrir menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu aria-hidden="true" />
        </Button>
        <Link href={props.workspace ? `/w/${props.workspace.slug}` : "/"} aria-label="INtellect, início" className="rounded-sm">
          <Logo />
        </Link>
        <div className="flex-1" />
        <UserMenu user={user} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r bg-card lg:flex",
            collapsed ? "w-14" : "w-62",
          )}
        >
          <SidebarNav pathname={pathname} collapsed={collapsed} props={props} />
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn("w-full justify-start text-muted-foreground", collapsed && "justify-center px-0")}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Abrir menu lateral" : "Recolher menu lateral"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronsRight aria-hidden="true" /> : <ChevronsLeft aria-hidden="true" />}
              {!collapsed && "Recolher"}
            </Button>
          </div>
        </aside>

        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] gap-0 p-0">
          <SheetHeader className="flex-row items-center gap-2 border-b">
            <BrandSymbol size={24} alt="" />
            <SheetTitle className="text-base">Menu</SheetTitle>
            <SheetDescription className="sr-only">Navegação principal do INtellect</SheetDescription>
          </SheetHeader>
          <SidebarNav pathname={pathname} collapsed={false} props={props} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

