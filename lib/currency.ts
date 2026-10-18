// Moedas que um dashboard pode usar para mostrar os valores. Os valores que
// chegam em outra moeda (pedido, gasto, custo) são convertidos pela cotação
// do dia (server/fx.ts).

export const DASHBOARD_CURRENCIES = [
  { code: "BRL", name: "Real", long: "Real brasileiro (R$)" },
  { code: "EUR", name: "Euro", long: "Euro (€)" },
  { code: "GBP", name: "Libra", long: "Libra esterlina (£)" },
  { code: "CHF", name: "Franco suíço", long: "Franco suíço (CHF)" },
  { code: "USD", name: "Dólar", long: "Dólar americano (US$)" },
] as const;

export type DashboardCurrency = (typeof DASHBOARD_CURRENCIES)[number]["code"];

export function isDashboardCurrency(code: string): code is DashboardCurrency {
  return DASHBOARD_CURRENCIES.some((c) => c.code === code);
}

export function currencyName(code: string) {
  return DASHBOARD_CURRENCIES.find((c) => c.code === code)?.name ?? code;
}
