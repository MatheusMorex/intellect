import assert from "node:assert/strict";
import { test } from "node:test";

import { attribute, platformOf, readParams, type AdIndex } from "../server/attribution/attribute.ts";
import type { Visit } from "../server/store/types.ts";

const index: AdIndex = {
  findAd: (p, ext) => (p === "meta" && ext === "120A" ? { campaignId: "c1", adSetId: "s1", adId: "a1" } : null),
  findAdSet: (p, ext) => (p === "meta" && ext === "120S" ? { campaignId: "c1", adSetId: "s1" } : null),
  findCampaign: (p, extOrName) => {
    if (p === "meta" && (extOrName === "120C" || extOrName === "[Vendas] Remarketing")) return { campaignId: "c1" };
    if (p === "google" && extOrName === "998877") return { campaignId: "g1" };
    return null;
  },
};

const visit = (landingPage: string | null, utm: Visit["utm"] = {}): Visit => ({
  occurredAt: null,
  landingPage,
  referrerUrl: null,
  source: null,
  utm,
});

test("casa pelo anúncio quando o itl_a existe", () => {
  const r = attribute(
    { firstVisit: null, lastVisit: visit("https://loja.test/p?utm_source=meta&itl_c=120C&itl_s=120S&itl_a=120A") },
    index,
  );
  assert.equal(r.status, "tracked");
  assert.equal(r.platform, "meta");
  assert.deepEqual([r.campaignId, r.adSetId, r.adId], ["c1", "s1", "a1"]);
});

test("cai para o conjunto e depois para a campanha", () => {
  const set = attribute({ firstVisit: null, lastVisit: visit("/p?utm_source=fb&itl_c=120C&itl_s=120S&itl_a=999") }, index);
  assert.deepEqual([set.campaignId, set.adSetId, set.adId], ["c1", "s1", null]);
  const camp = attribute({ firstVisit: null, lastVisit: visit("/p?utm_source=ig&itl_c=120C") }, index);
  assert.deepEqual([camp.campaignId, camp.adSetId, camp.adId], ["c1", null, null]);
});

test("sem itl_*, casa a campanha do Meta pelo nome na utm_campaign", () => {
  const r = attribute(
    { firstVisit: null, lastVisit: visit("/p?utm_source=meta&utm_campaign=%5BVendas%5D%20Remarketing") },
    index,
  );
  assert.equal(r.campaignId, "c1");
});

test("Performance Max: {adgroupid} e {creative} vazios, a venda fica na campanha", () => {
  const r = attribute(
    { firstVisit: null, lastVisit: visit("/?utm_source=google&utm_campaign=998877&itl_c=998877&itl_s=&itl_a={creative}") },
    index,
  );
  assert.equal(r.platform, "google");
  assert.deepEqual([r.campaignId, r.adSetId, r.adId], ["g1", null, null]);
});

test("usa a primeira visita quando falta a última", () => {
  const r = attribute({ firstVisit: visit("/p?utm_source=meta&itl_c=120C"), lastVisit: null }, index);
  assert.equal(r.campaignId, "c1");
});

test("outra origem vira 'outras fontes'; sem nada, 'não rastreada'", () => {
  assert.equal(attribute({ firstVisit: null, lastVisit: visit("/?utm_source=whatsapp") }, index).status, "other_source");
  assert.equal(attribute({ firstVisit: null, lastVisit: visit("/produtos/kit") }, index).status, "untracked");
  assert.equal(attribute(null, index).status, "untracked");
});

test("veio do Meta mas a campanha não está sincronizada: fica no Meta, sem campanha", () => {
  const r = attribute({ firstVisit: null, lastVisit: visit("/?utm_source=meta&itl_c=nao-existe") }, index);
  assert.equal(r.status, "tracked");
  assert.equal(r.platform, "meta");
  assert.equal(r.campaignId, null);
});

test("UTMs da visita servem quando a página de entrada não tem parâmetros", () => {
  const r = attribute(
    { firstVisit: null, lastVisit: visit("/p", { source: "facebook", campaign: "[Vendas] Remarketing" }) },
    index,
  );
  assert.equal(r.campaignId, "c1");
  assert.equal(r.utmSource, "facebook");
});

test("itl_test marca o pedido como teste", () => {
  assert.equal(attribute({ firstVisit: null, lastVisit: visit("/?utm_source=meta&itl_test=1") }, index).isTest, true);
});

test("readParams e platformOf", () => {
  assert.equal(readParams("not a url %%%").get("x"), null);
  assert.equal(readParams("/a?b=1").get("b"), "1");
  assert.equal(platformOf("Instagram"), "meta");
  assert.equal(platformOf("google"), "google");
  assert.equal(platformOf("tiktok"), "other");
  assert.equal(platformOf(null), null);
});
