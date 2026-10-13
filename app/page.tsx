import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { getShellData } from "@/server/data/boards";

// A raiz leva ao início do workspace, ou ao login.
export default async function Root() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { workspace } = await getShellData({ user });
  redirect(workspace ? `/w/${workspace.slug}` : "/me");
}
