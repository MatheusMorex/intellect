// npm run dev:teste-real — liga o app no modo real (AUTH_MODE=live) apontado
// para o projeto de TESTE do Supabase (chaves do .env.test.local), para o
// npm run test:e2e:live. O .env.local (projeto principal) não é tocado: as
// variáveis daqui valem por cima dele só neste servidor.

import { spawn } from "node:child_process";

process.loadEnvFile(".env.test.local");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("aqaijwpnudhftlxwsfdm")) {
  console.error("O .env.test.local não aponta para o projeto de teste (intellect-teste).");
  process.exit(1);
}

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  // Relógio da automação desligado: as regras entram no modo real na etapa 3.
  env: { ...process.env, AUTH_MODE: "live", AUTOMATION_CLOCK: "off" },
});
child.on("exit", (code) => process.exit(code ?? 0));
