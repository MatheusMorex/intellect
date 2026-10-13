// Entrada de números em pt-BR: "1.234,56" → 123456 centavos; "6,5" → 650 pontos-base.

export function parseMoneyToCents(input: string): number | null {
  const clean = input.replace(/[^\d,.-]/g, "").trim();
  if (!clean) return null;
  // Com vírgula: ponto é milhar. Sem vírgula: ponto é decimal só se tiver até 2 casas depois dele.
  let normalized: string;
  if (clean.includes(",")) normalized = clean.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{1,2}$/.test(clean)) normalized = clean;
  else normalized = clean.replace(/\./g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function parsePercentToBp(input: string): number | null {
  const clean = input.replace("%", "").replace(/\s/g, "").replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function centsToInput(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function bpToInput(bp: number | null | undefined) {
  if (bp == null) return "";
  return String(bp / 100).replace(".", ",");
}
