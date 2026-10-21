"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DATE_KEY } from "@/lib/periods";
import { parseMoneyToCents, parsePercentToBp } from "@/lib/parse";
import { requireDashboard } from "@/server/access";
import { liveTrackingAction } from "@/server/live/action";
import { requireUser } from "@/server/auth/session";
import { mutate, newId, nowIso } from "@/server/store/db";
import type { ExpenseCategory, PaymentMethod } from "@/server/store/types";

import type { ActionResult } from "./cards";

const dateKey = z.string().regex(DATE_KEY, "Data inválida.");

function percent(label: string) {
  return z
    .string()
    .transform((v, ctx) => {
      const bp = parsePercentToBp(v || "0");
      if (bp == null || bp < 0 || bp > 10000) {
        ctx.addIssue({ code: "custom", message: `${label}: use um percentual entre 0 e 100, como 6,5.` });
        return z.NEVER;
      }
      return bp;
    });
}

function money(label: string, allowZero = true) {
  return z.string().transform((v, ctx) => {
    const cents = parseMoneyToCents(v);
    if (cents == null || cents < 0 || (!allowZero && cents === 0)) {
      ctx.addIssue({ code: "custom", message: `${label}: use um valor como 49,90.` });
      return z.NEVER;
    }
    return cents;
  });
}

function done(dashboardId: string) {
  revalidatePath(`/d/${dashboardId}`, "layout");
}

// ---- impostos (F15) ---------------------------------------------------------------------

const costSettingsInput = z.object({
  dashboardId: z.uuid(),
  validFrom: dateKey,
  salesTax: percent("Imposto sobre vendas"),
  metaAdsTax: percent("Imposto sobre anúncios do Meta"),
  extraTaxes: z
    .array(z.object({ name: z.string().trim().min(1, "Dê um nome a cada imposto extra.").max(60), bp: percent("Imposto extra") }))
    .max(10),
});

async function saveCostSettingsImpl(input: z.input<typeof costSettingsInput>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = costSettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { dashboardId, validFrom, salesTax, metaAdsTax, extraTaxes } = parsed.data;
  requireDashboard({ user }, dashboardId, "admin");
  mutate((store) => {
    // Uma linha por data de início: salvar de novo na mesma data substitui.
    store.costSettings = store.costSettings.filter((c) => !(c.dashboardId === dashboardId && c.validFrom === validFrom));
    store.costSettings.push({
      id: newId(),
      dashboardId,
      validFrom,
      salesTaxBp: salesTax,
      metaAdsTaxBp: metaAdsTax,
      extraTaxes,
      createdBy: user.id,
      createdAt: nowIso(),
    });
  });
  done(dashboardId);
  return { ok: true, data: undefined };
}

// ---- custo por produto ----------------------------------------------------------------------

const productCostInput = z.object({
  dashboardId: z.uuid(),
  productId: z.uuid(),
  cost: money("Custo"),
  validFrom: dateKey,
});

async function setProductCostImpl(input: z.input<typeof productCostInput>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = productCostInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { dashboardId, productId, cost, validFrom } = parsed.data;
  const { dashboard } = requireDashboard({ user }, dashboardId, "admin");
  const ok = mutate((store) => {
    const product = store.products.find((p) => p.id === productId && p.workspaceId === dashboard.workspaceId);
    if (!product) return false;
    store.productCosts = store.productCosts.filter((c) => !(c.productId === productId && c.validFrom === validFrom));
    store.productCosts.push({
      id: newId(),
      productId,
      costCents: cost,
      currency: dashboard.currency,
      validFrom,
      createdBy: user.id,
      createdAt: nowIso(),
    });
    return true;
  });
  if (!ok) return { ok: false, error: "Produto não encontrado." };
  done(dashboardId);
  return { ok: true, data: undefined };
}

// ---- taxas adicionais ---------------------------------------------------------------------------

const feeInput = z
  .object({
    dashboardId: z.uuid(),
    feeId: z.uuid().optional(),
    name: z.string().trim().min(1, "Dê um nome à taxa.").max(100),
    kind: z.enum(["fixed", "percent"]),
    value: z.string(),
    scope: z.enum(["all", "product", "payment_method"]),
    productId: z.uuid().nullable(),
    paymentMethod: z.enum(["credit_card", "pix", "boleto", "paypal", "other"]).nullable(),
    validFrom: dateKey,
  })
  .superRefine((v, ctx) => {
    if (v.scope === "product" && !v.productId) ctx.addIssue({ code: "custom", message: "Escolha o produto." });
    if (v.scope === "payment_method" && !v.paymentMethod) ctx.addIssue({ code: "custom", message: "Escolha a forma de pagamento." });
    const parsed = v.kind === "fixed" ? parseMoneyToCents(v.value) : parsePercentToBp(v.value);
    if (parsed == null || parsed <= 0 || (v.kind === "percent" && parsed > 10000)) {
      ctx.addIssue({
        code: "custom",
        message: v.kind === "fixed" ? "Use um valor como 3,50." : "Use um percentual entre 0 e 100, como 2,5.",
      });
    }
  });

async function upsertAdditionalFeeImpl(input: z.input<typeof feeInput>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = feeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const { dashboard } = requireDashboard({ user }, v.dashboardId, "admin");
  mutate((store) => {
    const row = {
      id: v.feeId ?? newId(),
      dashboardId: v.dashboardId,
      name: v.name,
      kind: v.kind,
      amountCents: v.kind === "fixed" ? parseMoneyToCents(v.value) : null,
      // Taxa já salva continua na moeda em que foi cadastrada (o formulário mostra essa moeda).
      currency: store.additionalFees.find((f) => f.id === v.feeId && f.dashboardId === v.dashboardId)?.currency ?? dashboard.currency,
      bp: v.kind === "percent" ? parsePercentToBp(v.value) : null,
      scope: v.scope,
      productId: v.scope === "product" ? v.productId : null,
      paymentMethod: v.scope === "payment_method" ? (v.paymentMethod as PaymentMethod) : null,
      validFrom: v.validFrom,
      validUntil: null,
      createdBy: user.id,
      createdAt: nowIso(),
    };
    const index = store.additionalFees.findIndex((f) => f.id === v.feeId && f.dashboardId === v.dashboardId);
    if (index >= 0) store.additionalFees[index] = { ...store.additionalFees[index], ...row };
    else store.additionalFees.push(row);
  });
  done(v.dashboardId);
  return { ok: true, data: undefined };
}

async function deleteAdditionalFeeImpl(dashboardId: string, feeId: string): Promise<ActionResult> {
  const user = await requireUser();
  requireDashboard({ user }, dashboardId, "admin");
  mutate((store) => {
    store.additionalFees = store.additionalFees.filter((f) => !(f.id === feeId && f.dashboardId === dashboardId));
  });
  done(dashboardId);
  return { ok: true, data: undefined };
}

// ---- despesas (S26) ---------------------------------------------------------------------------

const expenseInput = z
  .object({
    dashboardId: z.uuid(),
    expenseId: z.uuid().optional(),
    kind: z.enum(["once", "recurring"]),
    category: z.enum(["traffic", "tools", "staff", "accounting", "other"]),
    description: z.string().trim().min(1, "Descreva a despesa.").max(200, "A descrição pode ter até 200 caracteres."),
    amount: money("Valor", false),
    date: dateKey,
    endDate: dateKey.nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.endDate && v.kind !== "recurring") ctx.addIssue({ code: "custom", message: "Só despesa recorrente tem data final." });
    if (v.endDate && v.endDate < v.date) ctx.addIssue({ code: "custom", message: "A data final vem depois da data de início." });
  });

async function saveExpenseImpl(input: z.input<typeof expenseInput>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = expenseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const { dashboard } = requireDashboard({ user }, v.dashboardId, "admin");
  mutate((store) => {
    const row = {
      id: v.expenseId ?? newId(),
      dashboardId: v.dashboardId,
      kind: v.kind,
      category: v.category as ExpenseCategory,
      description: v.description,
      amountCents: v.amount,
      // Despesa já lançada continua na moeda dela (o formulário mostra essa moeda).
      currency: store.expenses.find((e) => e.id === v.expenseId && e.dashboardId === v.dashboardId)?.currency ?? dashboard.currency,
      date: v.date,
      endDate: v.kind === "recurring" ? v.endDate : null,
      createdBy: user.id,
      createdAt: nowIso(),
    };
    const index = store.expenses.findIndex((e) => e.id === v.expenseId && e.dashboardId === v.dashboardId);
    if (index >= 0) store.expenses[index] = { ...store.expenses[index], ...row, createdAt: store.expenses[index].createdAt };
    else store.expenses.push(row);
  });
  done(v.dashboardId);
  return { ok: true, data: undefined };
}

async function deleteExpenseImpl(dashboardId: string, expenseId: string): Promise<ActionResult> {
  const user = await requireUser();
  requireDashboard({ user }, dashboardId, "admin");
  mutate((store) => {
    store.expenses = store.expenses.filter((e) => !(e.id === expenseId && e.dashboardId === dashboardId));
  });
  done(dashboardId);
  return { ok: true, data: undefined };
}

// ---- modo real (AUTH_MODE=live): cada action roda sobre o retrato do Supabase, com vendas e anúncios (server/live/action.ts) ----

export async function saveCostSettings(...args: Parameters<typeof saveCostSettingsImpl>): ReturnType<typeof saveCostSettingsImpl> {
  return liveTrackingAction(() => saveCostSettingsImpl(...args));
}

export async function setProductCost(...args: Parameters<typeof setProductCostImpl>): ReturnType<typeof setProductCostImpl> {
  return liveTrackingAction(() => setProductCostImpl(...args));
}

export async function upsertAdditionalFee(...args: Parameters<typeof upsertAdditionalFeeImpl>): ReturnType<typeof upsertAdditionalFeeImpl> {
  return liveTrackingAction(() => upsertAdditionalFeeImpl(...args));
}

export async function deleteAdditionalFee(...args: Parameters<typeof deleteAdditionalFeeImpl>): ReturnType<typeof deleteAdditionalFeeImpl> {
  return liveTrackingAction(() => deleteAdditionalFeeImpl(...args));
}

export async function saveExpense(...args: Parameters<typeof saveExpenseImpl>): ReturnType<typeof saveExpenseImpl> {
  return liveTrackingAction(() => saveExpenseImpl(...args));
}

export async function deleteExpense(...args: Parameters<typeof deleteExpenseImpl>): ReturnType<typeof deleteExpenseImpl> {
  return liveTrackingAction(() => deleteExpenseImpl(...args));
}
