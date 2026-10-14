"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { HelpTip } from "@/components/ds/help-tip";
import { ImageUploadButton } from "@/components/ds/image-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { HelpTopic } from "@/lib/help";
import { SIDEBAR_COLLAPSED_KEY, usePersistentFlag } from "@/lib/use-persistent-flag";
import { removeWallpaper, updateAppearance } from "@/server/actions/settings";

type Appearance = {
  theme: "light" | "dark" | "system";
  showTaglines: boolean;
  homePage: "inicio" | "meus-cards" | "resumo";
  wallpaper: { url: string; dim: number; blur: number } | null;
};

export function SettingsSection({ id, title, help, description, children }: { id: string; title: string; help: HelpTopic; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="grid gap-1">
        <div className="flex items-center gap-1">
          <h2 id={id} className="text-base font-semibold">
            {title}
          </h2>
          <HelpTip topic={help} className="size-5" />
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Controle deslizante de 0 a max, que salva quando a pessoa solta. */
function Slider({ id, label, hint, value, max, unit, disabled, onCommit }: { id: string; label: string; hint: string; value: number; max: number; unit: string; disabled?: boolean; onCommit: (v: number) => void }) {
  const [current, setCurrent] = useState(value);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm tabular-nums text-muted-foreground">
          {current}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={current}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(e) => setCurrent(Number(e.target.value))}
        onPointerUp={() => current !== value && onCommit(current)}
        onKeyUp={() => current !== value && onCommit(current)}
        className="w-full accent-primary disabled:opacity-50"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

// Aba Aparência de Configurações: tema, plano de fundo, menu lateral, frase em destaque no Início e tela inicial.
export function AppearanceSettings({ appearance }: { appearance: Appearance }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = usePersistentFlag(SIDEBAR_COLLAPSED_KEY, false);

  const save = (input: Parameters<typeof updateAppearance>[0], message = "Aparência salva") =>
    startTransition(async () => {
      const result = await updateAppearance(input);
      if (!result.ok) toast.error(result.error);
      else toast.success(message);
      router.refresh();
    });

  const wp = appearance.wallpaper;

  return (
    <div className="grid gap-6">
      <SettingsSection id="cfg-tema" title="Tema" help="config-tema" description="Claro, escuro ou igual ao do seu computador.">
        <RadioGroup
          value={appearance.theme}
          onValueChange={(v) => {
            setTheme(v);
            save({ theme: v as Appearance["theme"] }, "Tema salvo");
          }}
          className="flex flex-wrap gap-4"
          aria-label="Tema"
        >
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
      </SettingsSection>

      <SettingsSection
        id="cfg-fundo"
        title="Plano de fundo"
        help="config-plano-de-fundo"
        description="Uma imagem do seu computador atrás das telas do INtellect. Só você vê o seu plano de fundo."
      >
        <div className="grid gap-4 sm:grid-cols-[240px_minmax(0,1fr)]">
          <div
            role="img"
            aria-label={wp ? "Prévia do plano de fundo" : "Sem plano de fundo"}
            className="relative grid h-36 place-items-center overflow-hidden rounded-md border bg-background text-sm text-muted-foreground"
          >
            {wp ? (
              <>
                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${wp.url}")`, filter: wp.blur ? `blur(${wp.blur / 2}px)` : undefined, transform: wp.blur ? "scale(1.06)" : undefined }} />
                <div className="absolute inset-0 bg-background" style={{ opacity: wp.dim / 100 }} />
                <span className="relative rounded-md border-2 border-input px-3 py-1 font-semibold text-foreground">R$ 0,00</span>
              </>
            ) : (
              "Sem imagem"
            )}
          </div>
          <div className="grid content-start gap-3">
            <div className="flex flex-wrap gap-2">
              <ImageUploadButton kind="wallpaper" label={wp ? "Trocar imagem" : "Importar imagem do computador"} successMessage="Plano de fundo salvo" />
              {wp && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await removeWallpaper();
                      if (!result.ok) toast.error(result.error);
                      else toast.success("Plano de fundo removido");
                      router.refresh();
                    })
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Remover
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">JPG, PNG ou WebP, de qualquer tamanho: a imagem é ajustada antes de enviar.</p>
            <Slider
              key={`dim-${wp?.dim}`}
              id="cfg-dim"
              label="Quanto o tema cobre a imagem"
              hint="Mais alto deixa os textos mais fáceis de ler; mais baixo mostra mais a imagem."
              value={wp?.dim ?? 70}
              max={90}
              unit="%"
              disabled={!wp || pending}
              onCommit={(v) => save({ wallpaperDim: v })}
            />
            <Slider
              key={`blur-${wp?.blur}`}
              id="cfg-blur"
              label="Desfoque"
              hint="Desfocar a imagem ajuda a ler o que fica por cima dela."
              value={wp?.blur ?? 0}
              max={20}
              unit=" px"
              disabled={!wp || pending}
              onCommit={(v) => save({ wallpaperBlur: v })}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="cfg-navegacao" title="Navegação" help="config-navegacao">
        <div className="divide-y">
          <div className="flex items-start justify-between gap-6 py-3">
            <div className="grid gap-0.5">
              <Label htmlFor="cfg-menu">Menu lateral só com ícones</Label>
              <p className="text-sm text-muted-foreground">O mesmo que o botão com a flecha no meio do menu. Vale para este navegador.</p>
            </div>
            <Switch id="cfg-menu" checked={collapsed} onCheckedChange={setCollapsed} />
          </div>
          <div className="flex items-start justify-between gap-6 py-3">
            <div className="grid gap-0.5">
              <Label htmlFor="cfg-frases">Frase em destaque no Início</Label>
              <p className="text-sm text-muted-foreground">A frase sobre a INtellect no topo da tela Início.</p>
            </div>
            <Switch id="cfg-frases" checked={appearance.showTaglines} disabled={pending} onCheckedChange={(v) => save({ showTaglines: v })} />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-6 py-3">
            <div className="grid gap-0.5">
              <Label htmlFor="cfg-inicial">Tela que abre depois de entrar</Label>
              <p className="text-sm text-muted-foreground">Para onde o INtellect leva você logo depois do login.</p>
            </div>
            <Select value={appearance.homePage} onValueChange={(v) => save({ homePage: v as Appearance["homePage"] })}>
              <SelectTrigger id="cfg-inicial" className="w-52" disabled={pending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inicio">Início</SelectItem>
                <SelectItem value="meus-cards">Meus cards</SelectItem>
                <SelectItem value="resumo">Resumo de vendas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
