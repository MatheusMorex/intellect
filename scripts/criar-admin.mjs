// Cria a primeira conta (administrador) e o primeiro workspace no Supabase.
// Uso: npm run admin:criar -- seu@email.com "Seu Nome" [nome-do-workspace]
// Para o projeto de teste: npm run admin:criar -- --env .env.test.local seu@email.com "Nome"
//
// A senha é pedida aqui no terminal (não aparece enquanto você digita) e nunca
// passa pelo chat. O script usa a chave secreta do arquivo de ambiente.

import fs from "node:fs";
import readline from "node:readline";

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
let envFile = ".env.local";
const envIndex = args.indexOf("--env");
if (envIndex !== -1) envFile = args.splice(envIndex, 2)[1];
const [email, name, workspaceName = "INtellect"] = args;

if (!email || !name) {
  console.error('Uso: npm run admin:criar -- seu@email.com "Seu Nome" [nome-do-workspace]');
  process.exit(1);
}

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const env = readEnv(envFile);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error(`Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY em ${envFile}.`);
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput;
    rl._writeToOutput = (text) => {
      if (text.includes(question)) write.call(rl, text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const RULE = "A senha precisa de 8 a 50 caracteres, com letra maiúscula, número e caractere especial.";
const strong = (p) => p.length >= 8 && p.length <= 50 && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);

const slug = workspaceName
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const password = await askHidden("Escolha a senha: ");
if (!strong(password)) {
  console.error(RULE);
  process.exit(1);
}
if ((await askHidden("Repita a senha: ")) !== password) {
  console.error("As senhas não são iguais.");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: existing } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
if (existing) {
  console.error("Já existe uma conta com este e-mail. Nada foi alterado.");
  process.exit(1);
}
const { data: taken } = await db.from("workspaces").select("id").eq("slug", slug).maybeSingle();
if (taken) {
  console.error(`Já existe um workspace "${slug}". Nada foi alterado.`);
  process.exit(1);
}

const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
if (created.error || !created.data.user) {
  console.error("Não deu para criar a conta:", created.error?.message);
  process.exit(1);
}
const userId = created.data.user.id;

const workspace = await db.from("workspaces").insert({ name: workspaceName, slug, created_by: userId }).select("id").single();
if (workspace.error) {
  await db.auth.admin.deleteUser(userId);
  console.error("Não deu para criar o workspace (a conta foi desfeita):", workspace.error.message);
  process.exit(1);
}
const member = await db.from("workspace_members").insert({ workspace_id: workspace.data.id, user_id: userId, role: "admin" });
if (member.error) {
  await db.auth.admin.deleteUser(userId);
  await db.from("workspaces").delete().eq("id", workspace.data.id);
  console.error("Não deu para ligar a conta ao workspace (tudo foi desfeito):", member.error.message);
  process.exit(1);
}

console.log(`Pronto: conta ${email} criada como administradora do workspace "${workspaceName}" (/w/${slug}).`);
