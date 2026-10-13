// npm run seed — apaga os dados simulados (.data). Na próxima vez que o app
// abrir uma tela, os dados de exemplo são criados de novo, do zero.

import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), ".data");
fs.rmSync(dir, { recursive: true, force: true });
console.log("Dados simulados apagados. Abra o app de novo para recriar os dados de exemplo.");
