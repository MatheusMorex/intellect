// Dados de exemplo para construir e testar as telas sem conta real.
// Tudo é fictício: pessoas, loja (domínio .myshopify.com inventado), contas de
// anúncio e pedidos. O gerador é determinístico (mesma semente, mesmos ids),
// então os endereços das telas não mudam quando o seed roda de novo.

import crypto from "node:crypto";

import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import { generateNKeysBetween } from "fractional-indexing";

import type {
  AdAccountRow,
  AdConnectionRow,
  KeywordInsightRow,
  KeywordRow,
  AdInsightRow,
  AdRow,
  AdSetRow,
  CampaignRow,
  CardRow,
  OrderRow,
  PaymentMethod,
  Store,
  Visit,
} from "./types";

export const STORE_VERSION = 2;
export const SEED_TIMEZONE = "America/Sao_Paulo";
const DAYS = 90;

// Gerador pseudoaleatório com semente (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function createSeed(now: Date): Store {
  const random = rng(20261012);
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const between = (min: number, max: number) => min + random() * (max - min);
  // UUIDs estáveis, derivados da semente.
  const id = () => {
    const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };

  const tz = SEED_TIMEZONE;
  const today = new TZDate(now.getTime(), tz);
  const seededAt = now.toISOString();
  const iso = (date: Date) => new Date(date.getTime()).toISOString();
  const dayStart = (offset: number) => {
    const d = addDays(today, -offset);
    return new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, tz);
  };
  const dayKey = (offset: number) => format(dayStart(offset), "yyyy-MM-dd");

  const demoPassword = process.env.DEMO_PASSWORD || crypto.randomBytes(18).toString("base64url");

  // Pessoas e workspace -------------------------------------------------------
  const users = [
    { name: "Ana Lima", email: "ana@intellect.test", username: "ana", avatarColor: "purple" },
    { name: "Bruno Rocha", email: "bruno@intellect.test", username: "bruno", avatarColor: "sky" },
    { name: "Carla Souza", email: "carla@intellect.test", username: "carla", avatarColor: "orange" },
  ].map((u) => ({
    id: id(),
    ...u,
    timezone: tz,
    theme: "system" as const,
    passwordHash: hashPassword(demoPassword),
  }));
  const [ana, bruno, carla] = users;

  const workspace = { id: id(), name: "INtellect", slug: "intellect", createdAt: seededAt };
  const workspaceMembers = [
    { id: id(), workspaceId: workspace.id, userId: ana.id, role: "admin" as const },
    { id: id(), workspaceId: workspace.id, userId: bruno.id, role: "normal" as const },
    { id: id(), workspaceId: workspace.id, userId: carla.id, role: "normal" as const },
  ];

  const dashboard = {
    id: id(),
    workspaceId: workspace.id,
    name: "Loja principal",
    timezone: tz,
    currency: "BRL",
    revenueBasis: "net" as const,
    includeInterest: false,
    revenueGoalCents: 15_000_000,
    adPlatforms: ["meta", "google"] as ("meta" | "google")[],
  };

  // Contas, campanhas, conjuntos e anúncios -------------------------------------
  const lastSyncedAt = new Date(now.getTime() - 8 * 60 * 1000).toISOString();
  const connections: AdConnectionRow[] = [
    {
      id: id(),
      workspaceId: workspace.id,
      provider: "meta",
      externalUserId: "10229384756610",
      externalUserName: "Ana Lima",
      tokenExpiresAt: new Date(now.getTime() + 41 * 86_400_000).toISOString(),
      status: "active",
      lastError: null,
      createdBy: ana.id,
      createdAt: seededAt,
    },
    {
      id: id(),
      workspaceId: workspace.id,
      provider: "google",
      externalUserId: "ana@intellect.test",
      externalUserName: "Ana Lima",
      tokenExpiresAt: null,
      status: "active",
      lastError: null,
      createdBy: ana.id,
      createdAt: seededAt,
    },
  ];
  const meta: AdAccountRow = {
    id: id(),
    workspaceId: workspace.id,
    provider: "meta" as const,
    externalId: "act_7310482265",
    name: "INtellect · Conta principal",
    currency: "BRL",
    timezone: tz,
    status: "active" as const,
    connectionId: connections[0].id,
    syncEnabled: true,
    lastSyncedAt,
    lastSyncError: null,
  };
  const google: AdAccountRow = {
    id: id(),
    workspaceId: workspace.id,
    provider: "google" as const,
    externalId: "5839201746",
    name: "INtellect Ads",
    currency: "BRL",
    timezone: tz,
    status: "active" as const,
    connectionId: connections[1].id,
    syncEnabled: true,
    lastSyncedAt,
    lastSyncError: null,
  };

  type Plan = {
    account: AdAccountRow;
    name: string;
    status: CampaignRow["status"];
    channelType: string | null;
    dailyBudgetCents: number;
    roas: number; // retorno médio que o seed tenta produzir
    targetCpaCents?: number;
    keywords?: string[];
    adSets: { name: string; ads: string[] }[];
    pausedDaysAgo?: number;
  };

  const plans: Plan[] = [
    {
      account: meta,
      name: "[Vendas] Kit Essencial · Público frio",
      status: "active",
      channelType: null,
      dailyBudgetCents: 18_000,
      roas: 1.5,
      adSets: [
        { name: "Aberto 25-45", ads: ["Vídeo depoimento v2", "Carrossel benefícios"] },
        { name: "Interesses produtividade", ads: ["Vídeo depoimento v2", "Imagem oferta"] },
      ],
    },
    {
      account: meta,
      name: "[Vendas] Remarketing 30d",
      status: "active",
      channelType: null,
      dailyBudgetCents: 9_000,
      roas: 4.1,
      adSets: [
        { name: "Visitou produto 30d", ads: ["Carrossel prova social", "Vídeo curto oferta"] },
        { name: "Adicionou ao carrinho 14d", ads: ["Imagem cupom"] },
      ],
    },
    {
      account: meta,
      name: "[Vendas] Semelhantes a compradores 1%",
      status: "active",
      channelType: null,
      dailyBudgetCents: 15_000,
      roas: 2.3,
      adSets: [{ name: "Semelhantes 1% BR", ads: ["Vídeo unboxing", "Carrossel benefícios"] }],
    },
    {
      account: meta,
      name: "[Teste] Criativos UGC",
      status: "paused",
      channelType: null,
      dailyBudgetCents: 6_000,
      roas: 0.8,
      pausedDaysAgo: 20,
      adSets: [{ name: "Aberto 18-55", ads: ["UGC unboxing", "UGC antes e depois"] }],
    },
    {
      account: google,
      name: "Pesquisa · Marca",
      status: "active",
      channelType: "SEARCH",
      dailyBudgetCents: 4_000,
      roas: 6.2,
      keywords: ["intellect", "intellect kit"],
      adSets: [{ name: "Marca exata", ads: ["Anúncio responsivo marca"] }],
    },
    {
      account: google,
      name: "Pesquisa · Genérica",
      status: "active",
      channelType: "SEARCH",
      dailyBudgetCents: 12_000,
      roas: 1.3,
      targetCpaCents: 9_000,
      keywords: ["kit produtividade", "planner semanal", "como ser mais produtivo", "agenda de metas"],
      adSets: [{ name: "Kit produtividade", ads: ["Anúncio responsivo A", "Anúncio responsivo B"] }],
    },
    {
      account: google,
      name: "Performance Max · Loja",
      status: "active",
      channelType: "PERFORMANCE_MAX",
      dailyBudgetCents: 15_000,
      roas: 2.1,
      adSets: [],
    },
  ];

  const campaigns: CampaignRow[] = [];
  const adSets: AdSetRow[] = [];
  const ads: AdRow[] = [];
  const insights: AdInsightRow[] = [];
  const keywords: KeywordRow[] = [];
  const keywordInsights: KeywordInsightRow[] = [];
  let externalCounter = 120_210_000_000;
  const nextExternal = () => String(externalCounter++ * 7 + 13);

  type Target = { plan: Plan; campaign: CampaignRow; adSet: AdSetRow | null; ad: AdRow | null };
  const targets: Target[] = [];

  for (const plan of plans) {
    const campaign: CampaignRow = {
      id: id(),
      adAccountId: plan.account.id,
      externalId: plan.account.provider === "meta" ? `120${nextExternal()}` : nextExternal().slice(0, 11),
      name: plan.name,
      status: plan.status,
      channelType: plan.channelType,
      dailyBudgetCents: plan.dailyBudgetCents,
      targetCpaCents: plan.targetCpaCents ?? null,
    };
    campaigns.push(campaign);
    if (plan.adSets.length === 0) {
      targets.push({ plan, campaign, adSet: null, ad: null });
      continue;
    }
    for (const setPlan of plan.adSets) {
      const adSet: AdSetRow = {
        id: id(),
        adAccountId: plan.account.id,
        campaignId: campaign.id,
        externalId: plan.account.provider === "meta" ? `120${nextExternal()}` : nextExternal().slice(0, 11),
        name: setPlan.name,
        status: plan.status,
        dailyBudgetCents: null,
      };
      adSets.push(adSet);
      for (const [k, text] of (plan.keywords ?? []).entries()) {
        keywords.push({
          id: id(),
          adAccountId: plan.account.id,
          campaignId: campaign.id,
          adSetId: adSet.id,
          externalId: String(39_000_000_000 + keywords.length * 13 + k),
          text,
          matchType: k === 0 ? "exact" : k % 2 ? "phrase" : "broad",
          status: "active",
        });
      }
      for (const adName of setPlan.ads) {
        const ad: AdRow = {
          id: id(),
          adAccountId: plan.account.id,
          campaignId: campaign.id,
          adSetId: adSet.id,
          externalId: plan.account.provider === "meta" ? `120${nextExternal()}` : nextExternal().slice(0, 12),
          name: adName,
          status: plan.status,
        };
        ads.push(ad);
        targets.push({ plan, campaign, adSet, ad });
      }
    }
  }

  // Gasto diário: uma linha por anúncio e por dia (campanha, no Performance Max).
  const spendByTargetDay = new Map<string, number>();
  for (let offset = DAYS - 1; offset >= 0; offset--) {
    const weekday = dayStart(offset).getDay();
    const weekFactor = weekday === 0 || weekday === 6 ? 0.85 : 1;
    for (const target of targets) {
      const { plan } = target;
      if (plan.pausedDaysAgo !== undefined && offset < plan.pausedDaysAgo) continue;
      const share = target.ad ? 1 / targets.filter((t) => t.campaign === target.campaign).length : 1;
      const todayFactor = offset === 0 ? Math.min(1, (today.getHours() + today.getMinutes() / 60) / 24 + 0.05) : 1;
      const spend = Math.round(plan.dailyBudgetCents * share * between(0.7, 1.15) * weekFactor * todayFactor);
      if (spend <= 0) continue;
      const cpm = between(2_200, 4_000); // centavos por mil impressões
      const impressions = Math.round((spend / cpm) * 1000);
      const clicks = Math.round(impressions * between(0.009, 0.024));
      insights.push({
        id: id(),
        adAccountId: plan.account.id,
        campaignId: target.campaign.id,
        adSetId: target.adSet?.id ?? null,
        adId: target.ad?.id ?? null,
        date: dayKey(offset),
        currency: "BRL",
        spendCents: spend,
        impressions,
        clicks,
        addToCarts: Math.round(clicks * between(0.05, 0.11)),
      });
      spendByTargetDay.set(`${targets.indexOf(target)}:${offset}`, spend);
    }
    // Palavras-chave: dividem o gasto do grupo; ficam fora dos totais (architecture.md).
    for (const adSet of adSets) {
      const words = keywords.filter((k) => k.adSetId === adSet.id);
      if (!words.length) continue;
      const setSpend = insights
        .filter((i) => i.adSetId === adSet.id && i.date === dayKey(offset))
        .reduce((sum, i) => sum + i.spendCents, 0);
      const weights = words.map((_, i) => (i === 0 ? 3 : 1) * between(0.6, 1.4));
      const total = weights.reduce((a, b) => a + b, 0);
      words.forEach((word, i) => {
        const spend = Math.round((setSpend * weights[i]) / total);
        if (spend <= 0) return;
        const impressions = Math.round((spend / between(1_500, 3_000)) * 1000);
        keywordInsights.push({
          id: id(),
          keywordId: word.id,
          date: dayKey(offset),
          currency: "BRL",
          spendCents: spend,
          impressions,
          clicks: Math.round(impressions * between(0.03, 0.09)),
        });
      });
    }
  }

  // Loja, produtos e pedidos ------------------------------------------------------
  const store = {
    id: id(),
    workspaceId: workspace.id,
    platform: "shopify" as const,
    shopDomain: "intellect-loja-demo.myshopify.com",
    name: "INtellect (loja de demonstração)",
    currency: "BRL",
    timezone: tz,
    status: "active" as const,
    webhooksOk: true,
    lastEventAt: null as string | null,
  };

  const products = [
    { name: "Kit Essencial", priceCents: 14_700 },
    { name: "Kit Completo", priceCents: 29_700 },
    { name: "Assinatura mensal", priceCents: 4_900 },
    { name: "Guia digital", priceCents: 3_700 },
  ].map((p, i) => ({
    row: { id: id(), workspaceId: workspace.id, storeId: store.id, externalId: `gid://shopify/Product/${8_400_100 + i}`, name: p.name },
    priceCents: p.priceCents,
  }));

  type Draft = { placedAt: Date; target: Target | null; kind: "tracked" | "other" | "untracked" };
  const drafts: Draft[] = [];
  for (let offset = DAYS - 1; offset >= 0; offset--) {
    const start = dayStart(offset);
    const hoursSoFar = offset === 0 ? today.getHours() + today.getMinutes() / 60 : 24;
    const randomTime = () => {
      const hour = Math.min(hoursSoFar - 0.01, between(7, 23.9) * (hoursSoFar / 24));
      return new Date(start.getTime() + Math.max(0, hour) * 3600 * 1000);
    };
    targets.forEach((target, index) => {
      const spend = spendByTargetDay.get(`${index}:${offset}`);
      if (!spend) return;
      // Receita esperada / ticket médio, com sorteio para não ficar redondo.
      const expected = (spend * target.plan.roas) / 19_000;
      let count = Math.floor(expected);
      if (random() < expected - count) count++;
      for (let i = 0; i < count; i++) drafts.push({ placedAt: randomTime(), target, kind: "tracked" });
    });
    const organic = Math.round(between(0, 3) * (hoursSoFar / 24));
    for (let i = 0; i < organic; i++) drafts.push({ placedAt: randomTime(), target: null, kind: "other" });
    if (random() < 0.7 * (hoursSoFar / 24)) drafts.push({ placedAt: randomTime(), target: null, kind: "untracked" });
  }
  drafts.sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());

  const orders: OrderRow[] = [];
  const orderItems: Store["orderItems"] = [];
  const orderEvents: Store["orderEvents"] = [];
  const shop = `https://${store.shopDomain}`;

  drafts.forEach((draft, index) => {
    const number = 1001 + index;
    const method: PaymentMethod = pick(["pix", "pix", "pix", "credit_card", "credit_card", "credit_card", "boleto"]);
    const lines = random() < 0.25 ? 2 : 1;
    const chosen = new Set<number>();
    while (chosen.size < lines) chosen.add(random() < 0.55 ? 0 : Math.floor(random() * products.length));
    let total = 0;
    const orderId = id();
    for (const p of chosen) {
      const product = products[p];
      const quantity = random() < 0.1 ? 2 : 1;
      total += product.priceCents * quantity;
      orderItems.push({
        id: id(),
        orderId,
        productId: product.row.id,
        externalLineId: String(15_000_000 + orderItems.length),
        name: product.row.name,
        quantity,
        unitPriceCents: product.priceCents,
        totalCents: product.priceCents * quantity,
      });
    }
    const shipping = total < 20_000 ? 1_990 : 0;
    total += shipping;

    const ageHours = (now.getTime() - draft.placedAt.getTime()) / 3_600_000;
    const roll = random();
    let status: OrderRow["status"] = "paid";
    if (method !== "credit_card" && ageHours < 48 && roll < 0.35) status = "waiting_payment";
    else if (method === "credit_card" && roll < 0.06) status = "refused";
    else if (roll > 0.965) status = "refunded";
    else if (roll > 0.955 && method === "credit_card") status = "chargedback";

    const fee =
      status === "paid"
        ? method === "credit_card"
          ? Math.round(total * 0.0399)
          : method === "pix"
            ? Math.round(total * 0.0099)
            : 349
        : null;

    let landingPage: string | null = null;
    let attribution: Pick<OrderRow, "attributionStatus" | "attributedPlatform" | "campaignId" | "adSetId" | "adId"> = {
      attributionStatus: "untracked",
      attributedPlatform: null,
      campaignId: null,
      adSetId: null,
      adId: null,
    };
    let utm: Visit["utm"] = {};
    const target = draft.target;
    if (draft.kind === "tracked" && target) {
      const provider = target.plan.account.provider;
      if (provider === "meta") {
        utm = {
          source: "meta",
          medium: "paid",
          campaign: target.campaign.name,
          term: target.adSet?.name,
          content: target.ad?.name,
        };
        const q = new URLSearchParams({
          utm_source: "meta",
          utm_medium: "paid",
          utm_campaign: target.campaign.name,
          utm_term: target.adSet?.name ?? "",
          utm_content: target.ad?.name ?? "",
          itl_c: target.campaign.externalId,
          itl_s: target.adSet?.externalId ?? "",
          itl_a: target.ad?.externalId ?? "",
          itl_p: pick(["Facebook_Mobile_Feed", "Instagram_Feed", "Instagram_Stories", "Instagram_Reels"]),
        });
        landingPage = `${shop}/products/kit-essencial?${q}`;
      } else {
        utm = { source: "google", medium: "cpc", campaign: target.campaign.externalId };
        const q = new URLSearchParams({
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: target.campaign.externalId,
          utm_content: target.ad?.externalId ?? "",
          utm_term: target.ad ? pick(["kit produtividade", "planner", "intellect kit"]) : "",
          itl_c: target.campaign.externalId,
          itl_s: target.adSet?.externalId ?? "",
          itl_a: target.ad?.externalId ?? "",
        });
        landingPage = `${shop}/?${q}`;
      }
      attribution = {
        attributionStatus: "tracked",
        attributedPlatform: provider,
        campaignId: target.campaign.id,
        adSetId: target.adSet?.id ?? null,
        adId: target.ad?.id ?? null,
      };
    } else if (draft.kind === "other") {
      const source = pick(["instagram_bio", "whatsapp", "email", "youtube"]);
      utm = { source, medium: "organic" };
      landingPage = `${shop}/?utm_source=${source}&utm_medium=organic`;
      attribution = { ...attribution, attributionStatus: "other_source" };
    } else {
      landingPage = `${shop}/products/kit-completo`;
    }

    const visit: Visit = {
      occurredAt: new Date(draft.placedAt.getTime() - between(2, 40) * 60_000).toISOString(),
      landingPage,
      referrerUrl: null,
      source: utm.source ?? null,
      utm,
    };
    const placedAt = iso(draft.placedAt);
    const paidAt = status === "paid" || status === "refunded" || status === "chargedback" ? placedAt : null;

    orders.push({
      id: orderId,
      workspaceId: workspace.id,
      storeId: store.id,
      externalId: `gid://shopify/Order/${6_100_000_000 + number}`,
      name: `#${number}`,
      status,
      paymentMethod: method,
      currency: "BRL",
      totalCents: total,
      subtotalCents: total - shipping,
      shippingCents: shipping,
      taxCents: 0,
      discountCents: 0,
      refundedCents: status === "refunded" ? total : 0,
      gatewayFeeCents: fee,
      interestCents: 0,
      isTest: false,
      placedAt,
      paidAt,
      sourceUpdatedAt: placedAt,
      firstVisit: visit,
      lastVisit: visit,
      landingPage,
      daysToConversion: Math.floor(between(0, 4)),
      utmSource: utm.source ?? null,
      utmMedium: utm.medium ?? null,
      utmCampaign: utm.campaign ?? null,
      utmContent: utm.content ?? null,
      utmTerm: utm.term ?? null,
      src: null,
      sck: null,
      ...attribution,
      createdAt: placedAt,
    });
    orderEvents.push({ id: id(), orderId, status, occurredAt: placedAt, topic: "orders/create", webhookDeliveryId: null });
  });
  store.lastEventAt = orders.at(-1)?.placedAt ?? null;

  // Quadro de exemplo ---------------------------------------------------------------
  const board = {
    id: id(),
    workspaceId: workspace.id,
    name: "Campanhas e criativos",
    description: "Quadro de exemplo: o trabalho do time de tráfego.",
    background: { type: "color" as const, value: "purple" },
    visibility: "workspace" as const,
    nextCardNumber: 1,
    closedAt: null,
    createdBy: ana.id,
    createdAt: seededAt,
  };
  const boardMembers = [
    { id: id(), boardId: board.id, userId: ana.id, role: "admin" as const },
    { id: id(), boardId: board.id, userId: bruno.id, role: "normal" as const },
    { id: id(), boardId: board.id, userId: carla.id, role: "normal" as const },
  ];
  const listNames = ["Ideias", "A fazer", "Em andamento", "Feito"];
  const listRanks = generateNKeysBetween(null, null, listNames.length);
  const lists = listNames.map((name, i) => ({
    id: id(),
    boardId: board.id,
    name,
    rank: listRanks[i],
    color: null,
    archivedAt: null,
  }));

  const at = (days: number, hour = 18) => {
    const d = addDays(today, days);
    return iso(new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, tz));
  };
  const cardPlans: { list: number; name: string; due?: string; done?: boolean; cover?: string; link?: string }[] = [
    { list: 0, name: "Testar frete grátis acima de R$ 200" },
    { list: 0, name: "Roteiro de vídeo com depoimento de cliente" },
    { list: 1, name: "Gravar 3 vídeos para o público frio", due: at(2), cover: "orange" },
    { list: 1, name: "Revisar a página do Kit Completo", due: at(-1) },
    { list: 1, name: "Criar público semelhante a partir dos compradores de 90 dias" },
    { list: 2, name: "Escalar o Remarketing 30d", due: at(0, 23), link: "[Vendas] Remarketing 30d" },
    { list: 2, name: "Ajustar lances da Pesquisa Genérica", link: "Pesquisa · Genérica" },
    { list: 3, name: "Configurar os parâmetros de URL no Meta", due: at(-4), done: true },
    { list: 3, name: "Instalar o app da Shopify", due: at(-6), done: true },
  ];
  const cards: CardRow[] = [];
  const cardLinks: Store["cardLinks"] = [];
  for (const [listIndex, list] of lists.entries()) {
    const plansHere = cardPlans.filter((c) => c.list === listIndex);
    const ranks = generateNKeysBetween(null, null, plansHere.length);
    plansHere.forEach((plan, i) => {
      const card: CardRow = {
        id: id(),
        boardId: board.id,
        listId: list.id,
        number: board.nextCardNumber++,
        name: plan.name,
        descriptionText: "",
        rank: ranks[i],
        startAt: null,
        dueAt: plan.due ?? null,
        dueComplete: plan.done ?? false,
        cover: plan.cover ? { color: plan.cover } : null,
        createdBy: ana.id,
        lastActivityAt: seededAt,
        archivedAt: null,
        createdAt: seededAt,
      };
      cards.push(card);
      const linked = plan.link ? campaigns.find((c) => c.name === plan.link) : undefined;
      if (linked) {
        cardLinks.push({
          id: id(),
          cardId: card.id,
          dashboardId: dashboard.id,
          targetType: "campaign",
          campaignId: linked.id,
          adSetId: null,
          adId: null,
          productId: null,
          createdBy: ana.id,
          createdAt: seededAt,
        });
      }
    });
  }

  // Custos -------------------------------------------------------------------------
  const startKey = dayKey(DAYS - 1);
  const costSettings = [
    {
      id: id(),
      dashboardId: dashboard.id,
      validFrom: startKey,
      salesTaxBp: 600,
      metaAdsTaxBp: 1_215,
      extraTaxes: [] as { name: string; bp: number }[],
      createdBy: ana.id,
      createdAt: seededAt,
    },
  ];
  const unitCosts = [4_800, 9_900, 900, 0];
  const productCosts = products.map((p, i) => ({
    id: id(),
    productId: p.row.id,
    costCents: unitCosts[i] ?? 0,
    currency: "BRL",
    validFrom: startKey,
    createdBy: ana.id,
    createdAt: seededAt,
  }));
  const additionalFees = [
    {
      id: id(),
      dashboardId: dashboard.id,
      name: "Embalagem e brinde",
      kind: "fixed" as const,
      amountCents: 350,
      bp: null,
      scope: "product" as const,
      productId: products[1].row.id,
      paymentMethod: null,
      validFrom: startKey,
      validUntil: null,
      createdBy: ana.id,
      createdAt: seededAt,
    },
  ];
  const monthDay = (back: number) =>
    format(new TZDate(today.getFullYear(), today.getMonth() - back, 5, 0, 0, 0, tz), "yyyy-MM-dd");
  const expenses = [
    { kind: "recurring" as const, category: "tools" as const, description: "Ferramentas de e-mail e design", amountCents: 29_700, date: monthDay(3) },
    { kind: "recurring" as const, category: "accounting" as const, description: "Contabilidade", amountCents: 45_000, date: monthDay(3) },
    { kind: "recurring" as const, category: "staff" as const, description: "Freelancer de edição de vídeo", amountCents: 120_000, date: monthDay(2) },
    { kind: "once" as const, category: "traffic" as const, description: "Gravação de vídeos com criadora UGC", amountCents: 180_000, date: dayKey(18) },
  ].map((e) => ({ id: id(), dashboardId: dashboard.id, currency: "BRL", endDate: null, createdBy: ana.id, createdAt: seededAt, ...e }));

  return {
    version: STORE_VERSION,
    seededAt,
    users,
    workspaces: [workspace],
    workspaceMembers,
    dashboards: [dashboard],
    adConnections: connections,
    adAccounts: [meta, google],
    dashboardAdAccounts: [meta, google].map((a) => ({ id: id(), dashboardId: dashboard.id, adAccountId: a.id })),
    campaigns,
    adSets,
    ads,
    adInsightsDaily: insights,
    keywords,
    keywordInsightsDaily: keywordInsights,
    stores: [store],
    dashboardStores: [{ id: id(), dashboardId: dashboard.id, storeId: store.id }],
    webhookDeliveries: [],
    products: products.map((p) => p.row),
    orders,
    orderItems,
    orderEvents,
    costSettings,
    productCosts,
    additionalFees,
    expenses,
    integrationTests: [],
    boards: [board],
    boardMembers,
    lists,
    cards,
    cardLinks,
    activities: [],
  };
}
