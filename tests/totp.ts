// Código do aplicativo autenticador (TOTP, RFC 6238), só para os testes: faz o
// papel do celular. O app em si não calcula código; quem confere é o Supabase.

import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(text: string) {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of text.replace(/[\s=]/g, "").toUpperCase()) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) throw new Error(`caractere fora do base32: ${ch}`);
    value = ((value << 5) | index) & 0xffffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** O código da janela de 30 segundos de `at`. */
export function totp(secret: string, at = Date.now(), digits = 6, step = 30) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / step)));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}

/** Um código diferente do último usado (o mesmo código não vale duas vezes): espera a próxima janela se precisar. */
export async function freshTotp(secret: string, used: Set<string>) {
  for (;;) {
    const code = totp(secret);
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
