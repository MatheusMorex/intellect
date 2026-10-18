// Fase 4: funil (vendas e kanban) e Gantt. Sobre os dados simulados
// (createSeed): o funil de vendas usa os mesmos totais dos cartões, o do
// kanban conta até onde cada card chegou (lista atual e histórico), e o Gantt
// mostra os cards com data dos quadros que a pessoa pode ver.

import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, test } from "node:test";

import type { CustomSeriesOption } from "echarts";

import { funnelStepText, ganttDate, ganttRows, toEChartsOption } from "../../components/charts/echarts-option.ts";
import type { ChartTheme } from "../../components/charts/use-chart-theme.ts";
import { msg } from "../../lib/charts/messages.ts";
import type { FunnelSpec, GanttSpec, GanttTask } from "../../lib/charts/spec.ts";
import {
  DEFAULT_PANEL,
  DEFAULT_SALES_STEPS,
  PANEL_WIDGET,
  widgetTitle,
  type FunnelWidget,
  type GanttWidget,
  type PanelWidgetInput,
} from "../../lib/charts/widgets.ts";
import { buildFunnel, buildGantt, MAX_GANTT_TASKS, panelComputer } from "../../server/charts/build.ts";
import { metricValue } from "../../server/charts/compute.ts";
import { boardLists, kanbanFunnelCounts, visibleBoards } from "../../server/charts/kanban.ts";
import { parsePanelQuery } from "../../server/charts/params.ts";
import { panelSource } from "../../server/charts/source.ts";
import { earliestDay } from "../../server/data/tracking.ts";
import { createSeed } from "../../server/store/seed.ts";
import type { Store } from "../../server/store/types.ts";

// Sábado, 17 de outubro de 2026, 12h em Brasília.
const NOW = new Date("2026-10-17T15:00:00Z");
const seed = createSeed(NOW);

function computer(sp: Record<string, string> = {}, store: Store = seed, canSee: (id: string) => boolean = () => true) {
  const dashboard = store.dashboards[0];
  const query = parsePanelQuery(sp, dashboard.timezone, earliestDay(store, dashboard), NOW);
  const boards = visibleBoards(store, dashboard.workspaceId, (b) => canSee(b.id));
  return panelComputer(panelSource(store, dashboard, query.filters, undefined, boards), query, NOW);
}
const widget = <T,>(input: PanelWidgetInput) => PANEL_WIDGET.parse(input) as T;
const errors = (input: PanelWidgetInput) => {
  const result = PANEL_WIDGET.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const mainBoard = seed.boards.find((b) => b.name === "Campanhas e criativos")!;
const listId = (store: Store, name: string) => store.lists.find((l) => l.boardId === mainBoard.id && l.name === name)!.id;
const allTasks = (spec: GanttSpec) => spec.groups.flatMap((g) => g.tasks);
const taskNamed = (spec: GanttSpec, name: string) => allTasks(spec).find((t) => t.label === name);

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

describe("configuração do funil e do Gantt", () => {
  test("padrões", () => {
    const sales = widget<FunnelWidget>({ id: "f", type: "funnel", source: { kind: "sales" } });
    assert.deepEqual(sales.source, { kind: "sales", steps: [...DEFAULT_SALES_STEPS] });
    const kanban = widget<FunnelWidget>({ id: "f", type: "funnel", source: { kind: "kanban" } });
    assert.deepEqual(kanban.source, { kind: "kanban", boardId: null, listIds: null });
    const gantt = widget<GanttWidget>({ id: "g", type: "gantt" });
    assert.deepEqual([gantt.boardIds, gantt.groupBy, gantt.colorBy, gantt.scale, gantt.showDone], [null, "list", "member", "week", true]);
  });

  test("etapas do funil de vendas: contagens, de 2 a 6, sem repetir", () => {
    assert.deepEqual(errors({ id: "f", type: "funnel", source: { kind: "sales", steps: ["clicks", "net"] } }), [msg.widgetError.funnelStepCount]);
    assert.deepEqual(errors({ id: "f", type: "funnel", source: { kind: "sales", steps: ["clicks", "roas"] } }), [msg.widgetError.funnelStepCount]);
    assert.deepEqual(errors({ id: "f", type: "funnel", source: { kind: "sales", steps: ["clicks"] } }), [msg.widgetError.funnelSteps]);
    assert.deepEqual(errors({ id: "f", type: "funnel", source: { kind: "sales", steps: ["clicks", "clicks"] } }), [msg.widgetError.repeated]);
    assert.deepEqual(
      errors({ id: "f", type: "funnel", source: { kind: "sales", steps: ["impressions", "clicks", "addToCarts", "orders", "paid", "pending", "refunded"] } }),
      [msg.widgetError.funnelSteps],
    );
  });

  test("listas e quadros", () => {
    assert.deepEqual(errors({ id: "f", type: "funnel", source: { kind: "kanban", listIds: ["a"] } }), [msg.widgetError.funnelLists]);
    assert.deepEqual(errors({ id: "f", type: "funnel", source: { kind: "kanban", listIds: ["a", "a"] } }), [msg.widgetError.levelsRepeated]);
    assert.deepEqual(errors({ id: "g", type: "gantt", boardIds: [] }), [msg.widgetError.boards]);
  });

  test("títulos automáticos e o painel padrão", () => {
    assert.equal(widgetTitle(widget({ id: "f", type: "funnel", source: { kind: "sales" } })), "Funil de vendas");
    assert.equal(widgetTitle(widget({ id: "f", type: "funnel", source: { kind: "kanban" } })), "Funil do quadro");
    assert.equal(widgetTitle(widget({ id: "g", type: "gantt" })), "Cronograma das tarefas");
    assert.deepEqual(
      DEFAULT_PANEL.filter((w) => w.type === "funnel" || w.type === "gantt").map((w) => w.id),
      ["funil-vendas", "funil-quadro", "gantt-tarefas"],
    );
  });
});

describe("funil de vendas", () => {
  test("as etapas são os totais dos cartões; percentuais entre etapas e do topo", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildFunnel(pc, widget<FunnelWidget>({ id: "f", type: "funnel", source: { kind: "sales" } }));
    assert.equal(spec.kind, "funnel");
    assert.deepEqual(
      spec.steps.map((s) => s.key),
      [...DEFAULT_SALES_STEPS],
    );
    for (const step of spec.steps) assert.equal(step.value, metricValue(step.key as (typeof DEFAULT_SALES_STEPS)[number], pc.totals()));
    const [top, ...rest] = spec.steps;
    assert.equal(top.fromPrevious, null);
    assert.equal(top.fromTop, 1);
    rest.forEach((step, i) => {
      assert.ok(near(step.fromPrevious!, step.value / spec.steps[i].value));
      assert.ok(near(step.fromTop!, step.value / top.value));
    });
    // A maior perda: a menor fração da anterior (abaixo de 100%), uma etapa só.
    const losses = spec.steps.filter((s) => s.biggestLoss);
    assert.equal(losses.length, 1);
    const smallest = Math.min(...spec.steps.filter((s) => s.fromPrevious != null && s.fromPrevious < 1).map((s) => s.fromPrevious!));
    assert.equal(losses[0].fromPrevious, smallest);
  });

  test("aviso de fontes misturadas sem filtro; com filtro de fonte, sem aviso", () => {
    const w = widget<FunnelWidget>({ id: "f", type: "funnel", source: { kind: "sales" } });
    assert.ok(buildFunnel(computer({ periodo: "30d" }), w).notes.includes(msg.panel.funnel.mixedSources));
    assert.ok(!buildFunnel(computer({ periodo: "30d", fonte: "meta" }), w).notes.includes(msg.panel.funnel.mixedSources));
    const onlyOrders = widget<FunnelWidget>({ id: "f", type: "funnel", source: { kind: "sales", steps: ["orders", "paid"] } });
    assert.ok(!buildFunnel(computer({ periodo: "30d" }), onlyOrders).notes.includes(msg.panel.funnel.mixedSources));
  });

  test("comparação com o período anterior", () => {
    const pc = computer({ periodo: "30d" });
    const spec = buildFunnel(pc, widget<FunnelWidget>({ id: "f", type: "funnel", source: { kind: "sales", steps: ["clicks", "paid"] } }));
    assert.equal(spec.steps[1].compare?.value, metricValue("paid", pc.compareTotals()!));
  });

  test("período sem dados: vazio", () => {
    const spec = buildFunnel(
      computer({ periodo: "personalizado", de: "2001-01-01", ate: "2001-01-31" }),
      widget<FunnelWidget>({ id: "f", type: "funnel", source: { kind: "sales" } }),
    );
    assert.equal(spec.empty, true);
    assert.ok(spec.steps.every((s) => !s.biggestLoss));
  });
});

describe("funil do kanban", () => {
  const KANBAN: PanelWidgetInput = { id: "f", type: "funnel", source: { kind: "kanban" } };

  test("até que lista os cards chegaram: na lista ou mais adiante", () => {
    const spec = buildFunnel(computer({ periodo: "30d" }), widget<FunnelWidget>(KANBAN));
    assert.equal(spec.board?.name, "Campanhas e criativos");
    assert.equal(spec.board?.href, `/b/${mainBoard.id}`);
    assert.deepEqual(
      spec.steps.map((s) => s.label),
      ["Ideias", "A fazer", "Em andamento", "Feito"],
    );
    // 9 cards: 2 em Ideias, 3 em A fazer, 2 em Em andamento e 2 em Feito.
    assert.deepEqual(
      spec.steps.map((s) => s.value),
      [9, 7, 4, 2],
    );
    assert.ok(spec.notes.includes(msg.panel.funnel.kanban("Campanhas e criativos")));
  });

  test("o card que voltou para trás continua contando onde já esteve", () => {
    const store = structuredClone(seed);
    const card = store.cards.find((c) => c.name === "Escalar o Remarketing 30d")!;
    card.listId = listId(store, "Ideias");
    store.activities.push({
      id: "a1",
      workspaceId: mainBoard.workspaceId,
      boardId: mainBoard.id,
      cardId: card.id,
      actorId: null,
      actorKind: "user",
      type: "card.moved",
      data: { from: "Em andamento", to: "Ideias", fromListId: listId(store, "Em andamento"), toListId: listId(store, "Ideias") },
      createdAt: NOW.toISOString(),
    });
    // Sem o histórico, ele contaria só em Ideias; com o histórico, ainda chegou até Em andamento.
    const ids = boardLists(store, mainBoard.id).map((l) => l.id);
    const range = { from: "2026-10-01", to: "2026-10-17" };
    assert.deepEqual(kanbanFunnelCounts(store, mainBoard.id, ids, range, "America/Sao_Paulo"), [9, 7, 4, 2]);
    store.activities.pop();
    assert.deepEqual(kanbanFunnelCounts(store, mainBoard.id, ids, range, "America/Sao_Paulo"), [9, 6, 3, 2]);
  });

  test("só os cards criados no período, e só os que estão ou passaram pelas listas escolhidas", () => {
    const empty = buildFunnel(computer({ periodo: "personalizado", de: "2001-01-01", ate: "2001-01-31" }), widget<FunnelWidget>(KANBAN));
    assert.equal(empty.empty, true);
    const chosen = widget<FunnelWidget>({
      id: "f",
      type: "funnel",
      source: { kind: "kanban", boardId: mainBoard.id, listIds: [listId(seed, "Ideias"), listId(seed, "Feito")] },
    });
    // Os cards de "A fazer" e "Em andamento" ficam fora deste funil: uma lista que não está no
    // funil pode ser "Perdido", então não dá para supor por onde eles passaram.
    assert.deepEqual(
      buildFunnel(computer({ periodo: "30d" }), chosen).steps.map((s) => [s.label, s.value]),
      [
        ["Ideias", 4],
        ["Feito", 2],
      ],
    );
  });

  test("quadro que a pessoa não pode ver: 'Quadro não encontrado', sem número nenhum", () => {
    const hidden = widget<FunnelWidget>({ id: "f", type: "funnel", source: { kind: "kanban", boardId: mainBoard.id } });
    const spec = buildFunnel(
      computer({ periodo: "30d" }, seed, (id) => id !== mainBoard.id),
      hidden,
    );
    assert.equal(spec.emptyReason, "no-board");
    assert.deepEqual(spec.steps, []);
  });
});

describe("Gantt", () => {
  const GANTT: PanelWidgetInput = { id: "g", type: "gantt" };

  test("cards com início viram barra; atrasada, concluída, progresso pelo checklist e link do card", () => {
    const spec = buildGantt(computer({ periodo: "30d" }), widget<GanttWidget>(GANTT));
    assert.equal(spec.kind, "gantt");
    assert.equal(spec.now, NOW.getTime());
    const video = taskNamed(spec, "Gravar 3 vídeos para o público frio")!;
    assert.ok(video.start != null && video.start < video.end);
    assert.equal(video.progress, 0.25, "1 de 4 itens do checklist");
    assert.deepEqual(video.checklist, { done: 1, total: 4 });
    assert.equal(video.overdue, false);
    const review = taskNamed(spec, "Revisar a página do Kit Completo")!;
    assert.equal(review.overdue, true, "venceu ontem e não foi feita");
    const done = taskNamed(spec, "Instalar o app da Shopify")!;
    assert.deepEqual([done.done, done.overdue, done.progress], [true, false, 1]);
    const remarketing = taskNamed(spec, "Escalar o Remarketing 30d")!;
    assert.equal(remarketing.people, "Ana Lima +1");
    assert.equal(remarketing.overdue, false, "vence hoje às 23h");
    assert.equal(remarketing.href, `/b/${mainBoard.id}?card=${seed.cards.find((c) => c.name === "Escalar o Remarketing 30d")!.id}`);
    // Card sem data de entrega não entra.
    assert.equal(taskNamed(spec, "Testar frete grátis acima de R$ 200"), undefined);
  });

  test("tarefas que terminam a partir do começo do período, inclusive as futuras", () => {
    const today = buildGantt(computer({ periodo: "hoje" }), widget<GanttWidget>(GANTT));
    const names = allTasks(today).map((t) => t.label).sort();
    assert.deepEqual(names, ["Definir a oferta e o bônus", "Escalar o Remarketing 30d", "Gravar 3 vídeos para o público frio"]);
    assert.ok(today.notes.includes(msg.panel.gantt.window));
    // Sem as concluídas.
    const open = buildGantt(computer({ periodo: "30d" }), widget<GanttWidget>({ ...GANTT, showDone: false }));
    assert.ok(allTasks(open).every((t) => !t.done));
    assert.ok(allTasks(open).length > 0);
  });

  test("grupos por lista (na ordem dos quadros) e cores por responsável", () => {
    const spec = buildGantt(computer({ periodo: "30d" }), widget<GanttWidget>(GANTT));
    assert.deepEqual(
      spec.groups.map((g) => g.label),
      ["Campanhas e criativos › A fazer", "Campanhas e criativos › Em andamento", "Campanhas e criativos › Feito", "Lançamento de novembro › Planejamento"],
    );
    // Dentro do grupo, pela data de início.
    const first = spec.groups[0].tasks;
    assert.deepEqual(
      first.map((t) => t.label),
      ["Revisar a página do Kit Completo", "Gravar 3 vídeos para o público frio"],
    );
    // Ana, Bruno e Carla em ordem alfabética; sem responsável, cinza.
    assert.deepEqual(
      spec.legend.map((l) => [l.label, l.color]),
      [
        ["Ana Lima", 0],
        ["Bruno Rocha", 1],
        ["Carla Souza", 2],
        [msg.panel.gantt.noMember, null],
      ],
    );
    assert.equal(taskNamed(spec, "Gravar 3 vídeos para o público frio")!.color, 2);
    assert.equal(taskNamed(spec, "Instalar o app da Shopify")!.color, null);
  });

  test("agrupado por responsável e por quadro; cor por etiqueta", () => {
    const byMember = buildGantt(computer({ periodo: "30d" }), widget<GanttWidget>({ ...GANTT, groupBy: "member", colorBy: "label" }));
    assert.equal(byMember.groups.at(-1)!.label, msg.panel.gantt.noMember, "sem responsável por último");
    assert.equal(byMember.legendTitle, "Cor: etiqueta");
    assert.ok(byMember.legend.some((l) => l.label === "Meta"));
    const byBoard = buildGantt(computer({ periodo: "30d" }), widget<GanttWidget>({ ...GANTT, groupBy: "board" }));
    assert.deepEqual(
      byBoard.groups.map((g) => g.label),
      ["Campanhas e criativos", "Lançamento de novembro"],
    );
  });

  test("só os quadros que a pessoa pode ver; quadro escolhido e escondido dá 'Quadro não encontrado'", () => {
    const launch = seed.boards.find((b) => b.name === "Lançamento de novembro")!;
    const spec = buildGantt(
      computer({ periodo: "30d" }, seed, (id) => id !== launch.id),
      widget<GanttWidget>(GANTT),
    );
    assert.ok(!allTasks(spec).some((t) => t.board === "Lançamento de novembro"));
    const hidden = buildGantt(
      computer({ periodo: "30d" }, seed, (id) => id !== launch.id),
      widget<GanttWidget>({ ...GANTT, boardIds: [launch.id] }),
    );
    assert.equal(hidden.emptyReason, "no-board");
  });

  test("início depois da entrega vira marco; mais de 60 tarefas mostra as mais próximas", () => {
    const store = structuredClone(seed);
    const card = store.cards.find((c) => c.name === "Gravar 3 vídeos para o público frio")!;
    card.startAt = new Date(new Date(card.dueAt!).getTime() + 86_400_000).toISOString();
    for (let i = 0; i < 70; i++) {
      store.cards.push({ ...card, id: `extra-${i}`, name: `Extra ${i}`, startAt: null, dueAt: new Date(NOW.getTime() + (i + 1) * 86_400_000).toISOString() });
    }
    const spec = buildGantt(computer({ periodo: "30d" }, store), widget<GanttWidget>(GANTT));
    assert.equal(taskNamed(spec, "Gravar 3 vídeos para o público frio")?.start, null);
    assert.equal(allTasks(spec).length, MAX_GANTT_TASKS);
    assert.ok(spec.notes.some((n) => n.startsWith(`Mostrando ${MAX_GANTT_TASKS} de `)));
    assert.equal(taskNamed(spec, "Extra 69"), undefined, "a mais distante fica de fora");
  });
});

describe("funil e Gantt no ECharts", () => {
  const funnel = (): FunnelSpec => ({
    kind: "funnel",
    source: "sales",
    steps: [
      { key: "a", label: "Cliques", value: 1000, fromPrevious: null, fromTop: 1, compare: null, biggestLoss: false },
      { key: "b", label: "Pedidos", value: 500, fromPrevious: 0.5, fromTop: 0.5, compare: null, biggestLoss: false },
      { key: "c", label: "Vendas", value: 50, fromPrevious: 0.1, fromTop: 0.05, compare: null, biggestLoss: true },
    ],
    board: null,
    currency: "BRL",
    compareName: null,
    notes: [],
    empty: false,
    emptyReason: null,
  });

  test("funil: na ordem das etapas, largura até o topo, maior perda escrita e com borda", () => {
    const option = toEChartsOption(funnel(), THEME, { reducedMotion: true });
    const series = (option.series as { type: string; sort: string; max: number; data: { itemStyle: { borderColor: string } }[] }[])[0];
    assert.deepEqual([series.type, series.sort, series.max], ["funnel", "none", 1000]);
    assert.equal(series.data[2].itemStyle.borderColor, THEME.bad);
    assert.equal(funnelStepText(funnel(), funnel().steps[0], 0), "1.000 · topo");
    assert.equal(funnelStepText(funnel(), funnel().steps[1], 1), "500 · 50,0% da anterior");
    // Rótulos numa coluna à direita do funil, para o da etapa larga não ficar por cima dela.
    assert.deepEqual((option.series as { labelLayout: unknown }[])[0].labelLayout, { x: "53%", align: "left" });
  });

  test("o renderizador registra o LabelLayout (sem ele, o ECharts ignora labelLayout em silêncio)", () => {
    const source = fs.readFileSync(new URL("../../components/charts/echarts-chart.tsx", import.meta.url), "utf8");
    assert.match(source, /import \{ LabelLayout \} from "echarts\/features"/);
    assert.match(source, /echarts\.use\(\[[\s\S]*\sLabelLayout,[\s\S]*\]\)/);
  });

  const task = (over: Partial<GanttTask>): GanttTask => ({
    key: "t",
    label: "Tarefa",
    href: "/b/x?card=t",
    start: Date.UTC(2026, 9, 10),
    end: Date.UTC(2026, 9, 20),
    progress: 0.5,
    checklist: null,
    done: false,
    overdue: false,
    color: 0,
    people: "Ana",
    board: "Quadro",
    list: "Lista",
    ...over,
  });
  const gantt = (): GanttSpec => ({
    kind: "gantt",
    groups: [
      { key: "g1", label: "A fazer", tasks: [task({ key: "t1" }), task({ key: "t2", start: null, overdue: true })] },
      { key: "g2", label: "Feito", tasks: [task({ key: "t3", done: true, progress: 1 })] },
    ],
    legend: [{ color: 0, label: "Ana" }],
    legendTitle: "Cor: responsável",
    from: Date.UTC(2026, 6, 1),
    to: Date.UTC(2026, 9, 30),
    now: Date.UTC(2026, 9, 17, 15),
    scale: "week",
    timezone: "America/Sao_Paulo",
    notes: [],
    empty: false,
    emptyReason: null,
  });

  test("Gantt: uma linha por grupo e por tarefa, link em cada barra, linha de hoje e zoom na janela longa", () => {
    const spec = gantt();
    assert.equal(ganttRows(spec).length, 5);
    const option = toEChartsOption(spec, THEME, { reducedMotion: true });
    const yAxis = option.yAxis as { data: { value: string }[] };
    assert.deepEqual(
      yAxis.data.map((d) => d.value),
      ["A fazer", "Tarefa", "⚠ Tarefa", "Feito", "✓ Tarefa"],
    );
    const series = (option.series as CustomSeriesOption[])[0] as CustomSeriesOption & { data: { value: number[]; href: string }[] };
    assert.deepEqual(
      series.data.map((d) => d.value[0]),
      [1, 2, 4],
    );
    assert.equal(series.data[0].href, "/b/x?card=t");
    assert.equal((series.markLine as { data: { xAxis: number }[] }).data[0].xAxis, spec.now);
    assert.ok(Array.isArray(option.dataZoom), "4 meses de janela, 12 semanas de cada vez");
  });

  test("Gantt: barra com a parte concluída, marco em losango, contorno vermelho na atrasada", () => {
    const option = toEChartsOption(gantt(), THEME, { reducedMotion: true });
    const series = (option.series as CustomSeriesOption[])[0] as CustomSeriesOption & { data: { value: number[] }[] };
    const render = series.renderItem as unknown as (params: { dataIndex: number }, api: unknown) => { type: string; children?: { shape: { width: number } }[]; style?: { stroke: string } };
    const api = (i: number) => ({
      value: (dim: number) => series.data[i].value[dim],
      // 1 pixel por hora no eixo x; 28 pixels por linha.
      coord: ([x, y]: number[]) => [(x - Date.UTC(2026, 9, 1)) / 3_600_000, y * 28],
      size: () => [0, 28],
    });
    const bar = render({ dataIndex: 0 }, api(0));
    assert.equal(bar.type, "group");
    assert.equal(bar.children![1].shape.width, bar.children![0].shape.width * 0.5, "metade concluída");
    const milestone = render({ dataIndex: 1 }, api(1));
    assert.equal(milestone.type, "polygon");
    assert.equal(milestone.style!.stroke, THEME.bad);
  });

  test("datas no fuso do dashboard", () => {
    // 17/10 às 2h UTC ainda é 16/10 em São Paulo.
    assert.equal(ganttDate(Date.UTC(2026, 9, 17, 2), "America/Sao_Paulo", "axis-day"), "16/10");
    assert.equal(ganttDate(Date.UTC(2026, 9, 17, 2), "Europe/Lisbon", "axis-day"), "17/10");
  });
});
