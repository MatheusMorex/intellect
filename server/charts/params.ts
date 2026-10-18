// Endereço da página dos Painéis (?periodo=30d&agrupar=dia&comparar=anterior&conta=...).
// Tudo o que vem do navegador é conferido aqui: valor desconhecido vira o
// padrão; granularidade que não cabe no período vira a sugerida, com o aviso;
// datas inválidas na comparação deixam a comparação de fora, com uma mensagem.

import { msg } from "@/lib/charts/messages";
import { compareFromParam, DEFAULT_COMPARE, GRANULARITIES, granularityFromParam, type CompareMode, type Granularity } from "@/lib/charts/options";
import { comparisonRange, resolvePanelPeriod, type PanelPeriod } from "@/server/charts/periods";
import { autoGranularity, checkGranularity } from "@/server/charts/time-buckets";
import { parseFilters, type SearchParams, type TrackingFilters } from "@/server/data/tracking";
import type { DateRange } from "@/server/period";
import type { DateKey } from "@/server/store/types";

export type PanelQuery = {
  period: PanelPeriod;
  /** Granularidade em uso: a escolhida, a sugerida no lugar dela ou a automática. */
  granularity: Granularity;
  /** A pessoa escolheu no seletor (false: automática pelo tamanho do período). */
  granularityChosen: boolean;
  /** Aviso quando a escolhida não cabia no período. */
  granularityMessage: string | null;
  /** A que o "Automático" usaria neste período. */
  autoGranularity: Granularity;
  /** As que cabem no período (e no da comparação): o seletor desabilita as outras. */
  allowedGranularities: Granularity[];
  compareMode: CompareMode;
  /** null: sem comparação (desligada, sem período anterior ou datas inválidas). */
  compareRange: DateRange | null;
  compareMessage: string | null;
  /** Datas escolhidas para a comparação, como vieram (para o calendário). */
  compareCustom: { de: string | null; ate: string | null };
  filters: TrackingFilters;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parsePanelQuery(sp: SearchParams, timezone: string, earliest: DateKey | null, now = new Date()): PanelQuery {
  const period = resolvePanelPeriod(one(sp.periodo), timezone, earliest, now, { de: one(sp.de), ate: one(sp.ate) });

  const compareMode = compareFromParam(one(sp.comparar)) ?? DEFAULT_COMPARE;
  const compareCustom = { de: one(sp.cde) ?? null, ate: one(sp.cate) ?? null };
  const compareRange = comparisonRange(period, compareMode, compareCustom);
  let compareMessage: string | null = null;
  if (compareMode === "custom" && !compareRange) compareMessage = msg.panel.compareDatesMissing;
  if (compareMode === "previous" && !compareRange) compareMessage = msg.panel.compareUnavailable;

  // O período de comparação é desenhado nos mesmos baldes: ele também precisa caber.
  const ranges = compareRange ? [period.range, compareRange] : [period.range];
  const allowedGranularities = GRANULARITIES.filter((g) => ranges.every((r) => checkGranularity(r, g).ok));
  const auto = autoGranularity(period.range);
  const requested = granularityFromParam(one(sp.agrupar));
  let granularity = requested ?? auto;
  let granularityMessage: string | null = null;
  for (const range of ranges) {
    const check = checkGranularity(range, granularity);
    if (check.ok) continue;
    granularity = check.granularity;
    if (requested) granularityMessage = check.message;
  }

  return {
    period,
    granularity,
    granularityChosen: requested != null,
    granularityMessage,
    autoGranularity: allowedGranularities.includes(auto) ? auto : (allowedGranularities[0] ?? "year"),
    allowedGranularities,
    compareMode,
    compareRange,
    compareMessage,
    compareCustom,
    filters: parseFilters(sp),
  };
}
