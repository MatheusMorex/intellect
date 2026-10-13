// Frases que descrevem uma automação ("Quando um card for movido para Feito,
// marcar o prazo como concluído"). Usadas no diretório (S14) e na prévia do
// construtor (S15).

import type { AutomationAction, AutomationType, CardFilter } from "./schema";

export type Names = {
  lists: Record<string, string>;
  labels: Record<string, string>;
  people: Record<string, string>;
  dashboards: Record<string, string>;
};

/** Nome, aba do diretório, explicação, botão de criar e título do vazio de cada tipo. */
export const TYPE_INFO: Record<AutomationType, { title: string; tab: string; hint: string; create: string; empty: string }> = {
  rule: { title: "Regra", tab: "regras", hint: "Roda quando algo acontece num card.", create: "Criar regra", empty: "Nenhuma regra ainda" },
  metric: {
    title: "Regra por métrica",
    tab: "metricas",
    hint: "Olha os números das campanhas de tempos em tempos e age nos cards ligados a elas.",
    create: "Criar regra por métrica",
    empty: "Nenhuma regra por métrica ainda",
  },
  scheduled: { title: "Programada", tab: "agendadas", hint: "Roda num dia e hora fixos.", create: "Criar automação programada", empty: "Nenhuma automação programada ainda" },
  due_date: { title: "Por data de entrega", tab: "prazos", hint: "Roda antes ou depois do prazo de cada card.", create: "Criar automação por prazo", empty: "Nenhuma automação por prazo ainda" },
  card_button: { title: "Botão do card", tab: "botoes-card", hint: "Aparece no verso de todos os cards do quadro.", create: "Criar botão do card", empty: "Nenhum botão do card ainda" },
  board_button: { title: "Botão do quadro", tab: "botoes-quadro", hint: "Aparece no cabeçalho do quadro.", create: "Criar botão do quadro", empty: "Nenhum botão do quadro ainda" },
};

const q = (s: string | undefined) => (s ? `“${s}”` : "(item excluído)");
const list = (n: Names, id: string | null | undefined) => (id ? q(n.lists[id]) : "qualquer lista");
const label = (n: Names, id: string) => q(n.labels[id]);
const person = (n: Names, id: string) => n.people[id] ?? "(pessoa removida)";

export const METRIC_LABEL = { roas: "ROAS", cpa: "CPA", spend: "gasto", revenue: "faturamento", sales: "vendas" } as const;
export const WINDOW_LABEL = { today: "hoje", yesterday: "ontem", "3d": "últimos 3 dias", "7d": "últimos 7 dias", "14d": "últimos 14 dias", "30d": "últimos 30 dias" } as const;
export const LEVEL_LABEL = { campaign: "campanha", ad_set: "conjunto", ad: "anúncio" } as const;
const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function metricValue(metric: keyof typeof METRIC_LABEL, value: number) {
  if (metric === "roas") return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (metric === "sales") return String(Math.round(value));
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o gatilho vem validado pelo Zod; aqui só lemos
export function describeTrigger(type: AutomationType, t: any, n: Names): string {
  switch (type) {
    case "rule":
      switch (t.kind) {
        case "card_created":
          return `Quando um card for criado em ${list(n, t.listId)}`;
        case "card_moved":
          return `Quando um card for movido ${t.fromListId ? `de ${list(n, t.fromListId)} ` : ""}para ${list(n, t.toListId)}`;
        case "card_archived":
          return "Quando um card for arquivado";
        case "label_added":
          return `Quando ${t.labelId ? `a etiqueta ${label(n, t.labelId)}` : "uma etiqueta"} for colocada num card`;
        case "member_added":
          return `Quando ${t.userId ? person(n, t.userId) : "alguém"} entrar num card`;
        case "due_completed":
          return "Quando o prazo de um card for marcado como concluído";
        case "checklist_completed":
          return "Quando uma checklist ficar toda concluída";
        case "comment_added":
          return t.contains ? `Quando alguém comentar com ${q(t.contains)}` : "Quando alguém comentar num card";
      }
      return "Quando…";
    case "metric": {
      const conds = (t.conditions ?? []).map((c: { metric: keyof typeof METRIC_LABEL; op: "gt" | "lt"; value: number }) => `${METRIC_LABEL[c.metric]} ${c.op === "gt" ? "acima de" : "abaixo de"} ${metricValue(c.metric, c.value)}`);
      const who = `${LEVEL_LABEL[t.level as keyof typeof LEVEL_LABEL] ?? "campanha"}${t.status === "active" ? " ativa" : t.status === "paused" ? " pausada" : ""}${t.provider !== "any" ? ` do ${t.provider === "meta" ? "Meta" : "Google"}` : ""}${t.nameContains ? ` com ${q(t.nameContains)} no nome` : ""}`;
      return `A cada ${t.everyMinutes >= 60 ? `${t.everyMinutes / 60} h` : `${t.everyMinutes} min`}, quando ${who} tiver ${conds.join(" e ") || "…"} (${WINDOW_LABEL[t.window as keyof typeof WINDOW_LABEL] ?? ""}) em ${q(n.dashboards[t.dashboardId])}`;
    }
    case "scheduled":
      if (t.every === "day") return `Todo dia às ${t.time}`;
      if (t.every === "weekday") return `De segunda a sexta às ${t.time}`;
      if (t.every === "week") return `Toda ${WEEKDAY[t.weekday]} às ${t.time}`;
      return `Todo dia ${t.monthDay} do mês às ${t.time}`;
    case "due_date": {
      const amount = `${t.amount} ${t.unit === "hours" ? (t.amount === 1 ? "hora" : "horas") : t.amount === 1 ? "dia" : "dias"}`;
      return t.amount === 0 ? "Quando o prazo de um card chegar" : `${amount} ${t.when === "before" ? "antes" : "depois"} do prazo de um card`;
    }
    case "card_button":
      return `Botão do card ${q(t.label)}`;
    case "board_button":
      return `Botão do quadro ${q(t.label)}`;
  }
}

export function describeFilter(f: CardFilter, n: Names): string {
  switch (f.kind) {
    case "in_list":
      return `o card está em ${list(n, f.listId)}`;
    case "has_label":
      return `o card tem a etiqueta ${label(n, f.labelId)}`;
    case "not_label":
      return `o card não tem a etiqueta ${label(n, f.labelId)}`;
    case "has_member":
      return `${person(n, f.userId)} está no card`;
    case "name_contains":
      return `o nome do card tem ${q(f.text)}`;
  }
}

export function describeAction(a: AutomationAction, n: Names): string {
  switch (a.kind) {
    case "move_card":
      return `mover o card para ${list(n, a.listId)} (${a.position === "top" ? "no topo" : "no fim"})`;
    case "copy_card":
      return `copiar o card para ${list(n, a.listId)}`;
    case "archive_card":
      return "arquivar o card";
    case "add_label":
      return `colocar a etiqueta ${label(n, a.labelId)}`;
    case "remove_label":
      return `tirar a etiqueta ${label(n, a.labelId)}`;
    case "add_member":
      return `colocar ${person(n, a.userId)} no card`;
    case "remove_member":
      return `tirar ${person(n, a.userId)} do card`;
    case "set_due":
      return a.days === 0 ? "pôr o prazo para hoje" : `pôr o prazo para daqui a ${a.days} ${a.days === 1 ? "dia" : "dias"}`;
    case "remove_due":
      return "tirar o prazo";
    case "complete_due":
      return "marcar o prazo como concluído";
    case "add_checklist":
      return `adicionar a checklist ${q(a.name)}${a.items.length ? ` com ${a.items.length} ${a.items.length === 1 ? "item" : "itens"}` : ""}`;
    case "add_comment":
      return `comentar ${q(a.text.length > 60 ? `${a.text.slice(0, 60)}…` : a.text)}`;
    case "rename_card":
      return `renomear o card para ${q(a.name)}`;
    case "create_card":
      return `criar o card ${q(a.name)} em ${list(n, a.listId)}`;
    case "move_list_cards":
      return `mover todos os cards de ${list(n, a.fromListId)} para ${list(n, a.toListId)}`;
    case "archive_list_cards":
      return `arquivar todos os cards de ${list(n, a.listId)}`;
  }
}

export function describeAutomation(a: { type: AutomationType; trigger: unknown; filters: CardFilter[]; actions: AutomationAction[] }, n: Names) {
  const parts = [describeTrigger(a.type, a.trigger, n)];
  if (a.filters.length) parts.push(`se ${a.filters.map((f) => describeFilter(f, n)).join(" e ")}`);
  const acts = a.actions.map((x) => describeAction(x, n));
  return `${parts.join(", ")}: ${acts.join("; ")}.`;
}
