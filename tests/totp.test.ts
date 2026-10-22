// O "celular de teste" (tests/totp.ts) calcula o código igual a um aplicativo
// autenticador: confere com os exemplos da própria norma (RFC 6238).

import assert from "node:assert/strict";
import { test } from "node:test";

import { base32Decode, totp } from "./totp.ts";

// Segredo da RFC: "12345678901234567890" em base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("base32 volta para os bytes certos", () => {
  assert.equal(base32Decode(RFC_SECRET).toString("ascii"), "12345678901234567890");
  assert.equal(base32Decode("MZXW6YTBOI======").toString("ascii"), "foobar");
});

test("códigos de 8 dígitos da RFC 6238 (SHA-1)", () => {
  const cases: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ];
  for (const [seconds, code] of cases) assert.equal(totp(RFC_SECRET, seconds * 1000, 8), code, `em ${seconds}s`);
});

test("6 dígitos: os últimos 6 do mesmo cálculo, e muda a cada 30 segundos", () => {
  assert.equal(totp(RFC_SECRET, 59_000), "287082");
  assert.equal(totp(RFC_SECRET, 30_000), totp(RFC_SECRET, 59_999));
  assert.notEqual(totp(RFC_SECRET, 59_999), totp(RFC_SECRET, 60_000));
});
