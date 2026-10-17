import assert from "node:assert/strict";
import { test } from "node:test";

import { COMPONENTS, getMetric, metricBySlug, metricComponents, METRICS, metricSupportsDimension } from "../../lib/charts/catalog.ts";

test("cada métrica tem identificador e nome de fórmula únicos e válidos", () => {
  const ids = new Set(METRICS.map((m) => m.id));
  const slugs = new Set(METRICS.map((m) => m.slug));
  assert.equal(ids.size, METRICS.length);
  assert.equal(slugs.size, METRICS.length);
  for (const m of METRICS) {
    assert.match(m.slug, /^[a-z][a-z0-9_]*$/, m.id);
    assert.equal(metricBySlug(m.slug)?.id, m.id);
  }
});

test("cada métrica tem nome, explicação, para que serve e fórmula em português", () => {
  for (const m of METRICS) {
    for (const field of ["label", "explain", "purpose", "formula"] as const) {
      assert.ok(m.info[field].trim().length > 0, `${m.id}.${field}`);
    }
  }
});

test("as peças usadas existem e as taxas têm divisor", () => {
  const known = new Set<string>(COMPONENTS);
  for (const m of METRICS) {
    for (const c of metricComponents(m)) assert.ok(known.has(c), `${m.id}: ${c}`);
    if (m.kind === "rate") assert.ok(m.denominator.plus.length > 0, m.id);
  }
});

test("taxas nunca são somáveis; o sentido de cada uma está certo", () => {
  for (const id of ["roas", "roi", "cpa", "cpc", "cpm", "ctr", "ticket", "margin", "clickConversion", "refundRate", "chargebackRate"] as const) {
    assert.equal(getMetric(id).kind, "rate", id);
  }
  for (const id of ["gross", "net", "profit", "paid", "orders", "spend", "clicks", "impressions", "refundedValue"] as const) {
    assert.equal(getMetric(id).kind, "sum", id);
  }
  assert.equal(getMetric("cpa").direction, "down");
  assert.equal(getMetric("cpc").direction, "down");
  assert.equal(getMetric("cpm").direction, "down");
  assert.equal(getMetric("refundRate").direction, "down");
  assert.equal(getMetric("roas").direction, "up");
  assert.equal(getMetric("spend").direction, "neutral");
  assert.equal(getMetric("clickConversion").info.label, "Conversão por clique");
  assert.equal(getMetric("roas").format, "multiplier");
});

test("dimensões: gasto não se divide por produto nem por UTM, só por campanha, conta e plataforma", () => {
  assert.equal(metricSupportsDimension(getMetric("roas"), "campaign"), true);
  assert.equal(metricSupportsDimension(getMetric("roas"), "platform"), true);
  assert.equal(metricSupportsDimension(getMetric("roas"), "product"), false);
  assert.equal(metricSupportsDimension(getMetric("roas"), "utmSource"), false);
  assert.equal(metricSupportsDimension(getMetric("gross"), "product"), true);
  assert.equal(metricSupportsDimension(getMetric("gross"), "utmCampaign"), true);
  assert.equal(metricSupportsDimension(getMetric("ticket"), "paymentMethod"), true);
  assert.equal(metricSupportsDimension(getMetric("ctr"), "product"), false);
  // Lucro usa gasto e impostos: por campanha sim, por produto não.
  assert.equal(metricSupportsDimension(getMetric("profit"), "campaign"), true);
  assert.equal(metricSupportsDimension(getMetric("profit"), "product"), false);
});
