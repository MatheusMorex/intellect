import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { msg } from "../../lib/charts/messages.ts";
import { compareFromParam, granularityFromParam } from "../../lib/charts/options.ts";
import { parsePanelQuery } from "../../server/charts/params.ts";
import { autoGranularity } from "../../server/charts/time-buckets.ts";

const TZ = "America/Sao_Paulo";
// Sábado, 17 de outubro de 2026, 12h em Brasília.
const NOW = new Date("2026-10-17T15:00:00Z");
const parse = (sp: Record<string, string>, earliest: string | null = "2025-01-10") => parsePanelQuery(sp, TZ, earliest, NOW);

describe("endereço da página dos Painéis", () => {
  test("sem nada: últimos 30 dias, por dia (automático), comparando com o período anterior", () => {
    const q = parse({});
    assert.equal(q.period.id, "30d");
    assert.deepEqual(q.period.range, { from: "2026-09-18", to: "2026-10-17" });
    assert.equal(q.granularity, "day");
    assert.equal(q.granularityChosen, false);
    assert.equal(q.compareMode, "previous");
    assert.deepEqual(q.compareRange, { from: "2026-08-19", to: "2026-09-17" });
    assert.equal(q.granularityMessage, null);
    assert.equal(q.compareMessage, null);
  });

  test("os nomes do endereço ficam em português e valor desconhecido é ignorado", () => {
    assert.equal(granularityFromParam("quinzena"), "fortnight");
    assert.equal(granularityFromParam("fortnight"), null);
    assert.equal(compareFromParam("ano"), "year");
    assert.equal(compareFromParam("<script>"), null);
    const q = parse({ agrupar: "minuto", comparar: "talvez", periodo: "semana-que-vem" });
    assert.equal(q.period.id, "30d");
    assert.equal(q.granularity, "day");
    assert.equal(q.compareMode, "previous");
  });

  test("granularidade automática pelo tamanho do período", () => {
    const r = (from: string, to: string) => autoGranularity({ from, to });
    assert.equal(r("2026-10-17", "2026-10-17"), "hour");
    assert.equal(r("2026-10-16", "2026-10-17"), "hour");
    assert.equal(r("2026-09-18", "2026-10-17"), "day");
    assert.equal(r("2026-07-01", "2026-10-17"), "week");
    assert.equal(r("2025-10-18", "2026-10-17"), "month");
    assert.equal(r("2010-01-01", "2026-10-17"), "year");
    assert.equal(parse({ periodo: "hoje" }).granularity, "hour");
    assert.equal(parse({ periodo: "ano" }).granularity, "month");
  });

  test("por hora em 30 dias cabe; no ano inteiro, vira por dia com o aviso", () => {
    assert.equal(parse({ agrupar: "hora" }).granularity, "hour");
    const q = parse({ periodo: "ano", agrupar: "hora" });
    assert.equal(q.granularity, "day");
    assert.equal(q.granularityChosen, true);
    assert.equal(q.granularityMessage, "Por hora dá para ver até 31 dias. Neste período, os dados aparecem por dia.");
    assert.ok(!q.allowedGranularities.includes("hour"));
    assert.ok(q.allowedGranularities.includes("day"));
  });

  test("o período de comparação também precisa caber na granularidade", () => {
    const q = parse({ periodo: "7d", agrupar: "hora", comparar: "datas", cde: "2026-01-01", cate: "2026-03-31" });
    assert.deepEqual(q.compareRange, { from: "2026-01-01", to: "2026-03-31" });
    assert.equal(q.granularity, "day");
    assert.match(q.granularityMessage ?? "", /Por hora dá para ver até 31 dias/);
    assert.ok(!q.allowedGranularities.includes("hour"));
  });

  test("comparação: desligada, ano anterior e datas escolhidas", () => {
    const off = parse({ comparar: "nao" });
    assert.equal(off.compareMode, "off");
    assert.equal(off.compareRange, null);
    assert.equal(off.compareMessage, null);

    const year = parse({ periodo: "mes", comparar: "ano" });
    assert.deepEqual(year.compareRange, { from: "2025-10-01", to: "2025-10-17" });

    const custom = parse({ comparar: "datas", cde: "2026-05-01", cate: "2026-05-31" });
    assert.deepEqual(custom.compareRange, { from: "2026-05-01", to: "2026-05-31" });
    assert.deepEqual(custom.compareCustom, { de: "2026-05-01", ate: "2026-05-31" });
  });

  test("datas da comparação faltando ou inválidas: sem comparação e com aviso", () => {
    const cases: Record<string, string>[] = [
      { comparar: "datas" },
      { comparar: "datas", cde: "2026-02-30", cate: "2026-03-10" },
      { comparar: "datas", cde: "2026-05-31", cate: "2026-05-01" },
      { comparar: "datas", cde: "2027-01-01", cate: "2027-01-31" },
    ];
    for (const sp of cases) {
      const q = parse(sp);
      assert.equal(q.compareRange, null, JSON.stringify(sp));
      assert.equal(q.compareMessage, msg.panel.compareDatesMissing);
    }
  });

  test("todo o período não tem período anterior: aviso, sem comparação", () => {
    const q = parse({ periodo: "maximo" });
    assert.deepEqual(q.period.range, { from: "2025-01-10", to: "2026-10-17" });
    assert.equal(q.compareRange, null);
    assert.equal(q.compareMessage, msg.panel.compareUnavailable);
    // Dá para comparar com o ano anterior.
    assert.deepEqual(parse({ periodo: "maximo", comparar: "ano" }).compareRange, { from: "2024-01-10", to: "2025-10-17" });
  });

  test("filtros vêm do endereço (conta, fonte, produto e campanha), como no Resumo", () => {
    const q = parse({ conta: "a1,a2", fonte: "meta,xpto", produto: "p1" });
    assert.deepEqual(q.filters, { accounts: ["a1", "a2"], sources: ["meta"], products: ["p1"], campaigns: [] });
    assert.deepEqual(parse({ campanha: "c1, c2" }).filters.campaigns, ["c1", "c2"]);
  });
});
