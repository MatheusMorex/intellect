"use client";

import { Link2, LogOut, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CodeBox } from "@/components/ds/code-box";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initials } from "@/lib/initials";
import { changeBoardMemberRole, inviteToBoard, removeBoardMember, revokeInvite, setBoardInviteLink } from "@/server/actions/people";
import type { BoardView, Person } from "@/server/data/boards";

export type BoardSharing = {
  isAdmin: boolean;
  members: (Person & { role: "admin" | "normal" | "observer" })[];
  pending: { id: string; email: string; role: string; expiresAt: string }[];
  linkRole: string | null;
  workspaceMembers: Person[];
};

const ROLE = { admin: "Admin", normal: "Membro", observer: "Observador" } as const;

// S09 Compartilhar quadro: convidar por e-mail ou nome, link de convite e papéis.
export function ShareDialog({
  view,
  sharing,
  open,
  onOpenChange,
}: {
  view: BoardView;
  sharing: BoardSharing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [who, setWho] = useState("");
  const [role, setRole] = useState<"admin" | "normal" | "observer">("normal");
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [boardLink, setBoardLink] = useState<string | null>(null);
  const suggestions = who.trim().length >= 1 ? sharing.workspaceMembers.filter((p) => p.name.toLowerCase().includes(who.trim().toLowerCase())) : [];

  function invite(target: string) {
    setError(null);
    startTransition(async () => {
      const result = await inviteToBoard({ boardId: view.board.id, who: target, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWho("");
      if (result.data.added) toast.success("Pessoa adicionada ao quadro");
      else {
        setInviteLink(result.data.link);
        toast.success("Convite criado");
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compartilhar {view.board.name}</DialogTitle>
          <DialogDescription>Quem já é do workspace entra na hora; e-mail de fora recebe um convite que vale 7 dias.</DialogDescription>
        </DialogHeader>

        {sharing.isAdmin && (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (who.trim()) invite(who.trim());
            }}
          >
            <Label htmlFor="share-who">E-mail ou nome</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="share-who"
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="nome@empresa.com.br ou um nome do workspace"
                className="min-w-0 flex-1"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "share-error" : undefined}
                autoComplete="off"
              />
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger className="w-36" aria-label="Papel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Membro</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="observer">Observador</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" loading={pending}>
                Convidar
              </Button>
            </div>
            {suggestions.length > 0 && (
              <ul className="grid gap-1 rounded-md border p-1" aria-label="Pessoas do workspace">
                {suggestions.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" onClick={() => invite(p.id)}>
                      <Avatar className="size-6">
                        <AvatarFallback className="text-[10px] font-semibold" style={{ background: `var(--ds-label-${p.avatarColor}-bold)`, color: "var(--ds-label-text-bold)" }}>
                          {initials(p.name)}
                        </AvatarFallback>
                      </Avatar>
                      Adicionar {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <p id="share-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            {inviteLink && (
              <div className="grid gap-1">
                <p className="text-xs text-muted-foreground">O e-mail de convite fica na caixa de saída simulada. Você também pode mandar o link:</p>
                <CodeBox label="Link do convite" value={inviteLink} wrap />
              </div>
            )}
          </form>
        )}

        {sharing.isAdmin && (
          <section className="grid gap-2 rounded-md bg-muted p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link2 aria-hidden="true" className="size-4 text-muted-foreground" />
              <span className="flex-1 text-sm">{sharing.linkRole ? `Link de convite ativo (entra como ${ROLE[sharing.linkRole as keyof typeof ROLE]})` : "Link de convite desativado"}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  startTransition(async () => {
                    const result = await setBoardInviteLink(view.board.id, "normal");
                    if (result.ok) setBoardLink(result.data.link);
                    router.refresh();
                  })
                }
              >
                {sharing.linkRole ? "Gerar link novo" : "Criar link"}
              </Button>
              {sharing.linkRole && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    startTransition(async () => {
                      await setBoardInviteLink(view.board.id, null);
                      setBoardLink(null);
                      router.refresh();
                    })
                  }
                >
                  Desativar
                </Button>
              )}
            </div>
            {boardLink && <CodeBox label="Link de convite do quadro" value={boardLink} wrap />}
          </section>
        )}

        <section aria-labelledby="share-members" className="grid gap-2">
          <h3 id="share-members" className="text-sm font-semibold">
            Membros do quadro
          </h3>
          <ul className="grid gap-1">
            {sharing.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs font-semibold" style={{ background: `var(--ds-label-${m.avatarColor}-bold)`, color: "var(--ds-label-text-bold)" }}>
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {m.name}
                  {m.id === view.meId && <span className="text-muted-foreground"> (você)</span>}
                </span>
                {sharing.isAdmin ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) =>
                      startTransition(async () => {
                        const result = await changeBoardMemberRole(view.board.id, m.id, v as typeof m.role);
                        if (!result.ok) toast.error(result.error);
                        router.refresh();
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="w-36" aria-label={`Papel de ${m.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="normal">Membro</SelectItem>
                      <SelectItem value="observer">Observador</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground">{ROLE[m.role]}</span>
                )}
                {(sharing.isAdmin || m.id === view.meId) && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.id === view.meId ? "Sair do quadro" : `Tirar ${m.name} do quadro`}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await removeBoardMember(view.board.id, m.id);
                        if (!result.ok) toast.error(result.error);
                        else if (m.id === view.meId) router.push("/");
                        router.refresh();
                      })
                    }
                  >
                    {m.id === view.meId ? <LogOut aria-hidden="true" /> : <X aria-hidden="true" />}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {sharing.pending.length > 0 && (
            <>
              <h3 className="mt-2 text-sm font-semibold">Convites pendentes</h3>
              <ul className="grid gap-1">
                {sharing.pending.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{i.email}</span>
                    <span className="text-xs text-muted-foreground">{ROLE[i.role as keyof typeof ROLE]}</span>
                    {sharing.isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          startTransition(async () => {
                            await revokeInvite(i.id);
                            router.refresh();
                          })
                        }
                      >
                        Cancelar convite
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
