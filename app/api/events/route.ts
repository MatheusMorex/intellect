import { requireBoard } from "@/server/access";
import { getCurrentUser } from "@/server/auth/session";
import { adminClient } from "@/server/db/admin";
import { withLiveRead } from "@/server/live/scope";
import { isLive } from "@/server/mode";
import { readStore } from "@/server/store/db";

// GET /api/events?boardId= (architecture.md, F03): Server-Sent Events com as
// mudanças do quadro. No modo simulado, o carimbo do quadro no armazenamento é
// conferido a cada segundo; no modo real, a hora da última mudança do quadro
// (boards.updated_at) a cada 2 segundos.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Entre para acompanhar o quadro.", { status: 401 });
  const boardId = new URL(request.url).searchParams.get("boardId") ?? "";
  const canSee = await withLiveRead(user.id, () => {
    try {
      requireBoard({ user }, boardId);
      return true;
    } catch {
      return false;
    }
  });
  if (!canSee) return new Response(null, { status: 404 });

  const live = isLive();
  const every = live ? 2000 : 1000;
  const readStamp = async () => {
    if (!live) return readStore().boardStamps[boardId] ?? "";
    const { data, error } = await adminClient().from("boards").select("updated_at").eq("id", boardId).maybeSingle();
    if (error) throw error;
    return String(data?.updated_at ?? "");
  };

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let last = "";
  try {
    last = await readStamp();
  } catch {
    // tenta de novo no próximo intervalo
  }

  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // conexão fechada
        }
      };
      send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ stamp: last })}\n\n`);
      let busy = false;
      timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          const stamp = await readStamp();
          if (stamp !== last) {
            last = stamp;
            send(`event: board\ndata: ${JSON.stringify({ stamp })}\n\n`);
          }
        } catch {
          // arquivo sendo gravado ou rede instável: tenta no próximo intervalo
        } finally {
          busy = false;
        }
      }, every);
      heartbeat = setInterval(() => send(": ainda aqui\n\n"), 15000);
      request.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // já fechado
        }
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
