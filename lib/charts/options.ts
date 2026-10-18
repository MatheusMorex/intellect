// Opções dos Painéis que o navegador (seletores) e o servidor (cálculo) dividem.
// Os textos de cada opção ficam em lib/charts/messages.ts.

/** Como os dados se agrupam no eixo do tempo, da mais fina para a mais grossa. */
export const GRANULARITIES = ["hour", "day", "week", "fortnight", "month", "year"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

/** Até quantos dias de período cada granularidade aceita (para não desenhar milhares de pontos). null = sem limite. */
export const GRANULARITY_MAX_DAYS: Record<Granularity, number | null> = {
  hour: 31,
  day: 732, // 2 anos, contando um 29 de fevereiro
  week: 1830, // 5 anos, ~260 semanas
  fortnight: 3660, // 10 anos, 240 quinzenas
  month: null,
  year: null,
};

/** Semana de segunda a domingo (ISO 8601, o padrão) ou de domingo a sábado. */
export type WeekStart = "monday" | "sunday";
export const DEFAULT_WEEK_START: WeekStart = "monday";

/** Atalhos de período dos Painéis, na ordem em que aparecem no seletor. */
export const PANEL_PRESETS = [
  "hoje",
  "ontem",
  "7d",
  "14d",
  "30d",
  "quinzena",
  "mes",
  "mes-passado",
  "trimestre",
  "ano",
  "ano-passado",
  "maximo",
] as const;
export type PanelPresetId = (typeof PANEL_PRESETS)[number];
export type PanelPeriodId = PanelPresetId | "personalizado";
export const DEFAULT_PANEL_PERIOD: PanelPeriodId = "30d";

export function isPanelPeriodId(value: string | null | undefined): value is PanelPeriodId {
  return value === "personalizado" || (PANEL_PRESETS as readonly string[]).includes(value ?? "");
}

/** Comparação: desligada, com o período anterior equivalente, com o mesmo período do ano anterior ou com datas escolhidas. */
export const COMPARE_MODES = ["off", "previous", "year", "custom"] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

/** Número completo (R$ 1.234,56) ou abreviado (R$ 1,2 mil). */
export type NumberStyle = "full" | "compact";

// ---- endereço da página (?agrupar=dia&comparar=anterior) --------------------------------------
// As escolhas da tela ficam no endereço, em português: um link abre a mesma visão.

export const GRANULARITY_PARAM: Record<Granularity, string> = {
  hour: "hora",
  day: "dia",
  week: "semana",
  fortnight: "quinzena",
  month: "mes",
  year: "ano",
};

export const COMPARE_PARAM: Record<CompareMode, string> = {
  off: "nao",
  previous: "anterior",
  year: "ano",
  custom: "datas",
};

/** Sem nada no endereço, os Painéis comparam com o período anterior (como o Resumo). */
export const DEFAULT_COMPARE: CompareMode = "previous";

function fromParam<T extends string>(map: Record<T, string>, value: string | null | undefined): T | null {
  if (!value) return null;
  const found = (Object.keys(map) as T[]).find((k) => map[k] === value);
  return found ?? null;
}

export const granularityFromParam = (value: string | null | undefined) => fromParam(GRANULARITY_PARAM, value);
export const compareFromParam = (value: string | null | undefined) => fromParam(COMPARE_PARAM, value);
