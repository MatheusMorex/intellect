// Modo do app. AUTH_MODE=fake (padrão): login e dados simulados em .data/store.json.
// AUTH_MODE=live: login e dados no Supabase. O modo simulado sai quando todas as
// telas estiverem ligadas ao banco.

export function isLive() {
  return process.env.AUTH_MODE === "live";
}
