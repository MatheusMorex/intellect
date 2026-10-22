// Cada tipo de evento que o app grava tem uma frase na Atividade (do card e do
// quadro): o teste varre o código do servidor atrás dos tipos gravados.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { activityText } from "../server/data/boards.ts";

const ROOT = path.join(import.meta.dirname, "..", "server");

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));
}

test("todo evento gravado tem frase na Atividade", () => {
  const types = new Set<string>();
  for (const file of files(ROOT)) {
    const code = fs.readFileSync(file, "utf8");
    // type: "card.moved" / log("card.field", …) / activity(store, user, card, "card.renamed", …)
    for (const m of code.matchAll(/(?:type: |log\(|activity\([^)]*?, )"((?:card|list|board)\.[a-z_]+)"/g)) types.add(m[1]);
    for (const m of code.matchAll(/\? "((?:card|list|board)\.[a-z_]+)" : "((?:card|list|board)\.[a-z_]+)"/g)) {
      types.add(m[1]);
      types.add(m[2]);
    }
  }
  assert.ok(types.size >= 20, `poucos tipos achados (${types.size}): o padrão da busca quebrou?`);
  const missing = [...types].filter((t) => activityText(t, { name: "X", from: "A", to: "B", value: "1" }) === "fez uma mudança");
  assert.deepEqual(missing, [], `eventos sem frase: ${missing.join(", ")}`);
});
