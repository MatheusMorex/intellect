"use client";

import { MoreHorizontal, SquarePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/ds/badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMPTY, integer, money, percentOf, roas } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createCardFromRow } from "@/server/actions/cards";
import type { CampaignLine, CampaignReport, Provider } from "@/server/data/tracking";

const STATUS: Record<CampaignLine["status"], { label: string; pill: "connected" | "waiting" | "error" | "expiring" }> = {
  active: { label: "Ativa", pill: "connected" },
  paused: { label: "Pausada", pill: "waiting" },
  deleted: { label: "Excluída", pill: "waiting" },
  archived: { label: "Arquivada", pill: "waiting" },
  in_review: { label: "Em análise", pill: "expiring" },
  rejected: { label: "Rejeitada", pill: "error" },
  with_issues: { label: "Com restrições", pill: "error" },
  unknown: { label: "Desconhecido", pill: "waiting" },
};

const CHANNEL: Record<string, string> = { SEARCH: "Pesquisa", PERFORMANCE_MAX: "Performance Max", DISPLAY: "Display", VIDEO: "Vídeo" };

type ListOption = { boardId: string; boardName: string; listId: string; listName: string };

function Num({ children, negative }: { children: React.ReactNode; negative?: boolean }) {
  return <TableCell className={cn("text-right", negative && "text-danger")}>{children}</TableCell>;
}

export function CampaignTable({
  dashboardId,
  provider,
  currency,
  periodLabel,
  rows,
  totals,
  lists,
}: {
  dashboardId: string;
  provider: Provider;
  currency: string;
  periodLabel: string;
  rows: CampaignLine[];
  totals: CampaignReport["totals"];
  lists: ListOption[];
}) {
  const [target, setTarget] = useState<CampaignLine | null>(null);
  const m = (c: number | null) => (c == null ? EMPTY : money(c, currency));

  return (
    <div className="grid gap-3">
      <Tabs value="campanhas">
        <TabsList variant="underline" aria-label="Nível">
          <TabsTrigger value="contas" disabled title="Chega numa próxima etapa">
            Contas
          </TabsTrigger>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="conjuntos" disabled title="Chega numa próxima etapa">
            {provider === "google" ? "Grupos" : "Conjuntos"}
          </TabsTrigger>
          <TabsTrigger value="anuncios" disabled title="Chega numa próxima etapa">
            Anúncios
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
          Nenhuma campanha encontrada nesta conta.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="tabular">
            <TableCaption className="sr-only">
              Campanhas do {provider === "meta" ? "Meta" : "Google"}, {periodLabel}
            </TableCaption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-muted">
                <TableHead>Status</TableHead>
                <TableHead className="sticky left-0 z-10 bg-muted">Campanha</TableHead>
                <TableHead className="text-right">Orçamento diário</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">CPA</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">CPM</TableHead>
                <TableHead className="text-right">Impressões</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <StatusPill status={STATUS[r.status].pill}>{STATUS[r.status].label}</StatusPill>
                  </TableCell>
                  <TableCell className="sticky left-0 z-10 max-w-80 bg-card">
                    <span className="block truncate" title={r.name}>
                      {r.name}
                    </span>
                    {r.channelType && (
                      <span className="text-xs text-muted-foreground">{CHANNEL[r.channelType] ?? r.channelType}</span>
                    )}
                  </TableCell>
                  <Num>{m(r.dailyBudgetCents)}</Num>
                  <Num>{money(r.spendCents, currency)}</Num>
                  <Num>{integer(r.sales)}</Num>
                  <Num>{money(r.revenueCents, currency)}</Num>
                  <Num negative={r.profitCents < 0}>{money(r.profitCents, currency)}</Num>
                  <Num negative={r.roas != null && r.roas < 1}>{roas(r.roas) ?? EMPTY}</Num>
                  <Num>{m(r.cpaCents)}</Num>
                  <Num>{percentOf(r.ctr, 2) ?? EMPTY}</Num>
                  <Num>{m(r.cpcCents)}</Num>
                  <Num>{m(r.cpmCents)}</Num>
                  <Num>{integer(r.impressions)}</Num>
                  <TableCell className="w-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${r.name}`}>
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setTarget(r)}>
                          <SquarePlus aria-hidden="true" />
                          Criar card
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="border-t-2 border-input hover:bg-card">
                <TableCell />
                <TableCell className="sticky left-0 z-10 bg-card">Total</TableCell>
                <TableCell />
                <Num>{money(totals.spendCents, currency)}</Num>
                <Num>{integer(totals.sales)}</Num>
                <Num>{money(totals.revenueCents, currency)}</Num>
                <Num negative={totals.profitCents < 0}>{money(totals.profitCents, currency)}</Num>
                <Num negative={totals.roas != null && totals.roas < 1}>{roas(totals.roas) ?? EMPTY}</Num>
                <Num>{m(totals.cpaCents)}</Num>
                <Num>{percentOf(totals.ctr, 2) ?? EMPTY}</Num>
                <Num>{m(totals.cpcCents)}</Num>
                <Num>{m(totals.cpmCents)}</Num>
                <Num>{integer(totals.impressions)}</Num>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Faturamento e lucro contam só as vendas atribuídas a cada campanha. O lucro da linha é faturamento menos gasto.
      </p>

      <CreateCardDialog dashboardId={dashboardId} campaign={target} lists={lists} onClose={() => setTarget(null)} />
    </div>
  );
}

function CreateCardDialog({
  dashboardId,
  campaign,
  lists,
  onClose,
}: {
  dashboardId: string;
  campaign: CampaignLine | null;
  lists: ListOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [listId, setListId] = useState<string>("");
  const boards = [...new Map(lists.map((l) => [l.boardId, l.boardName])).entries()];
  const selectedList = listId || lists[0]?.listId || "";

  return (
    <Dialog
      open={campaign != null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!campaign) return;
            const name = String(new FormData(event.currentTarget).get("name") ?? "");
            startTransition(async () => {
              const result = await createCardFromRow({ dashboardId, campaignId: campaign.id, listId: selectedList, name });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success("Card criado e ligado à campanha", {
                action: { label: "Abrir quadro", onClick: () => router.push(`/b/${result.data.boardId}`) },
              });
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Criar card</DialogTitle>
            <DialogDescription>
              O card fica ligado a {campaign?.name ? <strong className="font-semibold">{campaign.name}</strong> : "esta campanha"} e
              mostra o ROAS dela no quadro.
            </DialogDescription>
          </DialogHeader>
          {lists.length === 0 ? (
            <p className="text-muted-foreground">
              Você ainda não tem um quadro onde possa criar cards. <Link href="/">Crie um quadro primeiro.</Link>
            </p>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="card-name">Nome do card (obrigatório)</Label>
                <Input
                  id="card-name"
                  name="name"
                  required
                  maxLength={512}
                  defaultValue={campaign ? `Acompanhar ${campaign.name}` : ""}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "card-error" : undefined}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="card-list">Lista</Label>
                <Select value={selectedList} onValueChange={setListId}>
                  <SelectTrigger id="card-list" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {boards.map(([boardId, boardName]) => (
                      <SelectGroup key={boardId}>
                        <SelectLabel>{boardName}</SelectLabel>
                        {lists
                          .filter((l) => l.boardId === boardId)
                          .map((l) => (
                            <SelectItem key={l.listId} value={l.listId}>
                              {l.listName}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error && (
                <p id="card-error" role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
            </>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} disabled={lists.length === 0}>
              Criar card
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
