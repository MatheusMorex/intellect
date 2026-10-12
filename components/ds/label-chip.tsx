import { cn } from "@/lib/utils";

// Chip de etiqueta (components.md, "Chip de etiqueta").
// No banco (labels.color): green_light = sutil, green = normal, green_dark = forte.

export const LABEL_HUES = ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black"] as const;
export type LabelHue = (typeof LABEL_HUES)[number];
export type LabelTone = "subtle" | "normal" | "bold";

export const LABEL_HUE_NAME: Record<LabelHue, string> = {
  green: "verde",
  yellow: "amarelo",
  orange: "laranja",
  red: "vermelho",
  purple: "roxo",
  blue: "azul",
  sky: "céu",
  lime: "lima",
  pink: "rosa",
  black: "cinza",
};

export function parseLabelColor(color: string): { hue: LabelHue; tone: LabelTone } | null {
  const match = /^([a-z]+)(_light|_dark)?$/.exec(color);
  if (!match || !(LABEL_HUES as readonly string[]).includes(match[1])) return null;
  const tone: LabelTone = match[2] === "_light" ? "subtle" : match[2] === "_dark" ? "bold" : "normal";
  return { hue: match[1] as LabelHue, tone };
}

function toneSuffix(tone: LabelTone) {
  return tone === "subtle" ? "-subtle" : tone === "bold" ? "-bold" : "";
}

function labelStyle(hue: LabelHue, tone: LabelTone) {
  return {
    background: `var(--ds-label-${hue}${toneSuffix(tone)})`,
    color: `var(--ds-label-text${toneSuffix(tone)})`,
  };
}

// Padrão do modo para daltônicos: aparece só com data-colorblind="on" no <html>.
function Pattern({ hue, tone, className }: { hue: LabelHue; tone: LabelTone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("hidden colorblind:block", className)}
      style={{
        background: `var(--ds-pattern-${hue}), var(--ds-label-${hue}${toneSuffix(tone)})`,
        color: tone === "bold" ? "var(--ds-pattern-ink-on-bold)" : "var(--ds-pattern-ink)",
      }}
    />
  );
}

export function LabelChip({
  color,
  name = "",
  compact = false,
  className,
}: {
  color: string;
  name?: string;
  compact?: boolean;
  className?: string;
}) {
  const parsed = parseLabelColor(color);
  if (!parsed) return null;
  const { hue, tone } = parsed;
  const spoken = name || `Etiqueta ${LABEL_HUE_NAME[hue]}`;

  if (compact) {
    return (
      <span
        role="img"
        aria-label={spoken}
        title={name || undefined}
        className={cn("relative inline-block h-2 w-10 overflow-hidden rounded-full", className)}
        style={labelStyle(hue, tone)}
      >
        <Pattern hue={hue} tone={tone} className="absolute inset-0" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full min-w-10 items-center gap-1.5 rounded-sm px-2 text-xs font-medium",
        className,
      )}
      style={labelStyle(hue, tone)}
      aria-label={name ? undefined : spoken}
    >
      <Pattern hue={hue} tone={tone} className="size-2.5 shrink-0 rounded-[2px]" />
      {name && <span className="truncate">{name}</span>}
    </span>
  );
}
