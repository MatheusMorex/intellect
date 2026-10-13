"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateProfile } from "@/server/actions/people";

type Profile = {
  name: string;
  username: string | null;
  bio: string;
  timezone: string;
  theme: "light" | "dark" | "system";
  preferences: { colorblind: boolean; reduceMotion: boolean; singleKeyShortcuts: boolean; emailNotifications: "never" | "periodic" | "instant" };
};

const TIMEZONES = [
  ["America/Sao_Paulo", "Brasília (São Paulo, Rio, BH, Sul)"],
  ["America/Manaus", "Amazonas (Manaus)"],
  ["America/Cuiaba", "Mato Grosso (Cuiabá)"],
  ["America/Belem", "Pará (Belém)"],
  ["America/Fortaleza", "Nordeste (Fortaleza, Salvador, Recife)"],
  ["America/Rio_Branco", "Acre (Rio Branco)"],
  ["America/Noronha", "Fernando de Noronha"],
  ["Europe/Lisbon", "Portugal (Lisboa)"],
  ["UTC", "UTC"],
] as const;

function Row({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{title}</Label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      </div>
      {children}
    </div>
  );
}

// S13 Perfil e preferências. Salva tudo junto; o tema também muda na hora neste navegador.
export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [form, setForm] = useState(profile);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pref = <K extends keyof Profile["preferences"]>(k: K, v: Profile["preferences"][K]) => setForm((f) => ({ ...f, preferences: { ...f.preferences, [k]: v } }));
  const timezones = TIMEZONES.some(([v]) => v === form.timezone) ? TIMEZONES : ([[form.timezone, form.timezone], ...TIMEZONES] as const);

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateProfile({ ...form, username: form.username ?? "" });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setTheme(form.theme);
          toast.success("Perfil salvo");
          router.refresh();
        });
      }}
    >
      <section aria-labelledby="perfil" className="grid gap-4 rounded-lg border bg-card p-4 sm:p-6">
        <h2 id="perfil" className="text-base font-semibold">
          Perfil
        </h2>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="p-name">Nome</Label>
            <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-user">Seu @ (para menções)</Label>
            <Input id="p-user" value={form.username ?? ""} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ana.lima" aria-describedby="p-user-hint" />
            <p id="p-user-hint" className="text-xs text-muted-foreground">
              Letras, números, ponto ou sublinhado.
            </p>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-bio">Bio</Label>
          <Textarea id="p-bio" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="O que você faz no time" maxLength={500} />
        </div>
        <div className="grid gap-1.5 sm:max-w-sm">
          <Label htmlFor="p-tz">Fuso horário</Label>
          <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
            <SelectTrigger id="p-tz" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map(([v, t]) => (
                <SelectItem key={v} value={v}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section aria-labelledby="prefs" className="grid gap-2 rounded-lg border bg-card p-4 sm:p-6">
        <h2 id="prefs" className="text-base font-semibold">
          Preferências
        </h2>
        <fieldset className="grid gap-2 py-2">
          <legend className="mb-2 text-sm font-medium">Tema</legend>
          <RadioGroup value={form.theme} onValueChange={(v) => setForm({ ...form, theme: v as Profile["theme"] })} className="flex flex-wrap gap-4">
            {(
              [
                ["light", "Claro"],
                ["dark", "Escuro"],
                ["system", "Igual ao do sistema"],
              ] as const
            ).map(([v, t]) => (
              <Label key={v} className="font-normal">
                <RadioGroupItem value={v} /> {t}
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="divide-y">
          <Row id="p-colorblind" title="Modo para daltônicos" hint="Etiquetas ganham padrões além da cor.">
            <Switch id="p-colorblind" aria-describedby="p-colorblind-hint" checked={form.preferences.colorblind} onCheckedChange={(v) => pref("colorblind", v)} />
          </Row>
          <Row id="p-motion" title="Reduzir animações" hint="Tira transições e movimentos da tela.">
            <Switch id="p-motion" aria-describedby="p-motion-hint" checked={form.preferences.reduceMotion} onCheckedChange={(v) => pref("reduceMotion", v)} />
          </Row>
          <Row id="p-keys" title="Atalhos de uma tecla" hint="/ para buscar, F para filtrar, Q para Meus cards.">
            <Switch id="p-keys" aria-describedby="p-keys-hint" checked={form.preferences.singleKeyShortcuts} onCheckedChange={(v) => pref("singleKeyShortcuts", v)} />
          </Row>
          <Row id="p-email" title="E-mails de notificação" hint="Menções, cards atribuídos e prazos.">
            <Select value={form.preferences.emailNotifications} onValueChange={(v) => pref("emailNotifications", v as Profile["preferences"]["emailNotifications"])}>
              <SelectTrigger id="p-email" aria-describedby="p-email-hint" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instant">Na hora</SelectItem>
                <SelectItem value="periodic">Um resumo por hora</SelectItem>
                <SelectItem value="never">Nunca</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={() => setForm(profile)}>
          Desfazer mudanças
        </Button>
      </div>
    </form>
  );
}
