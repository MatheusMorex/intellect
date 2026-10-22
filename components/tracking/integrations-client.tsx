"use client";

import { Link2, Plug, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createConnectLink,
  createIntegrationTest,
  disconnectProvider,
  setDashboardAccount,
  setDashboardStore,
  simulateConnect,
} from "@/server/actions/integrations";

type Provider = "meta" | "google";
const NAME: Record<Provider, string> = { meta: "Meta", google: "Google" };

export function ProviderActions({
  dashboardId,
  provider,
  connected,
  canManage,
  mode,
}: {
  dashboardId: string;
  provider: Provider;
  connected: boolean;
  canManage: boolean;
  mode: "fake" | "live";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  if (!canManage) return <p className="text-xs text-muted-foreground">Só quem administra o workspace conecta contas.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={connected ? "outline" : "default"}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await simulateConnect({ dashboardId, provider });
            if (!result.ok) toast.error(result.error);
            else toast.success(mode === "fake" ? `${NAME[provider]} conectado (modo de teste).` : `${NAME[provider]} conectado.`);
            router.refresh();
          })
        }
      >
        <Plug aria-hidden="true" />
        {connected ? "Conectar de novo" : `Conectar ${NAME[provider]}`}
      </Button>
      <Button
        variant="ghost"
        onClick={() =>
          startTransition(async () => {
            const result = await createConnectLink({ dashboardId, provider });
            if (!result.ok) toast.error(result.error);
            else setLink(result.data);
          })
        }
      >
        <Link2 aria-hidden="true" />
        Link para outra pessoa conectar
      </Button>
      {connected && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="text-danger">
              <Unplug aria-hidden="true" />
              Desconectar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desconectar o {NAME[provider]}?</AlertDialogTitle>
              <AlertDialogDescription>
                O gasto para de atualizar. O histórico de campanhas e de gasto continua aqui, e dá para conectar de novo depois.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  startTransition(async () => {
                    const result = await disconnectProvider({ dashboardId, provider });
                    if (!result.ok) toast.error(result.error);
                    else toast(`${NAME[provider]} desconectado.`);
                    router.refresh();
                  })
                }
              >
                Desconectar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <Dialog open={link != null} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de conexão</DialogTitle>
            <DialogDescription>
              Mande para quem tem acesso à conta do {NAME[provider]}. O link vale por 24 horas e só serve para este dashboard.
              {mode === "fake" ? " No modo de teste, ele não abre a tela do " + NAME[provider] + "." : ""}
            </DialogDescription>
          </DialogHeader>
          {link && <CodeBox label="Link de conexão" value={link.url} wrap />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AccountSwitch({
  dashboardId,
  accountId,
  name,
  linked,
  canManage,
}: {
  dashboardId: string;
  accountId: string;
  name: string;
  linked: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={linked}
      disabled={!canManage || pending}
      aria-busy={pending || undefined}
      aria-label={`Usar ${name} neste dashboard`}
      onCheckedChange={(enabled) =>
        startTransition(async () => {
          const result = await setDashboardAccount({ dashboardId, accountId, enabled });
          if (!result.ok) toast.error(result.error);
          router.refresh();
        })
      }
    />
  );
}

export function StoreSwitch({ dashboardId, storeId, name, linked, canManage }: { dashboardId: string; storeId: string; name: string; linked: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={linked}
      disabled={!canManage || pending}
      aria-busy={pending || undefined}
      aria-label={`Usar a loja ${name} neste dashboard`}
      onCheckedChange={(enabled) =>
        startTransition(async () => {
          const result = await setDashboardStore({ dashboardId, storeId, enabled });
          if (!result.ok) toast.error(result.error);
          router.refresh();
        })
      }
    />
  );
}

export function ImportOrdersButton({ mode }: { mode: "fake" | "live" }) {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast(
          mode === "fake"
            ? "No modo de teste, os pedidos de exemplo já estão importados."
            : "A importação começou. Os pedidos dos últimos 60 dias aparecem em alguns minutos.",
        )
      }
    >
      Importar pedidos antigos
    </Button>
  );
}

// Gerador de UTMs para tráfego orgânico (S22): bio, WhatsApp, e-mail.
export function UtmGenerator() {
  const [fields, setFields] = useState({ url: "", source: "", medium: "", campaign: "", content: "", term: "", extra: "" });
  const set = (k: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: event.target.value }));
  const result = useMemo(() => {
    if (!fields.url || !fields.source) return null;
    try {
      const url = new URL(fields.url.startsWith("http") ? fields.url : `https://${fields.url}`);
      const pairs: [string, string][] = [
        ["utm_source", fields.source],
        ["utm_medium", fields.medium],
        ["utm_campaign", fields.campaign],
        ["utm_content", fields.content],
        ["utm_term", fields.term],
      ];
      for (const [k, v] of pairs) if (v.trim()) url.searchParams.set(k, v.trim());
      for (const part of fields.extra.split("&")) {
        const [k, ...rest] = part.split("=");
        if (k?.trim() && rest.length) url.searchParams.set(k.trim(), rest.join("=").trim());
      }
      return url.toString();
    } catch {
      return "invalid";
    }
  }, [fields]);

  const field = (k: keyof typeof fields, label: string, placeholder: string, help?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`utm-${k}`}>{label}</Label>
      <Input id={`utm-${k}`} value={fields[k]} onChange={set(k)} placeholder={placeholder} />
      {help && <p className="text-xs font-normal text-muted-foreground">{help}</p>}
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("url", "Endereço da página (obrigatório)", "https://sua-loja.com.br/produto")}
        {field("source", "utm_source (obrigatório)", "instagram_bio", "De onde vem: instagram_bio, whatsapp, email…")}
        {field("medium", "utm_medium", "organic")}
        {field("campaign", "utm_campaign", "lancamento-novembro")}
        {field("content", "utm_content", "link-da-bio")}
        {field("term", "utm_term", "")}
        {field("extra", "Parâmetros extras", "sck=bio&src=perfil", "No formato chave=valor, separados por &.")}
      </div>
      {result === "invalid" ? (
        <p role="alert" className="text-sm text-danger">
          O endereço da página não é válido. Cole o link completo.
        </p>
      ) : result ? (
        <CodeBox label="Link com UTMs" value={result} wrap />
      ) : (
        <p className="text-sm text-muted-foreground">Preencha o endereço e o utm_source para ver o link.</p>
      )}
    </div>
  );
}

export function IntegrationTestForm({ dashboardId, canManage, mode }: { dashboardId: string; canManage: boolean; mode: "fake" | "live" }) {
  const router = useRouter();
  const [source, setSource] = useState<"meta" | "google" | "organic">("meta");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; code: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) return <p className="text-sm text-muted-foreground">Só quem administra o workspace cria testes.</p>;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createIntegrationTest({ dashboardId, source, url });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setCreated(result.data);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="test-source">Fonte de tráfego</Label>
          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger id="test-source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="organic">Orgânico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="test-url">Link da página da campanha</Label>
          <Input
            id="test-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://sua-loja.com.br/produto"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "test-error" : undefined}
          />
        </div>
      </div>
      {error && (
        <p id="test-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" loading={pending}>
          Gerar link de teste
        </Button>
      </div>
      {created && (
        <div className="grid gap-2 rounded-md bg-muted p-4">
          <p className="text-sm">
            Abra o link abaixo num navegador anônimo e faça uma compra de teste. Quando o pedido chegar, o teste muda para &quot;recebido&quot;.
          </p>
          <CodeBox label="Link de teste" value={created.url} wrap />
          {mode === "fake" && (
            <p className="text-xs text-muted-foreground">
              No modo de teste, simule a compra com: <code className="font-mono">npm run simulate:order -- --teste {created.code}</code>
            </p>
          )}
        </div>
      )}
    </form>
  );
}
