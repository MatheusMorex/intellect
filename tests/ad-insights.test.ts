import assert from "node:assert/strict";
import { test } from "node:test";

import { adInsights, roundReach, sentenceText, type InsightInput, type InsightMetrics } from "../lib/ad-insights.ts";
import { adFormatFromName, combineReach, hash01, reachFromImpressions, simulatedAudience, simulatedVideoMetrics } from "../server/ads/simulation.ts";

const metrics = (over: Partial<InsightMetrics> = {}): InsightMetrics => ({
  spendCents: 300_000,
  impressions: 60_000,
  reach: 17_143,
  frequency: 3.5,
  clicks: 900,
  ctr: 0.015,
  cpmCents: 5_000,
  cpcCents: 333,
  sales: 30,
  cpaCents: 10_000,
  revenueCents: 900_000,
  roas: 3,
  videoViews: 18_000,
  hookRate: 0.3,
  holdRate: 0.2,
  targetCpaCents: null,
  ...over,
});

const input = (over: Partial<InsightInput> = {}, m: Partial<InsightMetrics> = {}, b: Partial<InsightMetrics> = {}): InsightInput => ({
  provider: "meta",
  level: "anuncios",
  metrics: metrics(m),
  baseline: metrics(b),
  compare: true,
  currency: "BRL",
  days: 30,
  ...over,
});

const texts = (i: InsightInput) => adInsights(i).map(sentenceText);

test("frase de alcance e frequência no formato do exemplo, com referência de 2 a 3", () => {
  const t = texts(input());
  assert.equal(t[0], "As impressões do seu anúncio na Meta foram de 60.000, com uma frequência de 3,5, ou seja, o alcance é de praticamente 17.100 pessoas.");
  assert.match(t[1], /^Considere que com uma frequência de 2 a 3 suas conversões em vendas podem aumentar: acima disso/);
});

test("frequência baixa só vira sugestão em período de 7 dias ou mais", () => {
  const low = { frequency: 1.4, reach: 42_857 };
  assert.ok(texts(input({ days: 30 }, low)).some((s) => s.startsWith("Considere que com uma frequência de 2 a 3") && s.includes("algumas vezes")));
  assert.ok(!texts(input({ days: 1 }, low)).some((s) => s.includes("2 a 3")));
  assert.ok(texts(input({}, { frequency: 2.5, reach: 24_000 })).some((s) => s.startsWith("A frequência está entre 2 e 3")));
});

test("hook abaixo da referência sugere olhar o começo do vídeo; hold baixo com hook bom aponta o meio", () => {
  const weakHook = texts(input({}, { hookRate: 0.18 }));
  assert.ok(weakHook.some((s) => s.includes("um hook de 18,0%")));
  assert.ok(weakHook.some((s) => s.startsWith("Considere que uma referência bastante usada no mercado é um hook acima de 25% a 30%")));
  assert.ok(weakHook.includes("Quem passa dos primeiros segundos continua assistindo: o hold está na média dos vídeos da conta (20,0%) ou acima dela. O conteúdo segura a atenção, e o ponto a trabalhar é o começo do vídeo."));
  const weakHold = texts(input({}, { hookRate: 0.32, holdRate: 0.1 }, { holdRate: 0.2 }));
  assert.ok(weakHold.some((s) => s.startsWith("O começo prende, mas a atenção cai antes do fim: o hold está 50% abaixo da média dos vídeos da conta (20,0%)")));
});

test("CPM e CPA comparados com a média da conta", () => {
  const t = texts(input({}, { cpmCents: 7_000, cpaCents: 15_000 }, { cpmCents: 5_000, cpaCents: 10_000 }));
  assert.ok(t.some((s) => s.startsWith("O CPM foi de R$") && s.includes("cada mil impressões custaram esse valor")));
  assert.ok(t.some((s) => s.startsWith("Isso está 40% acima da média da conta (R$")));
  assert.ok(t.some((s) => s.startsWith("O CPA está 50% acima da média da conta (R$")));
});

test("sem venda: mostra o gasto e os cliques, sem inventar CPA", () => {
  const t = texts(input({}, { sales: 0, cpaCents: null, roas: 0, revenueCents: 0 }));
  assert.ok(t.some((s) => /^Foram R\$\s3\.000,00 investidos sem nenhuma venda atribuída no período\.$/.test(s)));
  assert.ok(t.some((s) => s.startsWith("O anúncio levou 900 cliques ao site")));
  assert.ok(!t.some((s) => s.includes("CPA de")));
});

test("resultado melhor que a média e frequência saudável abre espaço para escalar", () => {
  const t = texts(input({}, { roas: 4, cpaCents: 8_000, frequency: 2.4, reach: 25_000 }, { roas: 3, cpaCents: 10_000 }));
  assert.ok(t.at(-1)!.includes("costuma aguentar mais investimento com segurança na hora de escalar"));
  const tired = texts(input({}, { roas: 4, cpaCents: 8_000, frequency: 4.2 }, { roas: 3, cpaCents: 10_000 }));
  assert.ok(!tired.some((s) => s.includes("escalar")));
});

test("conta inteira não se compara com ela mesma; sem gasto não há leitura", () => {
  const t = texts(input({ level: "contas", compare: false }, {}, { cpmCents: 1 }));
  assert.ok(!t.some((s) => s.includes("média da conta")));
  assert.deepEqual(texts(input({}, { spendCents: 0, impressions: 0 })), ["Sem gasto no período: ainda não há números para analisar."]);
});

test("Google: CTR e CPC no lugar de frequência e vídeo", () => {
  const t = texts(input({ provider: "google", level: "campanhas" }, { reach: null, frequency: null, videoViews: 0, hookRate: null, holdRate: null }));
  assert.ok(t[0].startsWith("O CTR foi de 1,50% (a cada 100 vezes que os anúncios da campanha apareceram, 1,5 viraram clique), com CPC de R$"));
  assert.ok(!t.some((s) => s.includes("hook") || s.includes("frequência")));
});

test("alcance arredondado para leitura", () => {
  assert.equal(roundReach(950), 950);
  assert.equal(roundReach(17_143), 17_100);
  assert.equal(roundReach(123_456), 123_000);
});

test("simulação: formato pelo nome e vídeo só para vídeo", () => {
  assert.equal(adFormatFromName("Vídeo depoimento v2"), "video");
  assert.equal(adFormatFromName("UGC unboxing"), "video");
  assert.equal(adFormatFromName("Carrossel benefícios"), "carousel");
  assert.equal(adFormatFromName("Imagem cupom"), "image");
  assert.equal(adFormatFromName("Anúncio responsivo A"), null);
  assert.deepEqual(simulatedVideoMetrics("a", "2026-10-01", 1000, "image"), { videoViews3s: 0, videoP75Views: 0 });
  const v = simulatedVideoMetrics("ad-1", "2026-10-01", 10_000, "video");
  assert.ok(v.videoViews3s > 0 && v.videoViews3s <= 10_000 && v.videoP75Views <= v.videoViews3s);
  assert.deepEqual(simulatedVideoMetrics("ad-1", "2026-10-01", 10_000, "video"), v, "o mesmo anúncio e dia dão o mesmo número");
  assert.ok(hash01("x") >= 0 && hash01("x") < 1);
});

test("simulação: alcance satura e nunca passa das impressões", () => {
  const audience = simulatedAudience("ad-1");
  assert.ok(audience >= 15_000 && audience <= 200_000);
  assert.equal(reachFromImpressions(0, 50_000), 0);
  assert.ok(reachFromImpressions(1_000, 50_000) <= 1_000);
  assert.equal(reachFromImpressions(1_000_000, 20_000), 20_000);
  assert.ok(reachFromImpressions(60_000, 20_000) < reachFromImpressions(60_000, 100_000));
  assert.equal(combineReach([]), 0);
  assert.equal(combineReach([5_000]), 5_000);
  assert.equal(combineReach([10_000, 10_000]), 17_000);
  assert.equal(combineReach([10_000, 100]), 10_000);
});
