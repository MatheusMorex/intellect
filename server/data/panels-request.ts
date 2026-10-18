// Os Painéis de uma tela são lidos uma vez só por acesso: a página e cada
// widget (cada um no próprio Suspense) chamam getPanels com os mesmos
// parâmetros e recebem o mesmo resultado, com as contas já feitas guardadas.

import { cache } from "react";

import { requireUser } from "@/server/auth/session";
import { loadPanels } from "@/server/data/panels";

export const getPanels = cache(async (dashboardId: string, queryKey: string) => {
  const user = await requireUser();
  return loadPanels({ user }, dashboardId, Object.fromEntries(new URLSearchParams(queryKey)));
});
