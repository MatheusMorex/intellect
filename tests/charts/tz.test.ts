// server/tz.ts guarda o deslocamento do fuso por fatia de 15 minutos. Estes
// testes comparam a versão rápida com a conversão direta do @date-fns/tz em
// muitos instantes, inclusive em volta das trocas de horário de verão e em
// fusos com minutos quebrados (+05:45, +12:45, horário de verão de 30 min).

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { TZDate, tzOffset } from "@date-fns/tz";

import { dayKeyAt, offsetMinutes } from "../../server/tz.ts";

const ZONES = [
  "America/Sao_Paulo", // teve horário de verão até 2019
  "Europe/Lisbon",
  "Europe/London",
  "America/New_York",
  "Asia/Kathmandu", // +05:45
  "Asia/Kolkata", // +05:30
  "America/St_Johns", // -03:30, com horário de verão
  "Australia/Lord_Howe", // o horário de verão adianta só 30 minutos
  "Pacific/Chatham", // +12:45 / +13:45
  "UTC",
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const reference = (ms: number, zone: string) => {
  const d = new TZDate(ms, zone);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Instantes a cada 7 minutos em volta de um momento (pega bordas de fatia e de troca). */
function around(iso: string, hours = 6): number[] {
  const center = Date.parse(iso);
  const out: number[] = [];
  for (let t = center - hours * HOUR; t <= center + hours * HOUR; t += 7 * MINUTE) out.push(t);
  return out;
}

// Trocas de horário reais (UTC) e viradas de dia/ano.
const MOMENTS = [
  "2018-11-04T03:00:00Z", // São Paulo adianta (meia-noite vira 1h)
  "2019-02-17T02:00:00Z", // São Paulo atrasa (meia-noite se repete)
  "2026-03-29T01:00:00Z", // Europa adianta
  "2026-10-25T01:00:00Z", // Europa atrasa
  "2026-03-08T07:00:00Z", // Nova York adianta
  "2026-11-01T06:00:00Z", // Nova York atrasa
  "2026-04-04T15:00:00Z", // Lord Howe atrasa 30 min
  "2026-10-03T15:30:00Z", // Lord Howe adianta 30 min
  "2026-04-04T14:00:00Z", // Chatham atrasa
  "2026-09-26T14:00:00Z", // Chatham adianta
  "2026-12-31T23:59:00Z", // virada do ano
  "2028-02-29T12:00:00Z", // ano bissexto
  "1969-12-31T23:00:00Z", // antes de 1970 (ms negativos)
];

describe("fuso rápido (server/tz.ts)", () => {
  test("o deslocamento é o mesmo da conversão direta, nas trocas de horário", () => {
    for (const zone of ZONES) {
      for (const moment of MOMENTS) {
        for (const ms of around(moment)) {
          assert.equal(offsetMinutes(ms, zone), tzOffset(zone, new Date(ms)), `${zone} ${new Date(ms).toISOString()}`);
        }
      }
    }
  });

  test("o dia do instante é o mesmo da conversão direta, nas trocas de horário", () => {
    for (const zone of ZONES) {
      for (const moment of MOMENTS) {
        for (const ms of around(moment)) {
          assert.equal(dayKeyAt(ms, zone), reference(ms, zone), `${zone} ${new Date(ms).toISOString()}`);
        }
      }
    }
  });

  test("o dia confere em instantes espalhados de 2010 a 2030", () => {
    // Gerador fixo: o teste é sempre o mesmo.
    let seed = 20261019;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const from = Date.parse("2010-01-01T00:00:00Z");
    const to = Date.parse("2030-12-31T23:59:59Z");
    for (let i = 0; i < 3000; i++) {
      const ms = Math.floor(from + next() * (to - from));
      for (const zone of ZONES) assert.equal(dayKeyAt(ms, zone), reference(ms, zone), `${zone} ${new Date(ms).toISOString()}`);
    }
  });

  test("meia-noite local: o último instante do dia e o primeiro do seguinte", () => {
    // 18/10/2026 00:00 em São Paulo = 03:00 UTC.
    assert.equal(dayKeyAt(Date.parse("2026-10-18T02:59:59.999Z"), "America/Sao_Paulo"), "2026-10-17");
    assert.equal(dayKeyAt(Date.parse("2026-10-18T03:00:00.000Z"), "America/Sao_Paulo"), "2026-10-18");
    // Katmandu, +05:45: 18/10 00:00 local = 17/10 18:15 UTC.
    assert.equal(dayKeyAt(Date.parse("2026-10-17T18:14:59.999Z"), "Asia/Kathmandu"), "2026-10-17");
    assert.equal(dayKeyAt(Date.parse("2026-10-17T18:15:00.000Z"), "Asia/Kathmandu"), "2026-10-18");
  });

  test("data inválida dá erro, como antes", () => {
    assert.throws(() => dayKeyAt(Number.NaN, "America/Sao_Paulo"), RangeError);
  });
});
