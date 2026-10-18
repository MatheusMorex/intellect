import { redirect } from "next/navigation";

import type { SearchParams } from "@/server/data/tracking";

// "Relatórios" virou "Painéis" (S28). O endereço antigo continua funcionando:
// leva para a tela nova com o mesmo período e os mesmos filtros.
export default async function ReportsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ dashboardId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { dashboardId } = await params;
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value != null) query.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  redirect(`/d/${encodeURIComponent(dashboardId)}/paineis${suffix}`);
}
