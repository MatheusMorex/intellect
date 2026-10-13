"use client";

import { LogOut, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PersonAvatar } from "@/components/board/card-popovers";
import { CodeBox } from "@/components/ds/code-box";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateTime, relative } from "@/lib/format";
import { changeWorkspaceRole, inviteToWorkspace, removeWorkspaceMember, revokeInvite } from "@/server/actions/people";
import type { getWorkspaceMembers } from "@/server/data/boards";

type Data = Awaited<ReturnType<typeof getWorkspaceMembers>>;

export function InviteToWorkspace({ workspaceId, domain }: { workspaceId: string; domain: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"normal" | "admin">("normal");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; byEmail: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (address: string) =>
    startTransition(async () => {
      setError(null);
      const result = await inviteToWorkspace({ workspaceId, email: address, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLink({ url: result.data.link, byEmail: !!address });
      setEmail("");
      toast.success(address ? "Convite criado" : "Link de convite criado");
      router.refresh();
    });

  return (
    <section aria-labelledby="convidar" className="grid gap-3 rounded-lg border bg-card p-4 sm:p-6">
      <h2 id="convidar" className="text-base font-semibold">
        Convidar para o workspace
      </h2>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) send(email.trim());
        }}
      >
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="ws-email">E-mail</Label>
          <Input
            id="ws-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={domain ? `nome@${domain}` : "nome@empresa.com.br"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "ws-error" : undefined}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ws-role">Papel</Label>
          <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
            <SelectTrigger id="ws-role" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Membro</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" loading={pending} disabled={!email.trim()}>
          Convidar
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => send("")}>
          Criar link de convite
        </Button>
      </form>
      {error && (
        <p id="ws-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {link && (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">
            {link.byEmail ? "O e-mail fica na caixa de saída simulada (nada é enviado de verdade). Você também pode mandar o link:" : "Qualquer pessoa com este link entra no workspace nos próximos 30 dias:"}
          </p>
          <CodeBox label="Link do convite" value={link.url} wrap />
        </div>
      )}
      {domain && <p className="text-xs text-muted-foreground">Só e-mails @{domain} podem ser convidados.</p>}
    </section>
  );
}

const ROLE = { admin: "Admin", normal: "Membro" } as const;

export function MembersTable({ data }: { data: Data }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error);
      else done?.();
      router.refresh();
    });

  return (
    <section aria-labelledby="membros" className="grid gap-3">
      <h2 id="membros" className="text-base font-semibold">
        Membros ({data.members.length})
      </h2>
      <ul className="divide-y rounded-lg border bg-card">
        {data.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <PersonAvatar person={m} size="size-9" />
            <div className="grid min-w-0 flex-1 basis-56">
              <span className="truncate text-sm font-medium">
                {m.name}
                {m.me && <span className="font-normal text-muted-foreground"> (você)</span>}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {m.email}
                {m.username && ` · @${m.username}`}
              </span>
            </div>
            <span className="w-36 text-xs text-muted-foreground" title={m.lastActiveAt ? dateTime(new Date(m.lastActiveAt)) : undefined}>
              {m.lastActiveAt ? `Ativo ${relative(new Date(m.lastActiveAt))}` : "Nunca entrou"}
            </span>
            <span className="w-20 text-xs text-muted-foreground">
              {m.boards} {m.boards === 1 ? "quadro" : "quadros"}
            </span>
            {data.isAdmin ? (
              <Select value={m.role} onValueChange={(v) => act(() => changeWorkspaceRole(data.workspace.id, m.id, v as "admin" | "normal"))}>
                <SelectTrigger size="sm" className="w-32" aria-label={`Papel de ${m.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="normal">Membro</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span className="w-32 text-sm">{ROLE[m.role as keyof typeof ROLE] ?? m.role}</span>
            )}
            {(data.isAdmin || m.me) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={m.me ? "Sair do workspace" : `Tirar ${m.name} do workspace`}>
                    {m.me ? <LogOut aria-hidden="true" /> : <UserMinus aria-hidden="true" />}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{m.me ? "Sair do workspace?" : `Tirar ${m.name} do workspace?`}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {m.me ? "Você perde o acesso a todos os quadros e dashboards daqui." : "A pessoa sai de todos os quadros do workspace. Os cards e comentários dela ficam."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => act(() => removeWorkspaceMember(data.workspace.id, m.id), () => m.me && router.push("/"))}>
                      {m.me ? "Sair" : "Tirar do workspace"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </li>
        ))}
      </ul>
      {data.members.length === 1 && <p className="text-sm text-muted-foreground">Só você por aqui. Convide o time para dividir os quadros.</p>}

      {data.invites.length > 0 && (
        <>
          <h2 className="mt-2 text-base font-semibold">Convites pendentes ({data.invites.length})</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {data.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.email ?? `Link de convite (${i.usedCount} ${i.usedCount === 1 ? "uso" : "usos"})`}</span>
                <span className="text-xs text-muted-foreground">{ROLE[i.role as keyof typeof ROLE] ?? i.role}</span>
                <span className="text-xs text-muted-foreground">vale até {new Date(i.expiresAt).toLocaleDateString("pt-BR")}</span>
                {data.isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => act(() => revokeInvite(i.id), () => toast.success("Convite cancelado"))}>
                    Cancelar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
