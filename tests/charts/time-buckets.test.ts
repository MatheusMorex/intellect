import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  addDays,
  bucketEnd,
  bucketStart,
  checkGranularity,
  daysInRange,
  floorToLocalHour,
  isValidDateKey,
  listBuckets,
  localMidnightUtc,
  makeLocator,
  sameDayLastYear,
  type BucketOptions,
} from "../../server/charts/time-buckets.ts";

// "Agora": sábado, 17/10/2026, 12:30 em São Paulo (15:30 UTC).
const NOW = new Date("2026-10-17T15:30:00Z");
const SP: BucketOptions = { timezone: "America/Sao_Paulo", weekStart: "monday", now: NOW };
const keys = (buckets: { key: string }[]) => buckets.map((b) => b.key);
const spans = (buckets: { from: string; to: string }[]) => buckets.map((b) => `${b.from}..${b.to}`);

describe("calendário", () => {
  test("datas inválidas são recusadas", () => {
    assert.equal(isValidDateKey("2026-02-28"), true);
    assert.equal(isValidDateKey("2028-02-29"), true);
    assert.equal(isValidDateKey("2026-02-29"), false);
    assert.equal(isValidDateKey("2026-02-30"), false);
    assert.equal(isValidDateKey("2026-13-01"), false);
    assert.equal(isValidDateKey("26-10-17"), false);
    assert.equal(isValidDateKey(null), false);
  });

  test("somar dias atravessa mês, ano e 29 de fevereiro", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2027-02-28", 1), "2027-03-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  });

  test("tamanho do período conta o primeiro e o último dia", () => {
    assert.equal(daysInRange({ from: "2026-10-17", to: "2026-10-17" }), 1);
    assert.equal(daysInRange({ from: "2028-02-01", to: "2028-02-29" }), 29);
    assert.equal(daysInRange({ from: "2026-01-01", to: "2026-12-31" }), 365);
  });

  test("mesmo dia do ano anterior: 29/02 vira 28/02", () => {
    assert.equal(sameDayLastYear("2026-10-17"), "2025-10-17");
    assert.equal(sameDayLastYear("2028-02-29"), "2027-02-28");
    assert.equal(sameDayLastYear("2029-02-28"), "2028-02-28");
  });
});

describe("início e fim de cada balde", () => {
  test("quinzena: 1 a 15 e 16 até o último dia (fevereiro, meses de 30 e 31 dias)", () => {
    assert.equal(bucketStart("2026-10-15", "fortnight", "monday"), "2026-10-01");
    assert.equal(bucketStart("2026-10-16", "fortnight", "monday"), "2026-10-16");
    assert.equal(bucketEnd("2026-10-01", "fortnight"), "2026-10-15");
    assert.equal(bucketEnd("2026-10-16", "fortnight"), "2026-10-31");
    assert.equal(bucketEnd("2026-04-16", "fortnight"), "2026-04-30");
    assert.equal(bucketEnd("2026-02-16", "fortnight"), "2026-02-28");
    assert.equal(bucketEnd("2028-02-16", "fortnight"), "2028-02-29");
  });

  test("semana ISO (segunda a domingo) e domingo a sábado", () => {
    // 17/10/2026 é sábado.
    assert.equal(bucketStart("2026-10-17", "week", "monday"), "2026-10-12");
    assert.equal(bucketStart("2026-10-17", "week", "sunday"), "2026-10-11");
    // Segunda é o primeiro dia da própria semana ISO; domingo é o último.
    assert.equal(bucketStart("2026-10-12", "week", "monday"), "2026-10-12");
    assert.equal(bucketStart("2026-10-18", "week", "monday"), "2026-10-12");
    assert.equal(bucketStart("2026-10-18", "week", "sunday"), "2026-10-18");
    assert.equal(bucketEnd("2026-10-12", "week"), "2026-10-18");
    // Semana que atravessa o ano: 28/12/2026 (segunda) a 03/01/2027.
    assert.equal(bucketStart("2027-01-02", "week", "monday"), "2026-12-28");
    assert.equal(bucketEnd("2026-12-28", "week"), "2027-01-03");
  });

  test("mês e ano", () => {
    assert.equal(bucketStart("2028-02-29", "month", "monday"), "2028-02-01");
    assert.equal(bucketEnd("2028-02-01", "month"), "2028-02-29");
    assert.equal(bucketEnd("2027-02-01", "month"), "2027-02-28");
    assert.equal(bucketEnd("2026-12-01", "month"), "2026-12-31");
    assert.equal(bucketStart("2026-10-17", "year", "monday"), "2026-01-01");
    assert.equal(bucketEnd("2026-01-01", "year"), "2026-12-31");
  });
});

describe("baldes do período", () => {
  test("dia: um balde por dia, inclusive 29/02, e virada de ano", () => {
    const opts = { ...SP, now: new Date("2029-01-01T12:00:00Z") };
    assert.deepEqual(keys(listBuckets({ from: "2028-02-27", to: "2028-03-01" }, "day", opts)), [
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
    assert.deepEqual(keys(listBuckets({ from: "2027-02-27", to: "2027-03-01" }, "day", opts)), ["2027-02-27", "2027-02-28", "2027-03-01"]);
    assert.deepEqual(keys(listBuckets({ from: "2027-12-30", to: "2028-01-02" }, "day", opts)), [
      "2027-12-30",
      "2027-12-31",
      "2028-01-01",
      "2028-01-02",
    ]);
  });

  test("quinzena: outubro até hoje tem duas, a segunda em andamento", () => {
    const b = listBuckets({ from: "2026-10-01", to: "2026-10-17" }, "fortnight", SP);
    assert.deepEqual(spans(b), ["2026-10-01..2026-10-15", "2026-10-16..2026-10-17"]);
    assert.deepEqual(
      b.map((x) => x.partial),
      [null, "ongoing"],
    );
    assert.equal(b[0].longLabel, "1ª quinzena de outubro de 2026");
    assert.equal(b[1].naturalTo, "2026-10-31");
  });

  test("quinzena em fevereiro bissexto e não bissexto", () => {
    const opts = { ...SP, now: new Date("2029-01-01T12:00:00Z") };
    assert.deepEqual(spans(listBuckets({ from: "2028-02-01", to: "2028-02-29" }, "fortnight", opts)), [
      "2028-02-01..2028-02-15",
      "2028-02-16..2028-02-29",
    ]);
    assert.deepEqual(spans(listBuckets({ from: "2027-02-01", to: "2027-02-28" }, "fortnight", opts)), [
      "2027-02-01..2027-02-15",
      "2027-02-16..2027-02-28",
    ]);
  });

  test("semana: a primeira cortada pelo período fica marcada; a atual, em andamento", () => {
    const b = listBuckets({ from: "2026-09-25", to: "2026-10-17" }, "week", SP);
    assert.deepEqual(keys(b), ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
    assert.deepEqual(
      b.map((x) => x.partial),
      ["clipped", null, null, "ongoing"],
    );
    assert.equal(b[0].from, "2026-09-25");
    assert.equal(b[1].label, "28/09 a 04/10");
    assert.equal(b[1].longLabel, "Semana de 28 de setembro a 4 de outubro de 2026");
  });

  test("semana de domingo a sábado", () => {
    const b = listBuckets({ from: "2026-10-04", to: "2026-10-17" }, "week", { ...SP, weekStart: "sunday" });
    assert.deepEqual(spans(b), ["2026-10-04..2026-10-10", "2026-10-11..2026-10-17"]);
  });

  test("mês: atravessa o ano, com o ano no rótulo e as pontas cortadas marcadas", () => {
    const b = listBuckets({ from: "2025-11-20", to: "2026-02-10" }, "month", SP);
    assert.deepEqual(keys(b), ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
    assert.deepEqual(
      b.map((x) => x.label),
      ["nov/25", "dez/25", "jan/26", "fev/26"],
    );
    assert.deepEqual(
      b.map((x) => x.partial),
      ["clipped", null, null, "clipped"],
    );
    assert.equal(b[1].longLabel, "dezembro de 2025");
  });

  test("mês passado inteiro não é parcial; este mês é", () => {
    assert.equal(listBuckets({ from: "2026-09-01", to: "2026-09-30" }, "month", SP)[0].partial, null);
    assert.equal(listBuckets({ from: "2026-10-01", to: "2026-10-17" }, "month", SP)[0].partial, "ongoing");
  });

  test("ano", () => {
    const b = listBuckets({ from: "2025-03-01", to: "2026-10-17" }, "year", SP);
    assert.deepEqual(keys(b), ["2025-01-01", "2026-01-01"]);
    assert.deepEqual(
      b.map((x) => x.partial),
      ["clipped", "ongoing"],
    );
  });

  test("o balde de um dia vai da meia-noite à meia-noite do fuso, em UTC", () => {
    const [day] = listBuckets({ from: "2026-10-10", to: "2026-10-10" }, "day", SP);
    assert.equal(day.startUtc, "2026-10-10T03:00:00.000Z");
    assert.equal(day.endUtc, "2026-10-11T03:00:00.000Z");
    const [lisbon] = listBuckets({ from: "2026-07-10", to: "2026-07-10" }, "day", { ...SP, timezone: "Europe/Lisbon" });
    assert.equal(lisbon.startUtc, "2026-07-09T23:00:00.000Z");
  });
});

describe("por hora e fusos", () => {
  test("hoje por hora mostra só até a hora atual, e ela está em andamento", () => {
    const b = listBuckets({ from: "2026-10-17", to: "2026-10-17" }, "hour", SP);
    assert.equal(b.length, 13); // 0h a 12h em São Paulo
    assert.equal(b[0].key, "2026-10-17T03:00:00.000Z");
    assert.equal(b[0].label, "0h");
    assert.equal(b[12].label, "12h");
    assert.equal(b[12].partial, "ongoing");
    assert.equal(b[11].partial, null);
  });

  test("Lisboa: dia em que o relógio volta tem 25 horas; o que adianta, 23", () => {
    const lisbon = { timezone: "Europe/Lisbon", weekStart: "monday" as const, now: new Date("2026-12-01T00:00:00Z") };
    const autumn = listBuckets({ from: "2026-10-25", to: "2026-10-25" }, "hour", lisbon);
    assert.equal(autumn.length, 25);
    assert.deepEqual(
      autumn.slice(0, 4).map((b) => b.label),
      ["0h", "1h", "1h (2ª vez)", "2h"],
    );
    const spring = listBuckets({ from: "2026-03-29", to: "2026-03-29" }, "hour", lisbon);
    assert.equal(spring.length, 23);
    assert.deepEqual(
      spring.slice(0, 3).map((b) => b.label),
      ["0h", "2h", "3h"],
    );
  });

  test("por hora em mais de um dia, o rótulo diz o dia", () => {
    const b = listBuckets({ from: "2026-10-16", to: "2026-10-17" }, "hour", SP);
    assert.equal(b.length, 24 + 13);
    assert.equal(b[0].label, "16/10 0h");
    assert.equal(b[24].label, "17/10 0h");
    assert.equal(b[24].longLabel, "17 de outubro de 2026, 0h");
  });

  test("as duas '1h' do dia em que o relógio volta são horas diferentes", () => {
    const lisbon = { timezone: "Europe/Lisbon", weekStart: "monday" as const, now: new Date("2026-12-01T00:00:00Z") };
    const b = listBuckets({ from: "2026-10-25", to: "2026-10-25" }, "hour", lisbon);
    const locate = makeLocator(b, "hour", lisbon);
    assert.equal(locate.byInstant("2026-10-25T00:30:00Z"), "2026-10-25T00:00:00.000Z");
    assert.equal(locate.byInstant("2026-10-25T01:30:00Z"), "2026-10-25T01:00:00.000Z");
  });

  test("início da hora local em fuso com meia hora e em São Paulo", () => {
    assert.equal(new Date(floorToLocalHour(Date.parse("2026-10-17T12:45:00Z"), "Asia/Kolkata")).toISOString(), "2026-10-17T12:30:00.000Z");
    assert.equal(new Date(floorToLocalHour(Date.parse("2026-10-17T12:45:00Z"), "America/Sao_Paulo")).toISOString(), "2026-10-17T12:00:00.000Z");
  });

  test("meia-noite que não existiu (horário de verão antigo de São Paulo) começa na 1h", () => {
    // 04/11/2018: o relógio pulou de 0h para 1h. O dia começou às 03:00 UTC.
    assert.equal(new Date(localMidnightUtc("2018-11-04", "America/Sao_Paulo")).toISOString(), "2018-11-04T03:00:00.000Z");
  });

  test("o pedido entra no dia do fuso do dashboard, não no dia em UTC", () => {
    const b = listBuckets({ from: "2026-10-01", to: "2026-10-31" }, "month", { ...SP, now: new Date("2026-12-01T00:00:00Z") });
    const sp = makeLocator(b, "month", SP);
    // 01/11 às 01:00 UTC ainda é 31/10 em São Paulo: entra em outubro.
    assert.equal(sp.byInstant("2026-11-01T01:00:00Z"), "2026-10-01");
    // 01/10 às 02:00 UTC ainda é 30/09 em São Paulo: fora do período.
    assert.equal(sp.byInstant("2026-10-01T02:00:00Z"), null);
    assert.equal(sp.byInstant("2026-10-01T03:00:00Z"), "2026-10-01");
  });

  test("dado que só existe por dia não cabe em hora nenhuma", () => {
    const b = listBuckets({ from: "2026-10-17", to: "2026-10-17" }, "hour", SP);
    assert.equal(makeLocator(b, "hour", SP).byDay("2026-10-17"), null);
  });

  test("dia fora do período não cai em balde nenhum", () => {
    const b = listBuckets({ from: "2026-09-25", to: "2026-10-17" }, "week", SP);
    const locate = makeLocator(b, "week", SP);
    assert.equal(locate.byDay("2026-09-24"), null); // mesma semana do primeiro balde, mas antes do período
    assert.equal(locate.byDay("2026-09-25"), "2026-09-21");
    assert.equal(locate.byDay("2026-10-17"), "2026-10-12");
  });
});

describe("limite de pontos por granularidade", () => {
  test("hora até 31 dias; passou disso, sugere dia", () => {
    assert.deepEqual(checkGranularity({ from: "2026-10-01", to: "2026-10-31" }, "hour"), { ok: true, granularity: "hour" });
    const r = checkGranularity({ from: "2026-09-16", to: "2026-10-17" }, "hour");
    assert.equal(r.ok, false);
    assert.equal(r.granularity, "day");
    assert.match(r.ok ? "" : r.message, /Por hora dá para ver até 31 dias\. Neste período, os dados aparecem por dia\./);
  });

  test("dia até 2 anos; 3 anos sugere semana; mês e ano não têm limite", () => {
    assert.equal(checkGranularity({ from: "2024-10-18", to: "2026-10-17" }, "day").ok, true);
    assert.equal(checkGranularity({ from: "2023-10-17", to: "2026-10-17" }, "day").granularity, "week");
    assert.equal(checkGranularity({ from: "2000-01-01", to: "2026-10-17" }, "month").ok, true);
    assert.equal(checkGranularity({ from: "2000-01-01", to: "2026-10-17" }, "week").granularity, "month");
  });
});
