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

export type PeriodId = (typeof PERIOD_PRESETS)[number]["id"];

export const DEFAULT_PERIOD: PeriodId = "7d";

export function isPeriodId(value: string | null | undefined): value is PeriodId {
  return PERIOD_PRESETS.some((p) => p.id === value);
}

export function periodLabel(id: PeriodId) {
  return PERIOD_PRESETS.find((p) => p.id === id)?.label ?? id;
}
