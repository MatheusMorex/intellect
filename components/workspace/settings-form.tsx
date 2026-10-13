"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateWorkspace } from "@/server/actions/people";

type Workspace = { id: string; name: string; description: string; allowedEmailDomain: string | null };

// S12 Configurações do workspace: nome, descrição e domínio permitido nos convites.
export function WorkspaceSettingsForm({ workspace, canEdit }: { workspace: Workspace; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [domain, setDomain] = useState(workspace.allowedEmailDomain ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid max-w-xl gap-4 rounded-lg border bg-card p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateWorkspace({ workspaceId: workspace.id, name, description, allowedEmailDomain: domain });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success("Workspace salvo");
          router.refresh();
        });
      }}
    >
      {!canEdit && <p className="text-sm text-muted-foreground">Só admins do workspace mudam estas configurações.</p>}
      <fieldset disabled={!canEdit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="ws-name">Nome</Label>
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ws-desc">Descrição</Label>
          <Textarea id="ws-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="Para que serve este workspace" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ws-domain">Domínio permitido nos convites</Label>
          <Input id="ws-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="intellect.com.br" aria-describedby="ws-domain-hint" />
          <p id="ws-domain-hint" className="text-xs text-muted-foreground">
            Com um domínio, só e-mails dele podem ser convidados. Deixe vazio para aceitar qualquer e-mail.
          </p>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {canEdit && (
        <div>
          <Button type="submit" loading={pending}>
            Salvar
          </Button>
        </div>
      )}
    </form>
  );
}
