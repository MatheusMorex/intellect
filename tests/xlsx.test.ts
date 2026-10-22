// A planilha .xlsx feita à mão: o zip abre de volta com o CRC certo e o XML
// tem os números como número, com o formato de cada coluna.

import assert from "node:assert/strict";
import { test } from "node:test";

import { columnName, crc32, sheetName, toXlsx, xInt, xMoney, xMult, xPct, zipStore } from "../lib/xlsx.ts";

/** Lê um zip sem compressão (o que o zipStore grava) e confere o CRC de cada arquivo. */
function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    assert.equal(view.getUint16(at + 8, true), 0, "sem compressão");
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength + extra, at + 30 + nameLength + extra + size);
    assert.equal(crc32(data), crc, `CRC de ${name}`);
    files.set(name, decoder.decode(data));
    at += 30 + nameLength + extra + size;
  }
  // Diretório central e o fim do zip apontam para os mesmos arquivos.
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), files.size);
  assert.equal(view.getUint32(end + 16, true), at, "o diretório central começa depois dos arquivos");
  return files;
}

test("CRC-32 bate com o valor conhecido", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("nome de coluna e de aba", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  assert.equal(sheetName("Meta / campanhas: [maio]"), "Meta campanhas maio");
  assert.equal(sheetName("x".repeat(40)).length, 31);
  assert.equal(sheetName("  "), "Planilha");
});

test("zip com vários arquivos abre de volta", () => {
  const enc = new TextEncoder();
  const files = unzip(zipStore([{ name: "a.txt", data: enc.encode("olá") }, { name: "pasta/b.xml", data: enc.encode("<x/>") }]));
  assert.deepEqual([...files.entries()], [
    ["a.txt", "olá"],
    ["pasta/b.xml", "<x/>"],
  ]);
});

test("planilha: cabeçalho em texto, números com formato, total em negrito e texto escapado", () => {
  const bytes = toXlsx(
    [
      ["Campanha", "Gasto", "Vendas", "CTR", "ROAS"],
      ["Remarketing <30d> & \"teste\"", xMoney(123456, "BRL"), xInt(12), xPct(0.0425), xMult(2.5)],
      ["Sem dado", xMoney(null, "BRL"), xInt(0), xPct(null), null],
      ["Total", xMoney(123456, "BRL"), xInt(12), xPct(0.0425), xMult(2.5)],
    ],
    { sheet: "Meta: campanhas", total: true, symbol: (c) => (c === "BRL" ? "R$" : c) },
  );
  const files = unzip(bytes);
  assert.deepEqual([...files.keys()], ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]);
  const sheet = files.get("xl/worksheets/sheet1.xml")!;
  const styles = files.get("xl/styles.xml")!;
  assert.match(files.get("xl/workbook.xml")!, /<sheet name="Meta campanhas" sheetId="1" r:id="rId1"\/>/);

  // Cabeçalho em negrito (estilo 1) e congelado.
  assert.match(sheet, /<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Campanha<\/t><\/is><\/c>/);
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  // Texto escapado.
  assert.ok(sheet.includes("Remarketing &lt;30d&gt; &amp; &quot;teste&quot;"));
  // Dinheiro em reais (não em centavos), percentual em fração, inteiro e multiplicador.
  assert.match(sheet, /<c r="B2" s="2"><v>1234.56<\/v><\/c>/);
  assert.match(sheet, /<c r="C2" s="4"><v>12<\/v><\/c>/);
  assert.match(sheet, /<c r="D2" s="6"><v>0.0425<\/v><\/c>/);
  assert.match(sheet, /<c r="E2" s="8"><v>2.5<\/v><\/c>/);
  // Vazio não vira zero; zero de verdade fica.
  assert.ok(!sheet.includes('r="B3"') && !sheet.includes('r="D3"') && !sheet.includes('r="E3"'));
  assert.match(sheet, /<c r="C3" s="4"><v>0<\/v><\/c>/);
  // Total: mesmos formatos, em negrito (estilo seguinte de cada par).
  assert.match(sheet, /<c r="A4" t="inlineStr" s="1">/);
  assert.match(sheet, /<c r="B4" s="3"><v>1234.56<\/v><\/c>/);

  // Formatos: dinheiro com o símbolo, os embutidos do Excel e o "x" do ROAS.
  assert.ok(styles.includes('formatCode="&quot;R$&quot; #,##0.00;-&quot;R$&quot; #,##0.00"'));
  assert.ok(styles.includes('formatCode="0.00&quot;x&quot;"'));
  assert.match(styles, /<cellXfs count="10">/);
  assert.match(styles, /<xf numFmtId="3" fontId="0"/);
  assert.match(styles, /<xf numFmtId="10" fontId="0"/);
});

test("planilha: duas moedas viram dois formatos de dinheiro; caractere de controle some", () => {
  const files = unzip(toXlsx([["A", "B"], [xMoney(100, "BRL"), xMoney(250, "USD")], ["linha\u0007um", 3]], { sheet: "x", symbol: (c) => (c === "BRL" ? "R$" : "US$") }));
  const styles = files.get("xl/styles.xml")!;
  assert.ok(styles.includes("&quot;R$&quot;") && styles.includes("&quot;US$&quot;"));
  const sheet = files.get("xl/worksheets/sheet1.xml")!;
  assert.match(sheet, /<c r="A2" s="2"><v>1<\/v><\/c><c r="B2" s="4"><v>2.5<\/v><\/c>/);
  assert.ok(sheet.includes(">linhaum<"));
  assert.match(sheet, /<c r="B3"><v>3<\/v><\/c>/);
});
