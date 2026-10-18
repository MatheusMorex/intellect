// Catálogo central das métricas dos Painéis. Cada métrica diz o que é, como se
// calcula, se pode ser somada entre períodos e se subir é bom ou ruim.
//
// A conta é sempre feita a partir de "peças" que se somam (centavos e
// contagens). Taxas como ROAS, CPA e margem nunca são somadas nem tiradas pela
// média: são refeitas com as peças já somadas do período (server/charts/compute.ts).
// As fórmulas seguem server/metrics/formulas.ts, para o número ser o mesmo do Resumo.

import { msg } from "@/lib/charts/messages";
import { METRIC, type MetricInfo } from "@/lib/metrics-glossary";

/** Peças que se somam entre períodos. Dinheiro em centavos, já na moeda do dashboard. */
export const COMPONENTS = [
  "grossCents", // faturamento bruto (pagos − reembolsos parciais − juros, se não contabilizados)
  "netCents", // faturamento líquido (bruto − taxa da plataforma de pagamento)
  "baseCents", // faturamento na base escolhida no dashboard (líquido ou bruto): a do ROAS e da margem
  "refundedCents", // valor reembolsado
  "spendCents", // gasto com anúncios (Meta + Google)
  "spendMetaCents",
  "spendGoogleCents",
  "taxesCents", // impostos sobre vendas, extras e sobre o gasto do Meta
  "productCostCents",
  "feesCents", // taxas adicionais
  "expensesCents", // despesas lançadas
  "ordersCount", // pedidos gerados (qualquer situação)
  "paidCount",
  "pendingCount",
  "refundedCount",
  "chargebackCount",
  "impressions",
  "clicks",
  "addToCarts",
] as const;
export type ComponentId = (typeof COMPONENTS)[number];

/**
 * De onde vem cada peça. Decide por quais dimensões a métrica pode ser aberta:
 * o gasto não se divide por produto nem por UTM, só por campanha, conta e plataforma.
 * - orders: pedidos da loja; ads: plataformas de anúncio; mixed: pedidos + anúncios (impostos);
 * - costs: despesas lançadas, que não se dividem por nada (ficam zeradas ao abrir por dimensão).
 */
export type ComponentOrigin = "orders" | "ads" | "mixed" | "costs";
export const COMPONENT_ORIGIN: Record<ComponentId, ComponentOrigin> = {
  grossCents: "orders",
  netCents: "orders",
  baseCents: "orders",
  refundedCents: "orders",
  spendCents: "ads",
  spendMetaCents: "ads",
  spendGoogleCents: "ads",
  taxesCents: "mixed",
  productCostCents: "orders",
  feesCents: "orders",
  expensesCents: "costs",
  ordersCount: "orders",
  paidCount: "orders",
  pendingCount: "orders",
  refundedCount: "orders",
  chargebackCount: "orders",
  impressions: "ads",
  clicks: "ads",
  addToCarts: "ads",
};

/** Somável (soma entre períodos) ou taxa (refeita a partir dos totais). */
export type MetricKind = "sum" | "rate";
/** moeda (centavos), número, percentual (fração: 0,125 = 12,5%) ou multiplicador (3,2x). */
export type MetricFormat = "money" | "number" | "percent" | "multiplier";
/** Se subir é bom (verde), ruim (vermelho) ou nem um nem outro (cinza, como o gasto). */
export type MetricDirection = "up" | "down" | "neutral";

/** Combinação de peças: soma as de `plus` e tira as de `minus`. */
export type Linear = { plus: readonly ComponentId[]; minus?: readonly ComponentId[] };

type Common = {
  /** Nome usado nas fórmulas personalizadas (sem acento e sem espaço). */
  slug: string;
  info: MetricInfo;
  format: MetricFormat;
  direction: MetricDirection;
};
type SumSpec = Common & { kind: "sum"; value: Linear };
type RateSpec = Common & {
  kind: "rate";
  numerator: Linear;
  denominator: Linear;
  /** Multiplica o resultado (o CPM é por mil impressões). */
  scale?: number;
};
type MetricSpec = SumSpec | RateSpec;

const PROFIT: Linear = {
  plus: ["netCents"],
  minus: ["spendCents", "taxesCents", "productCostCents", "feesCents", "expensesCents"],
};
const SETTLED: Linear = { plus: ["paidCount", "refundedCount", "chargebackCount"] };
const one = (id: ComponentId): Linear => ({ plus: [id] });

const SPECS = {
  // ---- resultado ----
  gross: { slug: "faturamento_bruto", info: METRIC.gross, kind: "sum", value: one("grossCents"), format: "money", direction: "up" },
  net: { slug: "faturamento_liquido", info: METRIC.net, kind: "sum", value: one("netCents"), format: "money", direction: "up" },
  profit: { slug: "lucro", info: METRIC.profit, kind: "sum", value: PROFIT, format: "money", direction: "up" },
  margin: {
    slug: "margem",
    info: METRIC.margin,
    kind: "rate",
    numerator: PROFIT,
    denominator: one("baseCents"),
    format: "percent",
    direction: "up",
  },
  // ---- vendas ----
  paid: { slug: "vendas_pagas", info: METRIC.paid, kind: "sum", value: one("paidCount"), format: "number", direction: "up" },
  orders: {
    slug: "pedidos_gerados",
    info: msg.metrics.ordersCount,
    kind: "sum",
    value: one("ordersCount"),
    format: "number",
    direction: "up",
  },
  ticket: {
    slug: "ticket_medio",
    info: METRIC.ticket,
    kind: "rate",
    numerator: one("grossCents"),
    denominator: one("paidCount"),
    format: "money",
    direction: "up",
  },
  clickConversion: {
    slug: "conversao_por_clique",
    info: msg.metrics.clickConversion,
    kind: "rate",
    numerator: one("paidCount"),
    denominator: one("clicks"),
    format: "percent",
    direction: "up",
  },
  pending: { slug: "vendas_pendentes", info: METRIC.pending, kind: "sum", value: one("pendingCount"), format: "number", direction: "neutral" },
  // ---- anúncios ----
  spend: { slug: "gasto_anuncios", info: METRIC.spend, kind: "sum", value: one("spendCents"), format: "money", direction: "neutral" },
  spendMeta: { slug: "gasto_meta", info: METRIC.spendMeta, kind: "sum", value: one("spendMetaCents"), format: "money", direction: "neutral" },
  spendGoogle: {
    slug: "gasto_google",
    info: METRIC.spendGoogle,
    kind: "sum",
    value: one("spendGoogleCents"),
    format: "money",
    direction: "neutral",
  },
  roas: {
    slug: "roas",
    info: METRIC.roas,
    kind: "rate",
    numerator: one("baseCents"),
    denominator: one("spendCents"),
    format: "multiplier",
    direction: "up",
  },
  roi: {
    slug: "roi",
    info: METRIC.roi,
    kind: "rate",
    numerator: PROFIT,
    denominator: one("spendCents"),
    format: "percent",
    direction: "up",
  },
  cpa: {
    slug: "cpa",
    info: METRIC.cpa,
    kind: "rate",
    numerator: one("spendCents"),
    denominator: one("paidCount"),
    format: "money",
    direction: "down",
  },
  cpc: {
    slug: "cpc",
    info: METRIC.cpc,
    kind: "rate",
    numerator: one("spendCents"),
    denominator: one("clicks"),
    format: "money",
    direction: "down",
  },
  cpm: {
    slug: "cpm",
    info: METRIC.cpm,
    kind: "rate",
    numerator: one("spendCents"),
    denominator: one("impressions"),
    scale: 1000,
    format: "money",
    direction: "down",
  },
  ctr: {
    slug: "ctr",
    info: METRIC.ctr,
    kind: "rate",
    numerator: one("clicks"),
    denominator: one("impressions"),
    format: "percent",
    direction: "up",
  },
  impressions: { slug: "impressoes", info: METRIC.impressions, kind: "sum", value: one("impressions"), format: "number", direction: "up" },
  clicks: { slug: "cliques", info: METRIC.clicks, kind: "sum", value: one("clicks"), format: "number", direction: "up" },
  addToCarts: {
    slug: "adicoes_carrinho",
    info: msg.metrics.addToCarts,
    kind: "sum",
    value: one("addToCarts"),
    format: "number",
    direction: "up",
  },
  // ---- reembolsos ----
  refundedValue: {
    slug: "valor_reembolsado",
    info: msg.metrics.refundedValue,
    kind: "sum",
    value: one("refundedCents"),
    format: "money",
    direction: "down",
  },
  refunded: { slug: "vendas_reembolsadas", info: METRIC.refunded, kind: "sum", value: one("refundedCount"), format: "number", direction: "down" },
  chargebacks: {
    slug: "chargebacks",
    info: msg.metrics.chargebackCount,
    kind: "sum",
    value: one("chargebackCount"),
    format: "number",
    direction: "down",
  },
  refundRate: {
    slug: "pct_reembolso",
    info: METRIC.refundRate,
    kind: "rate",
    numerator: one("refundedCount"),
    denominator: SETTLED,
    format: "percent",
    direction: "down",
  },
  chargebackRate: {
    slug: "pct_chargeback",
    info: METRIC.chargebackRate,
    kind: "rate",
    numerator: one("chargebackCount"),
    denominator: SETTLED,
    format: "percent",
    direction: "down",
  },
  // ---- custos ----
  taxes: { slug: "imposto_total", info: METRIC.taxes, kind: "sum", value: one("taxesCents"), format: "money", direction: "down" },
  productCost: {
    slug: "custos_produto",
    info: METRIC.productCost,
    kind: "sum",
    value: one("productCostCents"),
    format: "money",
    direction: "down",
  },
  fees: { slug: "taxas_adicionais", info: METRIC.fees, kind: "sum", value: one("feesCents"), format: "money", direction: "down" },
  expenses: { slug: "despesas", info: METRIC.expenses, kind: "sum", value: one("expensesCents"), format: "money", direction: "down" },
} as const satisfies Record<string, MetricSpec>;

export type MetricId = keyof typeof SPECS;
export type MetricDef = MetricSpec & { id: MetricId };

export const METRICS: readonly MetricDef[] = (Object.keys(SPECS) as MetricId[]).map((id) => ({ ...SPECS[id], id }));

const BY_ID = new Map<string, MetricDef>(METRICS.map((m) => [m.id, m]));
const BY_SLUG = new Map<string, MetricDef>(METRICS.map((m) => [m.slug, m]));

export function isMetricId(value: string): value is MetricId {
  return BY_ID.has(value);
}

export function getMetric(id: MetricId): MetricDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Métrica desconhecida: ${id}`);
  return def;
}

export function metricBySlug(slug: string): MetricDef | null {
  return BY_SLUG.get(slug) ?? null;
}

const linearParts = (l: Linear) => [...l.plus, ...(l.minus ?? [])];

/** Peças que a métrica usa (para saber se há dado delas no período e na granularidade). */
export function metricComponents(def: MetricDef): ComponentId[] {
  const parts = def.kind === "sum" ? linearParts(def.value) : [...linearParts(def.numerator), ...linearParts(def.denominator)];
  return [...new Set(parts)];
}

// ---- dimensões ---------------------------------------------------------------------------------

/** Por onde uma métrica pode ser aberta (além do tempo). País não existe nos pedidos ainda. */
export const DIMENSIONS = [
  "platform",
  "adAccount",
  "campaign",
  "product",
  "paymentMethod",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const ADS_AND_ORDERS: readonly ComponentOrigin[] = ["orders", "ads", "mixed", "costs"];
const ORDERS_ONLY: readonly ComponentOrigin[] = ["orders", "costs"];

const DIMENSION_ORIGINS: Record<Dimension, readonly ComponentOrigin[]> = {
  platform: ADS_AND_ORDERS,
  adAccount: ADS_AND_ORDERS,
  campaign: ADS_AND_ORDERS,
  product: ORDERS_ONLY,
  paymentMethod: ORDERS_ONLY,
  utmSource: ORDERS_ONLY,
  utmMedium: ORDERS_ONLY,
  utmCampaign: ORDERS_ONLY,
  utmContent: ORDERS_ONLY,
};

/**
 * Dimensões que só aceitam algumas métricas. Por produto, o pedido se divide
 * pelos itens: dá para saber quanto cada produto vendeu (a soma dos itens pagos,
 * como "Vendas por produto" do Resumo) e em quantos pedidos ele entrou, mas não
 * dá para dividir a taxa da plataforma, os juros, o frete nem os reembolsos.
 */
const DIMENSION_METRICS: Partial<Record<Dimension, readonly MetricId[]>> = {
  product: ["gross", "paid", "orders"],
};

/**
 * A métrica pode ser aberta por esta dimensão? O ROAS por produto, por exemplo,
 * não pode: o gasto com anúncios não é dividido por produto. As despesas
 * ("costs") ficam zeradas nas linhas de cada dimensão, porque não se dividem.
 */
export function metricSupportsDimension(def: MetricDef, dimension: Dimension): boolean {
  const only = DIMENSION_METRICS[dimension];
  if (only && !only.includes(def.id)) return false;
  const allowed = DIMENSION_ORIGINS[dimension];
  return metricComponents(def).every((c) => allowed.includes(COMPONENT_ORIGIN[c]));
}
