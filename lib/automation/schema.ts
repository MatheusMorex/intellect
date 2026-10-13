// Automação do quadro (F07 a F09, F17): o formato de gatilhos, filtros e ações.
// Serve ao construtor (navegador) e ao motor (servidor); o Zod valida tudo que
// chega antes de gravar. No banco real fica em automations.trigger e .actions (jsonb).

import { z } from "zod";

const id = z.uuid();

export const AUTOMATION_TYPES = ["rule", "metric", "scheduled", "due_date", "card_button", "board_button"] as const;
export type AutomationType = (typeof AUTOMATION_TYPES)[number];

// ---- gatilhos ------------------------------------------------------------------------------------

export const ruleTrigger = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("card_created"), listId: id.nullable() }),
  z.object({ kind: z.literal("card_moved"), toListId: id.nullable(), fromListId: id.nullable() }),
  z.object({ kind: z.literal("card_archived") }),
  z.object({ kind: z.literal("label_added"), labelId: id.nullable() }),
  z.object({ kind: z.literal("member_added"), userId: id.nullable() }),
  z.object({ kind: z.literal("due_completed") }),
  z.object({ kind: z.literal("checklist_completed") }),
  z.object({ kind: z.literal("comment_added"), contains: z.string().trim().max(200) }),
]);
export type RuleTrigger = z.infer<typeof ruleTrigger>;

export const METRICS = ["roas", "cpa", "spend", "revenue", "sales"] as const;
export type MetricName = (typeof METRICS)[number];
export const METRIC_WINDOWS = ["today", "yesterday", "3d", "7d", "14d", "30d"] as const;
export const METRIC_FREQUENCIES = [15, 30, 60, 360, 1440] as const;

export const metricTrigger = z.object({
  kind: z.literal("metric"),
  dashboardId: id,
  level: z.enum(["campaign", "ad_set", "ad"]),
  status: z.enum(["active", "paused", "any"]),
  provider: z.enum(["meta", "google", "any"]),
  nameContains: z.string().trim().max(200),
  conditions: z
    .array(
      z.object({
        metric: z.enum(METRICS),
        op: z.enum(["gt", "lt"]),
        value: z.number().finite().min(0, "Use um valor de zero para cima.").max(1e9),
      }),
    )
    .min(1, "Coloque pelo menos uma condição.")
    .max(5, "No máximo 5 condições."),
  window: z.enum(METRIC_WINDOWS),
  everyMinutes: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(360), z.literal(1440)]),
  // Quando não há card ligado ao objeto: cria um na lista escolhida, ou não faz nada.
  createInListId: id.nullable(),
});
export type MetricTrigger = z.infer<typeof metricTrigger>;

export const scheduleTrigger = z.object({
  kind: z.literal("schedule"),
  every: z.enum(["day", "weekday", "week", "month"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a hora no formato 09:00."),
  weekday: z.number().int().min(0).max(6),
  monthDay: z.number().int().min(1).max(31),
});
export type ScheduleTrigger = z.infer<typeof scheduleTrigger>;

export const dueTrigger = z.object({
  kind: z.literal("due"),
  when: z.enum(["before", "after"]),
  amount: z.number().int().min(0).max(365),
  unit: z.enum(["hours", "days"]),
});
export type DueTrigger = z.infer<typeof dueTrigger>;

export const buttonTrigger = z.object({ kind: z.literal("button"), label: z.string().trim().min(1, "Dê um nome ao botão.").max(40) });

// ---- filtros (só para gatilhos de card) -----------------------------------------------------------------

export const cardFilter = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("in_list"), listId: id }),
  z.object({ kind: z.literal("has_label"), labelId: id }),
  z.object({ kind: z.literal("not_label"), labelId: id }),
  z.object({ kind: z.literal("has_member"), userId: id }),
  z.object({ kind: z.literal("name_contains"), text: z.string().trim().min(1).max(200) }),
]);
export type CardFilter = z.infer<typeof cardFilter>;

// ---- ações ------------------------------------------------------------------------------------------

const text = (what: string, max = 2000) => z.string().trim().min(1, `Escreva ${what}.`).max(max);

export const cardAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move_card"), listId: id, position: z.enum(["top", "bottom"]) }),
  z.object({ kind: z.literal("copy_card"), listId: id }),
  z.object({ kind: z.literal("archive_card") }),
  z.object({ kind: z.literal("add_label"), labelId: id }),
  z.object({ kind: z.literal("remove_label"), labelId: id }),
  z.object({ kind: z.literal("add_member"), userId: id }),
  z.object({ kind: z.literal("remove_member"), userId: id }),
  z.object({ kind: z.literal("set_due"), days: z.number().int().min(0).max(365) }),
  z.object({ kind: z.literal("remove_due") }),
  z.object({ kind: z.literal("complete_due") }),
  z.object({ kind: z.literal("add_checklist"), name: text("o nome da checklist", 200), items: z.array(z.string().trim().min(1).max(500)).max(50) }),
  z.object({ kind: z.literal("add_comment"), text: text("o comentário") }),
  z.object({ kind: z.literal("rename_card"), name: text("o novo nome", 500) }),
]);

// Ações de quadro: para agendadas e botões do quadro (não dependem de um card).
export const boardAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create_card"), listId: id, name: text("o nome do card", 500) }),
  z.object({ kind: z.literal("move_list_cards"), fromListId: id, toListId: id }),
  z.object({ kind: z.literal("archive_list_cards"), listId: id }),
]);

export const anyAction = z.union([cardAction, boardAction]);
export type CardAction = z.infer<typeof cardAction>;
export type BoardAction = z.infer<typeof boardAction>;
export type AutomationAction = z.infer<typeof anyAction>;

const actions = (schema: z.ZodType) => z.array(schema).min(1, "Coloque pelo menos uma ação.").max(20, "No máximo 20 ações.");

// ---- automação inteira, por tipo --------------------------------------------------------------------------

const base = { name: z.string().trim().min(1, "Dê um nome à automação.").max(200) };

export const automationInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rule"), ...base, trigger: ruleTrigger, filters: z.array(cardFilter).max(10), actions: actions(cardAction) }),
  z.object({ type: z.literal("metric"), ...base, trigger: metricTrigger, filters: z.array(cardFilter).max(0), actions: actions(cardAction) }),
  z.object({ type: z.literal("scheduled"), ...base, trigger: scheduleTrigger, filters: z.array(cardFilter).max(0), actions: actions(boardAction) }),
  z.object({ type: z.literal("due_date"), ...base, trigger: dueTrigger, filters: z.array(cardFilter).max(10), actions: actions(cardAction) }),
  z.object({ type: z.literal("card_button"), ...base, trigger: buttonTrigger, filters: z.array(cardFilter).max(10), actions: actions(cardAction) }),
  z.object({ type: z.literal("board_button"), ...base, trigger: buttonTrigger, filters: z.array(cardFilter).max(0), actions: actions(boardAction) }),
]);
export type AutomationInput = z.infer<typeof automationInput>;

/** Ações que trabalham num card (as outras são de quadro). */
export function isCardAction(a: AutomationAction): a is CardAction {
  return !["create_card", "move_list_cards", "archive_list_cards"].includes(a.kind);
}

// ---- variáveis -------------------------------------------------------------------------------------------

export const VARIABLES = [
  ["{cardname}", "nome do card"],
  ["{cardlink}", "link do card"],
  ["{listname}", "lista do card"],
  ["{boardname}", "nome do quadro"],
  ["{username}", "quem disparou"],
  ["{date}", "data de hoje"],
  ["{campaign}", "campanha, conjunto ou anúncio (métrica)"],
  ["{roas}", "ROAS da janela (métrica)"],
  ["{spend}", "gasto da janela (métrica)"],
] as const;

export function fillVariables(template: string, values: Partial<Record<string, string>>) {
  return template.replace(/\{(cardname|cardlink|listname|boardname|username|date|campaign|roas|spend)\}/g, (match, key: string) => values[key] ?? match);
}
