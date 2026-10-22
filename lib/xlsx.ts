// Planilha do Excel (.xlsx) de uma tabela, sem biblioteca: o arquivo é um zip
// com alguns XML dentro. Os números vão como número de verdade (o Excel soma e
// ordena), com o formato certo: dinheiro com o símbolo da moeda, percentual,
// inteiro com separador de milhar, decimal e multiplicador (ROAS).
// A primeira linha (cabeçalho) fica em negrito e congelada; a linha de total,
// se houver, também em negrito. Função pura: os testes rodam com `npm test`.

import { currencySymbol } from "@/lib/format";

export type XlsxNumberFormat = "int" | "dec" | "pct" | "money" | "mult";
/** Texto, número sem formato, vazio, ou número com formato (dinheiro já em reais, não em centavos; percentual em fração: 0,25 = 25%). */
export type XlsxCell = string | number | null | { n: number | null; fmt: XlsxNumberFormat; currency?: string };

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const xMoney = (cents: number | null | undefined, currency: string): XlsxCell => ({ n: cents == null ? null : cents / 100, fmt: "money", currency });
export const xPct = (fraction: number | null | undefined): XlsxCell => ({ n: fraction ?? null, fmt: "pct" });
export const xInt = (value: number | null | undefined): XlsxCell => ({ n: value ?? null, fmt: "int" });
export const xDec = (value: number | null | undefined): XlsxCell => ({ n: value ?? null, fmt: "dec" });
export const xMult = (value: number | null | undefined): XlsxCell => ({ n: value ?? null, fmt: "mult" });

// ---- zip (sem compressão) ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip com os arquivos guardados como estão (método 0): o Excel abre normalmente. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, file.data.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, file.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, DOS_DATE, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, file.data.length, true);
    central.setUint32(24, file.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + file.data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ---- planilha ---------------------------------------------------------------------------------------

/** Tira os caracteres que o XML não aceita e escapa o resto. */
function xml(text: string) {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A, B, …, Z, AA, AB… */
export function columnName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Nome da aba: até 31 caracteres, sem : \ / ? * [ ]. */
export function sheetName(name: string) {
  return name.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Planilha";
}

const PLAIN_FORMAT: Record<Exclude<XlsxNumberFormat, "money">, { id: number; code?: string }> = {
  int: { id: 3 }, // #,##0
  dec: { id: 4 }, // #,##0.00
  pct: { id: 10 }, // 0.00%
  mult: { id: 165, code: '0.00"x"' },
};

function moneyCode(symbol: string) {
  const s = symbol.replace(/"/g, "");
  return `"${s}" #,##0.00;-"${s}" #,##0.00`;
}

export type XlsxOptions = { sheet: string; total?: boolean; symbol?: (currency: string) => string };

/** Monta o .xlsx: linhas de células; a primeira é o cabeçalho e, com `total`, a última é a linha de total. */
export function toXlsx(rows: XlsxCell[][], options: XlsxOptions): Uint8Array<ArrayBuffer> {
  const symbol = options.symbol ?? currencySymbol;
  // Estilos: 0 normal, 1 negrito; depois um par (normal, negrito) por formato de número usado.
  const formats: { key: string; id: number; code?: string }[] = [];
  const formatIndex = new Map<string, number>();
  let nextCustom = 166;
  const styleOf = (cell: Exclude<XlsxCell, string | number | null>, bold: boolean) => {
    const key = cell.fmt === "money" ? `money:${cell.currency ?? ""}` : cell.fmt;
    let index = formatIndex.get(key);
    if (index == null) {
      const f = cell.fmt === "money" ? { id: nextCustom++, code: moneyCode(symbol(cell.currency ?? "")) } : PLAIN_FORMAT[cell.fmt];
      index = formats.length;
      formats.push({ key, ...f });
      formatIndex.set(key, index);
    }
    return 2 + index * 2 + (bold ? 1 : 0);
  };

  const widths: number[] = [];
  const sheetRows = rows.map((row, r) => {
    const bold = r === 0 || (options.total === true && r === rows.length - 1 && rows.length > 1);
    const cells = row
      .map((cell, c) => {
        const ref = `${columnName(c)}${r + 1}`;
        if (cell == null || cell === "") return "";
        if (typeof cell === "string") {
          widths[c] = Math.max(widths[c] ?? 0, cell.length);
          return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
        }
        if (typeof cell === "number") {
          if (!Number.isFinite(cell)) return "";
          widths[c] = Math.max(widths[c] ?? 0, String(cell).length);
          return `<c r="${ref}"${bold ? ' s="1"' : ""}><v>${cell}</v></c>`;
        }
        if (cell.n == null || !Number.isFinite(cell.n)) return "";
        widths[c] = Math.max(widths[c] ?? 0, Math.round(Math.abs(cell.n)).toString().length + (cell.fmt === "money" ? 8 : 4));
        return `<c r="${ref}" s="${styleOf(cell, bold)}"><v>${cell.n}</v></c>`;
      })
      .join("");
    return `<row r="${r + 1}">${cells}</row>`;
  });

  const columnCount = Math.max(1, ...rows.map((r) => r.length));
  const cols = Array.from({ length: columnCount }, (_, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, Math.max(10, (widths[c] ?? 8) + 2))}" customWidth="1"/>`).join("");
  const worksheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetViews><sheetView tabSelected="1" workbookViewId="0">` +
    (rows.length > 1 ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` : "") +
    `</sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${sheetRows.join("")}</sheetData>` +
    `</worksheet>`;

  const custom = formats.filter((f) => f.code);
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'];
  for (const f of formats) {
    xfs.push(`<xf numFmtId="${f.id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`);
    xfs.push(`<xf numFmtId="${f.id}" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`);
  }
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (custom.length ? `<numFmts count="${custom.length}">${custom.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${xml(f.code!)}"/>`).join("")}</numFmts>` : "") +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xml(sheetName(options.sheet))}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const encoder = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/styles.xml", data: encoder.encode(styles) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(worksheet) },
  ]);
}

/** Baixa a planilha no navegador. */
export function downloadXlsx(fileName: string, rows: XlsxCell[][], options: XlsxOptions) {
  const url = URL.createObjectURL(new Blob([toXlsx(rows, options)], { type: XLSX_TYPE }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
