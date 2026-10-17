import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { homeHref } from "@/server/data/boards";

// A raiz leva à tela inicial escolhida em Configurações (Início, Meus cards ou
// Resumo), ou ao login.
export default async function Root() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(await homeHref(user.id));
}
