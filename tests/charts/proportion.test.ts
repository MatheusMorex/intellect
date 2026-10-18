// Fase 3: pizza, rosca e treemap. Sobre os dados simulados (createSeed): as
// fatias e os retângulos somam o total, "Outros" refaz as taxas, a cor do
// treemap é a taxa refeita das peças somadas, e as combinações sem sentido
// (taxa em pizza, lucro negativo, gasto por UTM) são recusadas.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { colorScale, mixColors, parseColor, scalePosition } from "../../components/charts/color-scale.ts";
import { pieTooltipHtml, toEChartsOption, treemapColors, treemapTooltipHtml } from "../../components/charts/echarts-option.ts";
import type { ChartTheme } from "../../components/charts/use-chart-theme.ts";
import { msg } from "../../lib/charts/messages.ts";
import type { PieSpec, TreemapNode, TreemapSpec } from "../../lib/charts/spec.ts";
import { DEFAULT_PANEL, PANEL_WIDGET, widgetMetrics, widgetTitle, type PanelWidgetInput, type PieWidget, type TreemapWidget } from "../../lib/charts/widgets.ts";
import { buildPieChart, buildTreemap, panelComputer } from "../../server/charts/build.ts";
import { metricValue, OTHERS_KEY, sumComponents } from "../../server/charts/compute.ts";
import { parsePanelQuery } from "../../server/charts/params.ts";
import { componentsByPath, NONE_KEY, panelSource } from "../../server/charts/source.ts";
import { earliestDay } from "../../server/data/tracking.ts";
import { createSeed } from "../../server/store/seed.ts";

// Sábado, 17 de outubro de 2026, 12h em Brasília.
const NOW = new Date("2026-10-17T15:00:00Z");
const store = createSeed(NOW);
const dashboard = store.dashboards[0];

function computer(sp: Record<string, string> = {}) {
  const query = parsePanelQuery(sp, dashboard.timezone, earliestDay(store, dashboard), NOW);
  return panelComputer(panelSource(store, dashboard, query.filters), query, NOW);
}
const widget = <T,>(input: PanelWidgetInput) => PANEL_WIDGET.parse(input) as T;
const errors = (input: PanelWidgetInput) => {
  const result = PANEL_WIDGET.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const flatten = (nodes: TreemapNode[]): TreemapNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);

const THEME: ChartTheme = {
  palette: ["#4b3bd0", "#c25a12", "#1e8a56", "#1d7489", "#b03f86", "#856700", "#2a64c9", "#6e6b80"],
  text: "#000000",
  muted: "#777777",
  border: "#cccccc",
  surface: "#ffffff",
  good: "#00aa00",
  bad: "#aa0000",
  font: "Inter",
  colorblind: false,
};

describe("configuração de pizza, rosca e treemap", () => {
  test("padrões: 6 fatias, rótulo com valor e percentual; treemap com 12 por nível", () => {
    const pie = widget<PieWidget>({ id: "p", type: "pie", dimension: "platform", metric: "net" });
    assert.equal(pie.slices, 6);
    assert.equal(pie.labels, "both");
    const tree = widget<TreemapWidget>({ id: "t", type: "treemap", levels: ["platform"], size: "spend" });
    assert.equal(tree.topN, 12);
    assert.equal(tree.color, null);
  });

  test("taxa em pizza, rosca ou no tamanho do treemap é recusada", () => {
    assert.deepEqual(errors({ id: "p", type: "pie", dimension: "platform", metric: "roas" }), [msg.widgetError.proportionRate]);
    assert.deepEqual(errors({ id: "p", type: "donut", dimension: "campaign", metric: "cpa" }), [msg.widgetError.proportionRate]);
    assert.deepEqual(errors({ id: "t", type: "treemap", levels: ["platform"], size: "ctr" }), [msg.widgetError.proportionRate]);
    // A taxa pode ser a cor do treemap.
    assert.deepEqual(errors({ id: "t", type: "treemap", levels: ["platform", "campaign"], size: "spend", color: "roas" }), []);
  });

  test("lucro (que pode ficar negativo) não vira fatia nem retângulo", () => {
    const message = msg.widgetError.proportionNegative("Lucro");
    assert.deepEqual(errors({ id: "p", type: "pie", dimension: "campaign", metric: "profit" }), [message]);
    assert.deepEqual(errors({ id: "t", type: "treemap", levels: ["campaign"], size: "profit" }), [message]);
  });

  test("dimensão que não tem a métrica: gasto por produto ou por UTM", () => {
    assert.equal(errors({ id: "p", type: "pie", dimension: "product", metric: "spend" }).length, 1);
    assert.equal(errors({ id: "t", type: "treemap", levels: ["platform", "utmSource"], size: "spend" }).length, 1);
    // A cor também precisa existir em todos os níveis.
    assert.equal(errors({ id: "t", type: "treemap", levels: ["utmSource"], size: "gross", color: "roas" }).length, 1);
  });

  test("limites: fatias de 2 a 8, até 3 níveis, sem repetir, produto sozinho", () => {
    assert.deepEqual(errors({ id: "p", type: "pie", dimension: "platform", metric: "net", slices: 1 }), [msg.widgetError.slices]);
    assert.deepEqual(errors({ id: "p", type: "pie", dimension: "platform", metric: "net", slices: 9 }), [msg.widgetError.slices]);
    assert.deepEqual(errors({ id: "t", type: "treemap", levels: ["platform", "campaign", "adSet", "ad"], size: "spend" }), [msg.widgetError.levelsMax]);
    assert.deepEqual(errors({ id: "t", type: "treemap", levels: [], size: "spend" }), [msg.widgetError.levelsMin]);
    assert.deepEqual(errors({ id: "t", type: "treemap", levels: ["campaign", "campaign"], size: "spend" }), [msg.widgetError.levelsRepeated]);
    assert.deepEqual(errors({ id: "t", type: "treemap", levels: ["product", "campaign"], size: "gross" }), [msg.widgetError.treemapProduct]);
    assert.deepEqual(errors({ id: "t", type: "treemap", levels: ["product"], size: "gross" }), []);
    assert.deepEqual(errors({ id: "t", type: "treemap", levels: ["platform"], size: "spend", color: "spend" }), [msg.widgetError.repeated]);
  });

  test("título automático e métricas usadas", () => {
    const pie = widget<PieWidget>({ id: "p", type: "donut", dimension: "paymentMethod", metric: "paid" });
    assert.equal(widgetTitle(pie), "Vendas pagas por forma de pagamento");
    const tree = widget<TreemapWidget>({ id: "t", type: "treemap", levels: ["platform", "campaign", "ad"], size: "spend", color: "roas" });
    assert.equal(widgetTitle(tree), "Gasto com anúncios por plataforma, campanha e anúncio");
    assert.deepEqual(widgetMetrics(tree), ["spend", "roas"]);
  });

  test("o painel padrão tem uma rosca, uma pizza e um treemap", () => {
    assert.deepEqual(
      DEFAULT_PANEL.filter((w) => ["pie", "donut", "treemap"].includes(w.type)).map((w) => w.type),
      ["donut", "pie", "treemap"],
    );
  });
});

describe("conjunto e anúncio como dimensões", () => {
  test("o gasto por conjunto e por anúncio soma o gasto total", () => {
    const pc = computer({ periodo: "30d" });
    const spend = metricValue("spend", pc.totals());
    assert.ok(spend && spend > 0);
    for (const d of ["adSet", "ad"] as const) {
      assert.equal(metricValue("spend", sumComponents(pc.dimension(d).map((r) => r.components))), spend, d);
    }
    // O Performance Max gasta por campanha: fica em "Sem anúncio".
    assert.ok(pc.dimension("ad").some((r) => r.key === NONE_KEY && r.label === msg.withoutValue.ad && (r.components.spendCents ?? 0) > 0));
  });

  test("linhas com caminho: as mesmas peças das linhas de um nível só, e o imposto do Meta sem perder centavo", () => {
    const pc = computer({ periodo: "30d" });
    const leaves = componentsByPath(pc.source, pc.query.period.range, ["platform", "campaign", "ad"]);
    const total = sumComponents(leaves.map((r) => r.components));
    const totals = pc.totals();
    for (const c of ["grossCents", "netCents", "spendCents", "taxesCents", "paidCount", "clicks"] as const) {
      // Despesas ficam fora das linhas (não se dividem); o resto fecha com o total do período.
      assert.equal(total[c], totals[c], c);
    }
    // Dois anúncios com o mesmo nome na mesma campanha (um em cada conjunto) não aparecem iguais.
    const byCampaign = new Map<string, string[]>();
    for (const r of leaves) {
      const parent = `${r.path[0].key} › ${r.path[1].key}`;
      byCampaign.set(parent, [...(byCampaign.get(parent) ?? []), r.path[2].label]);
    }
    for (const [campaign, labels] of byCampaign) assert.equal(new Set(labels).size, labels.length, campaign);
    assert.ok(leaves.some((r) => /^Vídeo depoimento v2 \(.+\)$/.test(r.path[2].label)), "o exemplo tem o caso do nome repetido");
    const meta = pc.dimension("platform").find((r) => r.key === "meta")!;
    const metaLeaves = sumComponents(leaves.filter((r) => r.path[0].key === "meta").map((r) => r.components));
    assert.deepEqual(metaLeaves, meta.components);
  });
});

describe("pizza e rosca", () => {
  test("a soma das fatias é o total, e as fatias somam 100%", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildPieChart(pc, widget<PieWidget>({ id: "p", type: "donut", dimension: "platform", metric: "net" }));
    assert.equal(spec.kind, "pie");
    assert.equal(spec.donut, true);
    assert.equal(spec.total, metricValue("net", pc.totals()));
    assert.equal(
      spec.slices.reduce((a, s) => a + s.value, 0),
      spec.total,
    );
    assert.ok(near(spec.slices.reduce((a, s) => a + s.share, 0), 1));
    // Maior para o menor; cada fatia uma cor.
    assert.ok(spec.slices.every((s, i) => i === 0 || spec.slices[i - 1].value >= s.value));
    assert.deepEqual(
      spec.slices.map((s) => s.color),
      spec.slices.map((_, i) => i),
    );
  });

  test("com mais itens que fatias: as maiores e 'Outros' (cinza), contando 'Outros' no limite", () => {
    const pc = computer({ periodo: "30d" });
    const all = pc.dimension("campaign").filter((r) => (metricValue("net", r.components) ?? 0) > 0);
    assert.ok(all.length > 4, "o exemplo tem mais de 4 campanhas com venda");
    const spec = buildPieChart(pc, widget<PieWidget>({ id: "p", type: "pie", dimension: "campaign", metric: "net", slices: 4 }));
    assert.equal(spec.slices.length, 4);
    const others = spec.slices[3];
    assert.equal(others.key, OTHERS_KEY);
    assert.equal(others.label, "Outros");
    assert.equal(others.color, null);
    const shown = new Set(spec.slices.slice(0, 3).map((s) => s.key));
    assert.equal(others.value, metricValue("net", sumComponents(all.filter((r) => !shown.has(r.key)).map((r) => r.components))));
    assert.equal(spec.total, metricValue("net", pc.totals()));
  });

  test("comparação por fatia e do total", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildPieChart(pc, widget<PieWidget>({ id: "p", type: "pie", dimension: "paymentMethod", metric: "paid" }));
    const before = pc.compareDimension("paymentMethod")!;
    const first = spec.slices[0];
    assert.equal(first.compare?.value, metricValue("paid", before.find((r) => r.key === first.key)!.components));
    assert.equal(spec.compareTotal?.value, metricValue("paid", pc.compareTotals()!));
    assert.equal(spec.total, metricValue("paid", pc.totals()));
    const off = buildPieChart(computer({ periodo: "30d", comparar: "nao" }), widget<PieWidget>({ id: "p", type: "pie", dimension: "paymentMethod", metric: "paid" }));
    assert.equal(off.compareTotal, null);
    assert.ok(off.slices.every((s) => s.compare === null));
  });

  test("período sem vendas: vazio", () => {
    const spec = buildPieChart(
      computer({ periodo: "personalizado", de: "2001-01-01", ate: "2001-01-31" }),
      widget<PieWidget>({ id: "p", type: "pie", dimension: "platform", metric: "net" }),
    );
    assert.equal(spec.empty, true);
    assert.equal(spec.slices.length, 0);
  });
});

describe("treemap", () => {
  const TREE: PanelWidgetInput = { id: "t", type: "treemap", levels: ["platform", "campaign", "ad"], size: "spend", color: "roas" };

  test("cada nível soma o de cima, e o primeiro nível soma o total", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildTreemap(pc, widget<TreemapWidget>(TREE));
    assert.equal(spec.kind, "treemap");
    assert.deepEqual(spec.levels, ["Plataforma", "Campanha", "Anúncio"]);
    assert.equal(spec.total, metricValue("spend", pc.totals()));
    assert.equal(
      spec.nodes.reduce((a, n) => a + n.size, 0),
      spec.total,
    );
    for (const node of flatten(spec.nodes)) {
      if (node.children.length) {
        assert.equal(
          node.children.reduce((a, c) => a + c.size, 0),
          node.size,
          node.path.join(" › "),
        );
      }
      assert.ok(node.size > 0, "retângulo sem tamanho não entra");
      assert.ok(near(node.share, node.size / spec.total));
    }
    const keys = flatten(spec.nodes).map((n) => n.key);
    assert.equal(new Set(keys).size, keys.length, "chaves únicas no gráfico inteiro");
    // Três níveis de verdade: plataforma → campanha → anúncio.
    assert.ok(flatten(spec.nodes).some((n) => n.path.length === 3));
  });

  test("a cor é o ROAS refeito das peças somadas (não a média dos ROAS de dentro)", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildTreemap(pc, widget<TreemapWidget>(TREE));
    for (const platform of pc.dimension("platform").filter((r) => (r.components.spendCents ?? 0) > 0)) {
      const node = spec.nodes.find((n) => n.key === platform.key)!;
      assert.equal(node.size, metricValue("spend", platform.components));
      assert.equal(node.color, metricValue("roas", platform.components));
    }
    const colors = flatten(spec.nodes)
      .map((n) => n.color)
      .filter((c): c is number => c != null);
    assert.equal(spec.color?.min, Math.min(...colors));
    assert.equal(spec.color?.max, Math.max(...colors));
    // O meio da escala: o ROAS de tudo o que aparece (as plataformas com gasto), refeito das peças.
    const withSpend = pc.dimension("platform").filter((r) => (r.components.spendCents ?? 0) > 0);
    assert.equal(spec.color?.mid, metricValue("roas", sumComponents(withSpend.map((r) => r.components))));
    assert.ok(spec.color!.mid > spec.color!.min && spec.color!.mid < spec.color!.max);
  });

  test("Top N por nível: o resto vira 'Outros', e a soma continua fechando", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildTreemap(pc, widget<TreemapWidget>({ ...TREE, topN: 2 }));
    const parents = [{ size: spec.total, children: spec.nodes }, ...flatten(spec.nodes)];
    assert.ok(flatten(spec.nodes).some((n) => n.others), "com 2 por nível, algum nível tem 'Outros'");
    for (const parent of parents) {
      if (!parent.children.length) continue;
      assert.ok(parent.children.length <= 3);
      assert.equal(
        parent.children.reduce((a, c) => a + c.size, 0),
        parent.size,
      );
      const others = parent.children.filter((c) => c.others);
      assert.ok(others.length <= 1 && (others.length === 0 || parent.children.at(-1)!.others));
      assert.ok(others.every((o) => o.children.length === 0 && o.label === "Outros"));
    }
  });

  test("comparação: o mesmo caminho no período anterior", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildTreemap(pc, widget<TreemapWidget>(TREE));
    const before = pc.compareDimension("platform")!;
    const meta = spec.nodes.find((n) => n.key === "meta")!;
    const metaBefore = before.find((r) => r.key === "meta")!.components;
    assert.equal(meta.compare?.size.value, metricValue("spend", metaBefore));
    assert.equal(meta.compare?.color?.value, metricValue("roas", metaBefore));
    const off = buildTreemap(computer({ periodo: "30d", comparar: "nao" }), widget<TreemapWidget>(TREE));
    assert.ok(flatten(off.nodes).every((n) => n.compare === null));
  });

  test("produto sozinho: o faturamento dos itens, com o aviso", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildTreemap(pc, widget<TreemapWidget>({ id: "t", type: "treemap", levels: ["product"], size: "gross" }));
    assert.equal(spec.total, metricValue("gross", sumComponents(pc.dimension("product").map((r) => r.components))));
    assert.ok(spec.notes.includes(msg.panel.notes.productRevenue));
    assert.ok(!spec.notes.includes(msg.panel.notes.treemapDrill), "um nível só: não tem o que abrir");
    assert.equal(spec.color, null);
  });

  test("período sem dados: vazio", () => {
    const spec = buildTreemap(computer({ periodo: "personalizado", de: "2001-01-01", ate: "2001-01-31" }), widget<TreemapWidget>(TREE));
    assert.equal(spec.empty, true);
    assert.deepEqual(spec.nodes, []);
  });
});

describe("escala de cores do treemap", () => {
  test("cores: leitura, mistura e posição na faixa", () => {
    assert.deepEqual(parseColor("#fff"), [255, 255, 255]);
    assert.deepEqual(parseColor("#4b3bd0"), [75, 59, 208]);
    assert.deepEqual(parseColor("rgb(1, 2, 3)"), [1, 2, 3]);
    assert.equal(parseColor("oklch(0.5 0.1 200)"), null);
    assert.equal(mixColors("#000000", "#ffffff", 0), "#000000");
    assert.equal(mixColors("#000000", "#ffffff", 1), "#ffffff");
    assert.equal(mixColors("#000000", "#ffffff", 0.5), "#808080");
    // O meio da escala é o valor do gráfico inteiro; cada lado com a própria faixa.
    assert.equal(scalePosition(4, 0, 4, 10), 0.5);
    assert.equal(scalePosition(0, 0, 4, 10), 0);
    assert.equal(scalePosition(10, 0, 4, 10), 1);
    assert.equal(scalePosition(3, 3, 3, 3), 0.5, "um valor só fica no meio");
    assert.equal(scalePosition(20, 0, 4, 10), 1);
    // Perto do meio a diferença ainda aparece (raiz quadrada): 1/4 da distância vale metade do lado.
    assert.ok(near(scalePosition(2.5, 0, 4, 10), 0.5 - 0.5 * Math.sqrt(1.5 / 4)));
    assert.ok(near(scalePosition(5.5, 0, 4, 10), 0.75));
  });

  test("roxo do lado em que a métrica vai bem: ROAS alto, CPA baixo", () => {
    const up = colorScale(THEME, "up");
    assert.equal(up(1), THEME.palette[0]);
    assert.equal(up(0), THEME.palette[1]);
    const down = colorScale(THEME, "down");
    assert.equal(down(0), THEME.palette[0]);
    assert.equal(down(1), THEME.palette[1]);
  });
});

describe("pizza, rosca e treemap no ECharts", () => {
  const pie = (over: Partial<PieSpec> = {}): PieSpec => ({
    kind: "pie",
    donut: true,
    metric: { id: "net", name: "Faturamento líquido", format: "money", direction: "up" },
    slices: [
      { key: "meta", label: "Meta", value: 600_000, share: 0.6, color: 0, compare: { value: 500_000, change: { kind: "pct", value: 0.2, tone: "good" } } },
      { key: OTHERS_KEY, label: "Outros <b>", value: 400_000, share: 0.4, color: null, compare: null },
    ],
    total: 1_000_000,
    compareTotal: null,
    labels: "both",
    currency: "BRL",
    compareName: "período anterior",
    notes: [],
    empty: false,
    emptyReason: null,
    ...over,
  });

  test("rosca com o total no centro; pizza sem; 'Outros' em cinza", () => {
    const donut = toEChartsOption(pie(), THEME, { reducedMotion: true });
    const series = (donut.series as { type: string; radius: unknown; data: { itemStyle: { color: string } }[] }[])[0];
    assert.equal(series.type, "pie");
    assert.deepEqual(series.radius, ["46%", "68%"]);
    assert.match((donut.title as { text: string }).text, /^R\$\s10\smil$/);
    assert.equal(series.data[0].itemStyle.color, THEME.palette[0]);
    assert.equal(series.data[1].itemStyle.color, THEME.muted);
    // No celular (até 480 px): pizza menor e sem a legenda embaixo.
    const media = donut.media as { query: { maxWidth: number }; option: { legend: { show: boolean } } }[];
    assert.equal(media[0].query.maxWidth, 480);
    assert.equal(media[0].option.legend.show, false);
    const plain = toEChartsOption(pie({ donut: false }), THEME, { reducedMotion: true });
    assert.equal(plain.title, undefined);
    assert.deepEqual((plain.series as { radius: unknown }[])[0].radius, [0, "68%"]);
  });

  test("dica da fatia: valor, percentual do total, comparação e texto escapado", () => {
    const html = pieTooltipHtml(pie(), THEME, 0);
    assert.match(html, /R\$\s6\.000,00/);
    assert.match(html, /60,0% do total/);
    assert.match(html, /período anterior: R\$\s5\.000,00/);
    assert.match(html, /▲ \+20,0%/);
    assert.match(pieTooltipHtml(pie(), THEME, 1), /Outros &lt;b&gt;/);
  });

  const node = (key: string, size: number, color: number | null, children: TreemapNode[] = [], others = false): TreemapNode => ({
    key,
    label: key,
    others,
    path: key.split("/"),
    size,
    share: size / 1000,
    color,
    compare: null,
    children,
  });
  const tree = (over: Partial<TreemapSpec> = {}): TreemapSpec => ({
    kind: "treemap",
    levels: ["Plataforma", "Campanha"],
    size: { id: "spend", name: "Gasto com anúncios", format: "money", direction: "neutral" },
    color: { id: "roas", name: "ROAS", format: "multiplier", direction: "up", min: 1, mid: 2, max: 3 },
    nodes: [node("meta", 700, 3, [node("meta/a", 500, 3), node("meta/b", 200, null)]), node("google", 300, 1)],
    total: 1000,
    currency: "BRL",
    compareName: null,
    notes: [],
    empty: false,
    emptyReason: null,
    ...over,
  });

  test("treemap: um nível por vez, clique abre, cores pela escala e cinza sem dado", () => {
    const option = toEChartsOption(tree(), THEME, { reducedMotion: true });
    const series = (option.series as { type: string; leafDepth: number; nodeClick: string; data: { id: string; children?: unknown[] }[] }[])[0];
    assert.equal(series.type, "treemap");
    assert.equal(series.leafDepth, 1);
    assert.equal(series.nodeClick, "link");
    // Com "reduzir movimento", a animação dura 1 ms (sem animação o ECharts não redesenha ao abrir um nível).
    assert.equal(option.animation, true);
    assert.equal((series as unknown as { animationDurationUpdate: number }).animationDurationUpdate, 1);
    assert.deepEqual(
      series.data.map((d) => d.id),
      ["meta", "google"],
    );
    assert.equal(series.data[0].children?.length, 2);
    const colors = treemapColors(tree(), THEME);
    assert.equal(colors.get("meta"), THEME.palette[0], "o maior ROAS fica roxo");
    assert.equal(colors.get("google"), THEME.palette[1], "o menor ROAS fica laranja");
    assert.equal(colors.get("meta/b"), THEME.muted, "sem dado fica cinza");
  });

  test("treemap sem métrica de cor: uma cor da paleta por irmão, 'Outros' em cinza", () => {
    const spec = tree({ color: null, nodes: [node("meta", 700, null), node("google", 200, null), node("x", 100, null, [], true)] });
    const colors = treemapColors(spec, THEME);
    assert.deepEqual([colors.get("meta"), colors.get("google"), colors.get("x")], [THEME.palette[0], THEME.palette[1], THEME.muted]);
  });

  test("dica do treemap: o caminho, o percentual, a cor e o convite para abrir", () => {
    const spec = tree();
    const html = treemapTooltipHtml(spec, THEME, spec.nodes[0]);
    assert.match(html, /meta/);
    assert.match(html, /70,0% do total/);
    assert.match(html, /3,00x/);
    assert.match(html, /Clique para ver por campanha/);
    assert.doesNotMatch(treemapTooltipHtml(spec, THEME, spec.nodes[0].children[0]), /Clique para ver/);
  });
});
