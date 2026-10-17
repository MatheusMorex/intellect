import assert from "node:assert/strict";
import { test } from "node:test";

import { comparisonRange, resolvePanelPeriod } from "../../server/charts/periods.ts";
import { resolvePeriod } from "../../server/period.ts";

// Sábado, 17/10/2026, 12:30 em São Paulo.
const NOW = new Date("2026-10-17T15:30:00Z");
const TZ = "America/Sao_Paulo";
const EARLIEST = "2026-07-17";

test("atalhos que o Resumo também tem dão exatamente o mesmo período e o mesmo 'anterior'", () => {
  for (const id of ["hoje", "ontem", "7d", "30d", "mes", "mes-passado", "maximo"]) {
    const panel = resolvePanelPeriod(id, TZ, EARLIEST, NOW);
    const resumo = resolvePeriod(id, TZ, EARLIEST, NOW);
    assert.deepEqual(panel.range, resumo.range, id);
    assert.deepEqual(panel.previous, resumo.previous, id);
  }
  const custom = { de: "2026-09-01", ate: "2026-09-10" };
  assert.deepEqual(resolvePanelPeriod("personalizado", TZ, EARLIEST, NOW, custom).range, resolvePeriod("personalizado", TZ, EARLIEST, NOW, custom).range);
});

test("atalhos novos", () => {
  const range = (id: string) => resolvePanelPeriod(id, TZ, EARLIEST, NOW).range;
  assert.deepEqual(range("14d"), { from: "2026-10-04", to: "2026-10-17" });
  assert.deepEqual(range("quinzena"), { from: "2026-10-16", to: "2026-10-17" });
  assert.deepEqual(range("trimestre"), { from: "2026-10-01", to: "2026-10-17" });
  assert.deepEqual(range("ano"), { from: "2026-01-01", to: "2026-10-17" });
  assert.deepEqual(range("ano-passado"), { from: "2025-01-01", to: "2025-12-31" });
  assert.deepEqual(range("maximo"), { from: "2026-07-17", to: "2026-10-17" });
});

test("primeira quinzena e trimestres nas pontas do ano", () => {
  const at = (iso: string, id: string) => resolvePanelPeriod(id, TZ, null, new Date(iso)).range;
  assert.deepEqual(at("2026-10-10T15:00:00Z", "quinzena"), { from: "2026-10-01", to: "2026-10-10" });
  assert.deepEqual(at("2026-03-31T15:00:00Z", "trimestre"), { from: "2026-01-01", to: "2026-03-31" });
  assert.deepEqual(at("2026-04-01T15:00:00Z", "trimestre"), { from: "2026-04-01", to: "2026-04-01" });
  assert.deepEqual(at("2026-12-31T15:00:00Z", "trimestre"), { from: "2026-10-01", to: "2026-12-31" });
});

test("'hoje' segue o fuso do dashboard", () => {
  // 01/01/2027 às 01:00 UTC ainda é 31/12/2026 em São Paulo.
  const late = new Date("2027-01-01T01:00:00Z");
  assert.deepEqual(resolvePanelPeriod("hoje", TZ, null, late).range, { from: "2026-12-31", to: "2026-12-31" });
  assert.deepEqual(resolvePanelPeriod("hoje", "Europe/Lisbon", null, late).range, { from: "2027-01-01", to: "2027-01-01" });
  assert.deepEqual(resolvePanelPeriod("ano", TZ, null, late).range, { from: "2026-01-01", to: "2026-12-31" });
});

test("período anterior: os mesmos tantos dias logo antes; ano passado contra o ano retrasado", () => {
  const prev = (id: string) => resolvePanelPeriod(id, TZ, EARLIEST, NOW).previous;
  assert.deepEqual(prev("14d"), { from: "2026-09-20", to: "2026-10-03" });
  assert.deepEqual(prev("quinzena"), { from: "2026-10-14", to: "2026-10-15" });
  assert.deepEqual(prev("ano-passado"), { from: "2024-01-01", to: "2024-12-31" });
  assert.equal(prev("maximo"), null);
});

test("mesmo período do ano anterior, com 29 de fevereiro", () => {
  const leap = resolvePanelPeriod("personalizado", TZ, null, new Date("2028-03-05T12:00:00Z"), { de: "2028-02-01", ate: "2028-02-29" });
  assert.deepEqual(comparisonRange(leap, "year"), { from: "2027-02-01", to: "2027-02-28" });
  const month = resolvePanelPeriod("mes", TZ, null, NOW);
  assert.deepEqual(comparisonRange(month, "year"), { from: "2025-10-01", to: "2025-10-17" });
});

test("comparação desligada, anterior e personalizada", () => {
  const p = resolvePanelPeriod("30d", TZ, EARLIEST, NOW);
  assert.equal(comparisonRange(p, "off"), null);
  assert.deepEqual(comparisonRange(p, "previous"), p.previous);
  assert.deepEqual(comparisonRange(p, "custom", { de: "2026-01-01", ate: "2026-01-31" }), { from: "2026-01-01", to: "2026-01-31" });
  // Fim depois de hoje é cortado em hoje; datas inválidas ou fora de ordem não valem.
  assert.deepEqual(comparisonRange(p, "custom", { de: "2026-10-01", ate: "2026-12-31" }), { from: "2026-10-01", to: "2026-10-17" });
  assert.equal(comparisonRange(p, "custom", { de: "2026-02-30", ate: "2026-03-10" }), null);
  assert.equal(comparisonRange(p, "custom", { de: "2026-03-10", ate: "2026-03-01" }), null);
  assert.equal(comparisonRange(p, "custom", { de: "1999-12-01", ate: "2000-01-10" }), null);
});

test("período personalizado inválido volta para o padrão (últimos 30 dias)", () => {
  for (const custom of [{ de: "2026-02-30", ate: "2026-03-01" }, { de: "2026-10-10", ate: "2026-10-01" }, { de: "2026-11-01", ate: "2026-11-05" }, {}]) {
    const p = resolvePanelPeriod("personalizado", TZ, EARLIEST, NOW, custom);
    assert.equal(p.id, "30d");
    assert.deepEqual(p.range, { from: "2026-09-18", to: "2026-10-17" });
  }
  assert.equal(resolvePanelPeriod("qualquer-coisa", TZ, EARLIEST, NOW).id, "30d");
});

test("texto do período por extenso", () => {
  assert.equal(resolvePanelPeriod("mes", TZ, null, NOW).description, "1 a 17 de outubro de 2026");
  assert.equal(resolvePanelPeriod("hoje", TZ, null, NOW).description, "17 de outubro de 2026");
  assert.equal(
    resolvePanelPeriod("personalizado", TZ, null, NOW, { de: "2025-12-28", ate: "2026-01-03" }).description,
    "28 de dezembro de 2025 a 3 de janeiro de 2026",
  );
  assert.equal(resolvePanelPeriod("personalizado", TZ, null, NOW, { de: "2026-09-28", ate: "2026-10-04" }).description, "28 de setembro a 4 de outubro de 2026");
});
