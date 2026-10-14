// Fusos horários das listas de escolha (perfil e dashboard). O fuso do
// dashboard decide o que é "hoje" nos números de vendas e de gasto.

export const TIMEZONES = [
  ["America/Sao_Paulo", "Brasília (São Paulo, Rio, BH, Sul)"],
  ["America/Manaus", "Amazonas (Manaus)"],
  ["America/Cuiaba", "Mato Grosso (Cuiabá)"],
  ["America/Belem", "Pará (Belém)"],
  ["America/Fortaleza", "Nordeste (Fortaleza, Salvador, Recife)"],
  ["America/Rio_Branco", "Acre (Rio Branco)"],
  ["America/Noronha", "Fernando de Noronha"],
  ["Europe/Lisbon", "Portugal (Lisboa)"],
  ["Europe/London", "Reino Unido (Londres)"],
  ["Europe/Zurich", "Suíça (Zurique, Genebra)"],
  ["Europe/Paris", "Europa Central (Paris, Madri, Berlim, Roma)"],
  ["UTC", "UTC"],
] as const;

/** A lista com o fuso atual no topo, quando ele não está nela. */
export function timezonesWith(current: string): readonly (readonly [string, string])[] {
  return TIMEZONES.some(([v]) => v === current) ? TIMEZONES : [[current, current], ...TIMEZONES];
}
