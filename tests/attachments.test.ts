// Anexos dos cards (server/attachments.ts): nome, link, tipo do arquivo e os
// cabeçalhos do download. Sem banco e sem arquivo: só as regras.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { fileSize } from "../lib/format.ts";
import { cleanName, downloadHeaders, isImageAttachment, safeLink, storedType } from "../server/attachments.ts";

const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
const GIF = new TextEncoder().encode("GIF89a\x01\x00\x01\x00");

describe("anexos: regras", () => {
  test("nome: sem pasta, sem caracteres invisíveis, até 256; vazio vira 'arquivo'", () => {
    assert.equal(cleanName("C:\\Users\\ana\\Desktop\\proposta final.pdf"), "proposta final.pdf");
    assert.equal(cleanName("../../etc/passwd"), "passwd");
    assert.equal(cleanName("nome\u0000com\u0007controle\n.txt"), "nomecomcontrole.txt");
    assert.equal(cleanName("   "), "arquivo");
    assert.equal(cleanName("a".repeat(300)).length, 256);
  });

  test("link: só http e https", () => {
    assert.equal(safeLink("https://exemplo.com.br/a?b=1"), "https://exemplo.com.br/a?b=1");
    assert.equal(safeLink("  http://exemplo.com  "), "http://exemplo.com/");
    assert.equal(safeLink("javascript:alert(1)"), null);
    assert.equal(safeLink("data:text/html,<script>alert(1)</script>"), null);
    assert.equal(safeLink("ftp://exemplo.com"), null);
    assert.equal(safeLink("exemplo.com"), null);
  });

  test("tipo: imagem só quando os bytes confirmam; tipo estranho vira arquivo genérico", () => {
    assert.equal(storedType(PNG, ""), "image/png");
    assert.equal(storedType(GIF, "image/gif"), "image/gif");
    assert.equal(storedType(new TextEncoder().encode("<svg onload=alert(1)>"), "image/svg+xml"), "application/octet-stream");
    assert.equal(storedType(new TextEncoder().encode("%PDF-1.4"), "application/pdf"), "application/pdf");
    assert.equal(storedType(new TextEncoder().encode("oi"), "text/html; charset=utf-8"), "application/octet-stream");
    assert.equal(isImageAttachment({ kind: "file", mimeType: "image/png" }), true);
    assert.equal(isImageAttachment({ kind: "link", mimeType: null }), false);
  });

  test("download: imagem conferida abre; o resto baixa, com nosniff e sandbox; o nome vai certo", () => {
    const img = downloadHeaders({ name: "vitrine.png", kind: "file", mimeType: "image/png" }, 120, false);
    assert.equal(img["Content-Type"], "image/png");
    assert.match(img["Content-Disposition"], /^inline; /);
    assert.match(downloadHeaders({ name: "vitrine.png", kind: "file", mimeType: "image/png" }, 120, true)["Content-Disposition"], /^attachment; /);
    const pdf = downloadHeaders({ name: "orçamento \"final\".pdf", kind: "file", mimeType: "application/pdf" }, 10, false);
    assert.equal(pdf["Content-Type"], "application/octet-stream");
    assert.equal(pdf["Content-Disposition"], "attachment; filename=\"or_amento _final_.pdf\"; filename*=UTF-8''or%C3%A7amento%20%22final%22.pdf");
    assert.equal(pdf["X-Content-Type-Options"], "nosniff");
    assert.match(pdf["Content-Security-Policy"], /sandbox/);
    assert.equal(pdf["Content-Length"], "10");
  });

  test("tamanho do arquivo em pt-BR", () => {
    assert.equal(fileSize(512), "512 B");
    assert.equal(fileSize(830 * 1024), "830 KB");
    assert.equal(fileSize(1.25 * 1024 * 1024), "1,3 MB");
    assert.equal(fileSize(25 * 1024 * 1024), "25 MB");
  });
});
