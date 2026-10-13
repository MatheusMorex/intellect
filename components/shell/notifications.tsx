"use client";

import { AlertTriangle, AtSign, Bell, CalendarClock, MessageSquare, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { dateTime, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markNotificationsRead } from "@/server/actions/people";
import { loadNotifications } from "@/server/actions/shell";

type Item = Awaited<ReturnType<typeof loadNotifications>>[number];

const ICON = {
  mention: AtSign,
  assigned: UserPlus,
  due_soon: CalendarClock,
  comment: MessageSquare,
  added_to_board: UserPlus,
  automation_error: AlertTriangle,
  integration_error: AlertTriangle,
} as const;

function describe(n: Item) {
  const card = String(n.data.cardName ?? "um card");
  switch (n.type) {
    case "mention":
      return { who: n.actor.name, what: `mencionou você em ${card}` };
    case "assigned":
      return { who: n.actor.name, what: n.data.item ? `passou para você o item “${n.data.item}” em ${card}` : `colocou você em ${card}` };
    case "due_soon":
      return { who: "Prazo chegando", what: `${card} vence em breve` };
    case "comment":
      return { who: n.actor.name, what: `comentou em ${card}` };
    case "added_to_board":
      return { who: n.actor.name, what: `adicionou você ao quadro ${n.boardName}` };
    case "automation_error":
      return { who: "Automação", what: `a regra “${n.data.automationName ?? ""}” falhou${n.data.error ? `: ${n.data.error}` : ""}` };
    case "integration_error":
      return { who: "Integração", what: String(n.data.message ?? "uma conta parou de sincronizar") };
  }
}

// S11 Notificações: sino com contador, lista com filtro de não lidas e "marcar todas".
export function NotificationsBell({ unread }: { unread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, startLoad] = useTransition();
  const [, startMark] = useTransition();

  const load = (unreadOnly: boolean) => startLoad(async () => setItems(await loadNotifications(unreadOnly)));

  const markAll = () =>
    startMark(async () => {
      await markNotificationsRead("all");
      setItems((list) => (onlyUnread ? [] : (list ?? []).map((n) => ({ ...n, read: true }))));
      router.refresh();
    });

  const openItem = (n: Item) => {
    setOpen(false);
    if (!n.read) startMark(async () => void (await markNotificationsRead([n.id])));
    if (n.cardId && n.boardId) router.push(`/b/${n.boardId}?card=${n.cardId}`);
    else if (n.boardId) router.push(`/b/${n.boardId}`);
    router.refresh();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load(onlyUnread);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notificações, ${unread} não lidas` : "Notificações"}>
          <Bell aria-hidden="true" />
          {unread > 0 && (
            <span aria-hidden="true" className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-on-danger">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(400px,calc(100vw-2rem))] p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="flex-1 text-base font-semibold">Notificações</h2>
          <Label className="text-xs font-normal text-muted-foreground">
            Só não lidas
            <Switch
              checked={onlyUnread}
              onCheckedChange={(v) => {
                setOnlyUnread(v);
                load(v);
              }}
            />
          </Label>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto" aria-busy={loading || undefined}>
          {items == null ? (
            <div className="grid gap-3 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center gap-2 px-6 py-10 text-center">
              <Bell aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="font-semibold">{onlyUnread ? "Nada novo por aqui" : "Nenhuma notificação"}</p>
              <p className="text-sm text-muted-foreground">Menções, cards atribuídos a você e prazos aparecem aqui.</p>
            </div>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = ICON[n.type];
                const { who, what } = describe(n);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn("flex w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:bg-accent", !n.read && "bg-primary-subtle/50")}
                    >
                      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", n.type.endsWith("error") ? "text-danger" : "text-muted-foreground")} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="text-sm">
                          <span className="font-semibold">{who}</span> {what}
                        </span>
                        {typeof n.data.excerpt === "string" && <span className="line-clamp-2 text-xs text-muted-foreground">“{n.data.excerpt}”</span>}
                        <span className="text-xs text-muted-foreground" title={dateTime(new Date(n.createdAt))}>
                          {relative(new Date(n.createdAt))}
                          {n.boardName && ` · ${n.boardName}`}
                        </span>
                      </span>
                      {!n.read && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
                          <span className="sr-only">não lida</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {items && items.some((n) => !n.read) && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={markAll}>
              Marcar todas como lidas
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
