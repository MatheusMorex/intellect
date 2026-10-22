// Campos personalizados (lib/custom-fields.ts): o valor digitado vira o valor
// guardado conforme o tipo, e o guardado vira o texto que a pessoa lê.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { cleanOptions, displayFieldValue, parseDecimal, parseFieldValue } from "../lib/custom-fields.ts";

const field = (type: "text" | "number" | "date" | "checkbox" | "list", options: { id: string; label: string; color: string | null }[] = []) => ({ type, options, name: "Verba" });

describe("campos personalizados: regras", () => {
  test("número em pt-BR: milhar com ponto, decimal com vírgula", () => {
    assert.equal(parseDecimal("1.234,56"), 1234.56);
    assert.equal(parseDecimal("1234,5"), 1234.5);
    assert.equal(parseDecimal("1234.56"), 1234.56);
    assert.equal(parseDecimal("1.234.567"), 1234567);
    assert.equal(parseDecimal("-10"), -10);
    assert.equal(parseDecimal("abc"), null);
    assert.equal(parseDecimal("12a"), null);
  });

  test("texto: espaços sobrando saem; vazio limpa; até 1.000 caracteres", () => {
    assert.deepEqual(parseFieldValue(field("text"), "  ID   123  "), { ok: true, value: "ID 123" });
    assert.deepEqual(parseFieldValue(field("text"), "   "), { ok: true, value: null });
    assert.equal(parseFieldValue(field("text"), "a".repeat(1001)).ok, false);
  });

  test("número: aceita texto em pt-BR e número; recusa o resto", () => {
    assert.deepEqual(parseFieldValue(field("number"), "1.500,00"), { ok: true, value: 1500 });
    assert.deepEqual(parseFieldValue(field("number"), 42), { ok: true, value: 42 });
    assert.deepEqual(parseFieldValue(field("number"), ""), { ok: true, value: null });
    const bad = parseFieldValue(field("number"), "mil");
    assert.equal(bad.ok, false);
    assert.match((bad as { error: string }).error, /Verba/);
  });

  test("data: só AAAA-MM-DD que existe no calendário", () => {
    assert.deepEqual(parseFieldValue(field("date"), "2026-10-21"), { ok: true, value: "2026-10-21" });
    assert.equal(parseFieldValue(field("date"), "2026-02-30").ok, false);
    assert.equal(parseFieldValue(field("date"), "21/10/2026").ok, false);
  });

  test("caixa: marcada guarda true; desmarcada limpa", () => {
    assert.deepEqual(parseFieldValue(field("checkbox"), true), { ok: true, value: true });
    assert.deepEqual(parseFieldValue(field("checkbox"), false), { ok: true, value: null });
    assert.equal(parseFieldValue(field("checkbox"), "sim").ok, false);
  });

  test("lista: só uma opção que existe", () => {
    const list = field("list", [{ id: "a", label: "Aprovado", color: null }]);
    assert.deepEqual(parseFieldValue(list, "a"), { ok: true, value: "a" });
    assert.equal(parseFieldValue(list, "b").ok, false);
  });

  test("o valor como a pessoa lê", () => {
    assert.equal(displayFieldValue(field("number"), 1500.5), "1.500,5");
    assert.equal(displayFieldValue(field("date"), "2026-10-21"), "21/10/2026");
    assert.equal(displayFieldValue(field("checkbox"), true), "Sim");
    assert.equal(displayFieldValue(field("list", [{ id: "a", label: "Aprovado", color: null }]), "a"), "Aprovado");
    assert.equal(displayFieldValue(field("list", []), "sumiu"), "Opção apagada");
  });

  test("opções da lista: sem vazias, sem repetir, ids novos só para as novas", () => {
    let n = 0;
    const makeId = () => `novo-${++n}`;
    assert.deepEqual(cleanOptions([{ id: "x", label: " Aprovado " }, { label: "" }, { label: "Em revisão" }], makeId), [
      { id: "x", label: "Aprovado", color: null },
      { id: "novo-1", label: "Em revisão", color: null },
    ]);
    assert.equal(typeof cleanOptions([{ label: "A" }, { label: "a" }], makeId), "string");
  });
});

describe("campos personalizados nas automações: as frases", async () => {
  const { describeAction, describeTrigger } = await import("../lib/automation/describe.ts");
  const names = {
    lists: {},
    labels: {},
    people: {},
    dashboards: {},
    currencies: {},
    fields: {
      f1: { name: "Situação", type: "list" as const, options: [{ id: "a", label: "Aprovado", color: null }] },
      f2: { name: "Verba", type: "number" as const, options: [] },
      f3: { name: "Nota", type: "text" as const, options: [] },
    },
  };

  test("gatilho com e sem valor", () => {
    assert.equal(describeTrigger("rule", { kind: "field_changed", fieldId: "f1", value: "a" }, names), "Quando o campo “Situação” ficar “Aprovado” num card");
    assert.equal(describeTrigger("rule", { kind: "field_changed", fieldId: "f2", value: null }, names), "Quando o campo “Verba” mudar num card");
  });

  test("ação de preencher e de limpar", () => {
    assert.equal(describeAction({ kind: "set_field", fieldId: "f2", value: 1500 }, names), "preencher “Verba” com “1.500”");
    assert.equal(describeAction({ kind: "set_field", fieldId: "f3", value: "Aprovado por {username}" }, names), "preencher “Nota” com “Aprovado por {username}”");
    assert.equal(describeAction({ kind: "set_field", fieldId: "f2", value: null }, names), "limpar o campo “Verba”");
    assert.equal(describeAction({ kind: "set_field", fieldId: "sumiu", value: null }, names), "limpar o campo (item excluído)");
  });
});
