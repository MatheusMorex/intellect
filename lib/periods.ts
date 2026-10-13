// Atalhos de período (components.md, "Seletor de período"). Usado no servidor,
// para calcular as datas, e no navegador, para mostrar as opções.

export const PERIOD_PRESETS = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "mes-passado", label: "Mês passado" },
  { id: "maximo", label: "Máximo" },
] as const;

export type PresetId = (typeof PERIOD_PRESETS)[number]["id"];
export type PeriodId = PresetId | "personalizado";

/** Relatórios por dia ou hora (S28) também têm "Esta semana" e "Semana passada". */
export const WEEK_PRESETS = [
  { id: "semana", label: "Esta semana" },
  { id: "semana-passada", label: "Semana passada" },
] as const;

export const DEFAULT_PERIOD: PeriodId = "7d";

export function isPeriodId(value: string | null | undefined): value is PeriodId {
  return value === "personalizado" || PERIOD_PRESETS.some((p) => p.id === value);
}

export function periodLabel(id: PeriodId) {
  if (id === "personalizado") return "Personalizado";
  return PERIOD_PRESETS.find((p) => p.id === id)?.label ?? id;
}

export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
