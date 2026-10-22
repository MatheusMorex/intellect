// npm run simulate:order — manda um pedido falso para o app, assinado como a
// Shopify assina, pela mesma rota que os pedidos de verdade vão usar.
//
// Opções:
//   --campanha "remarketing"   parte do nome da campanha (Meta ou Google) que trouxe a venda
//   --valor 197,00             valor total em reais (padrão: 197,00)
//   --status pago|pendente     situação do pagamento (padrão: pago)
//   --pagamento pix|cartao|boleto
//   --sem-utm                  venda sem rastreio ("não trackeada")
//   --teste CODIGO             pedido de um link de teste de integração (itl_test)
//   --chargeback "#1234"       abre uma disputa (chargeback) num pedido que já existe
//   --ganhou "#1234"           a disputa do pedido foi ganha (volta a pago)
//   --url http://localhost:3000
//
// Precisa do app rodando (npm run dev) e do .env.local com SHOPIFY_WEBHOOK_SECRET.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) env[match[1]] = match[2];
    }
  } catch {
    // sem .env.local
  }
  return env;
}

function args() {
  const out = {};
  const list = process.argv.slice(2);
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item.startsWith("--")) continue;
    const next = list[i + 1];
    if (next && !next.startsWith("--")) {
      out[item.slice(2)] = next;
      i++;
    } else out[item.slice(2)] = true;
  }
  return out;
}

const env = readEnv();
const opts = args();
const secret = env.SHOPIFY_WEBHOOK_SECRET;
if (!secret) {
  console.error("Falta o SHOPIFY_WEBHOOK_SECRET no .env.local. Veja o .env.example.");
  process.exit(1);
}

const storePath = path.join(root, ".data", "store.json");
if (!fs.existsSync(storePath)) {
  console.error("Ainda não há dados de exemplo. Abra o app uma vez (npm run dev) e tente de novo.");
  process.exit(1);
}
const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const shop = store.stores[0];
const accounts = new Map(store.adAccounts.map((a) => [a.id, a]));
const appUrl = (typeof opts.url === "string" ? opts.url : env.APP_URL || "http://localhost:3000") + "/api/webhooks/shopify";

// Disputa (chargeback) num pedido que já existe: --chargeback "#1234" abre, --ganhou "#1234" fecha a favor da loja.
const disputeOf = typeof opts.chargeback === "string" ? opts.chargeback : typeof opts.ganhou === "string" ? opts.ganhou : null;
if (disputeOf) {
  const target = store.orders.find((o) => o.name === disputeOf || o.name === `#${disputeOf.replace(/^#/, "")}`);
  if (!target) {
    console.error(`Nenhum pedido ${disputeOf}. Veja os números na tela de Vendas.`);
    process.exit(1);
  }
  const won = typeof opts.ganhou === "string";
  const now = new Date().toISOString();
  const body = JSON.stringify({
    id: Date.now(),
    order_id: Number(target.externalId.split("/").pop()),
    type: "chargeback",
    status: won ? "won" : "needs_response",
    amount: (target.totalCents / 100).toFixed(2),
    currency: target.currency,
    reason: "fraudulent",
    initiated_at: now,
    finalized_on: won ? now : null,
  });
  const response = await fetch(appUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": won ? "disputes/update" : "disputes/create",
      "x-shopify-hmac-sha256": crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64"),
      "x-shopify-shop-domain": shop.shopDomain,
      "x-shopify-webhook-id": crypto.randomUUID(),
      "x-shopify-triggered-at": now,
    },
    body,
  }).catch((error) => {
    console.error(`Não consegui falar com o app em ${appUrl}. Ele está rodando (npm run dev)?\n${error.message}`);
    process.exit(1);
  });
  console.log(`${won ? "Disputa ganha" : "Chargeback aberto"} no pedido ${target.name}. Resposta do app: ${response.status}${response.status === 200 ? " (recebido)" : ""}.`);
  process.exit(0);
}

const search = typeof opts.campanha === "string" ? opts.campanha.toLowerCase() : null;
const activeCampaigns = store.campaigns.filter((c) => (search ? c.name.toLowerCase().includes(search) : c.status === "active"));
if (search && activeCampaigns.length === 0) {
  console.error(`Nenhuma campanha com "${opts.campanha}" no nome. Campanhas: ${store.campaigns.map((c) => c.name).join("; ")}`);
  process.exit(1);
}
const campaign = activeCampaigns[Math.floor(Math.random() * activeCampaigns.length)];
const account = accounts.get(campaign.adAccountId);
const campaignAds = store.ads.filter((a) => a.campaignId === campaign.id);
const ad = campaignAds.length ? campaignAds[Math.floor(Math.random() * campaignAds.length)] : null;
const adSet = ad ? store.adSets.find((s) => s.id === ad.adSetId) : null;

const shopUrl = `https://${shop.shopDomain}`;
let landingPage;
let utm = {};
if (opts["sem-utm"]) {
  landingPage = `${shopUrl}/products/kit-completo`;
} else if (account.provider === "meta") {
  utm = { source: "meta", medium: "paid", campaign: campaign.name, term: adSet?.name, content: ad?.name };
  const q = new URLSearchParams({
    utm_source: "meta",
    utm_medium: "paid",
    utm_campaign: campaign.name,
    utm_term: adSet?.name ?? "",
    utm_content: ad?.name ?? "",
    itl_c: campaign.externalId,
    itl_s: adSet?.externalId ?? "",
    itl_a: ad?.externalId ?? "",
    itl_p: "Instagram_Feed",
  });
  landingPage = `${shopUrl}/products/kit-essencial?${q}`;
} else {
  utm = { source: "google", medium: "cpc", campaign: campaign.externalId };
  const q = new URLSearchParams({
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: campaign.externalId,
    utm_content: ad?.externalId ?? "",
    itl_c: campaign.externalId,
    itl_s: adSet?.externalId ?? "",
    itl_a: ad?.externalId ?? "",
  });
  landingPage = `${shopUrl}/?${q}`;
}

if (typeof opts.teste === "string") {
  const url = new URL(landingPage);
  url.searchParams.set("itl_test", opts.teste);
  landingPage = url.toString();
}

const value = typeof opts.valor === "string" ? Number(opts.valor.replace(/\./g, "").replace(",", ".")) : 197;
if (!Number.isFinite(value) || value <= 0) {
  console.error('Valor inválido. Use, por exemplo: --valor 197,00');
  process.exit(1);
}
const paid = opts.status !== "pendente";
const gateway = { pix: "pix", boleto: "boleto", cartao: "shopify_payments" }[opts.pagamento] ?? (paid ? "pix" : "boleto");

const nextNumber = 1001 + store.orders.length + Math.floor(Math.random() * 50);
const numericId = Date.now();
const gid = `gid://shopify/Order/${numericId}`;
const nowIso = new Date().toISOString();

// A jornada que a Shopify guardaria; a integração simulada lê daqui.
const fakePath = path.join(root, ".data", "fake-shopify.json");
const fake = fs.existsSync(fakePath) ? JSON.parse(fs.readFileSync(fakePath, "utf8")) : { journeys: {} };
const visit = {
  occurredAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  landingPage,
  referrerUrl: null,
  source: utm.source ?? null,
  utm,
};
fake.journeys[gid] = { firstVisit: visit, lastVisit: visit, daysToConversion: 0 };
fs.writeFileSync(fakePath, JSON.stringify(fake, null, 2));

const amount = value.toFixed(2);
const order = {
  id: numericId,
  admin_graphql_api_id: gid,
  name: `#${nextNumber}`,
  created_at: nowIso,
  updated_at: nowIso,
  processed_at: nowIso,
  cancelled_at: null,
  financial_status: paid ? "paid" : "pending",
  currency: "BRL",
  total_price: amount,
  subtotal_price: amount,
  total_tax: "0.00",
  total_discounts: "0.00",
  total_shipping_price_set: { shop_money: { amount: "0.00", currency_code: "BRL" } },
  payment_gateway_names: [gateway],
  test: false,
  line_items: [{ id: numericId + 1, product_id: 8400100, title: "Kit Essencial", quantity: 1, price: amount }],
  refunds: [],
};

const body = JSON.stringify(order);
const hmac = crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
const response = await fetch(appUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-shopify-topic": paid ? "orders/paid" : "orders/create",
    "x-shopify-hmac-sha256": hmac,
    "x-shopify-shop-domain": shop.shopDomain,
    "x-shopify-webhook-id": crypto.randomUUID(),
    "x-shopify-triggered-at": nowIso,
  },
  body,
}).catch((error) => {
  console.error(`Não consegui falar com o app em ${appUrl}. Ele está rodando (npm run dev)?\n${error.message}`);
  process.exit(1);
});

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const origin = opts["sem-utm"] ? "sem rastreio" : `${account.provider === "meta" ? "Meta" : "Google"} · ${campaign.name}`;
console.log(`Pedido ${order.name} enviado: ${money}, ${paid ? "pago" : "pendente"}, ${origin}.`);
console.log(`Resposta do app: ${response.status}${response.status === 200 ? " (recebido)" : ""}.`);
if (response.status !== 200) console.log(await response.text());
