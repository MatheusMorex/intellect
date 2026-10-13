"use server";

import { requireUser } from "@/server/auth/session";
import { getNotifications, search } from "@/server/data/boards";

// Leituras pedidas pela barra superior (busca global S10 e sino S11).
// No backend real viram GET /api/search e GET /api/notifications.

export async function globalSearch(q: string) {
  const user = await requireUser();
  return search({ user }, q.slice(0, 200));
}

export async function loadNotifications(onlyUnread: boolean) {
  const user = await requireUser();
  return getNotifications({ user }, onlyUnread);
}
