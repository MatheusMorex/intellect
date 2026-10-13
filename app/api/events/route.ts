import { requireBoard } from "@/server/access";
import { getCurrentUser } from "@/server/auth/session";
import { readStore } from "@/server/store/db";

// GET /api/events?boardId= (architecture.md, F03): Server-Sent Events com as
// mudanças do quadro. No backend real o aviso vem do LISTEN/NOTIFY do Postgres;
// aqui, o carimbo do quadro no armazenamento é conferido a cada segundo.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Entre para acompanhar o quadro.", { status: 401 });
  const boardId = new URL(request.url).searchParams.get("boardId") ?? "";
  try {
    requireBoard({ user }, boardId);
  } catch {
    return new Response(null, { status: 404 });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let last = readStore().boardStamps[boardId] ?? "";
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // conexão fechada
        }
      };
      send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ stamp: last })}\n\n`);
      timer = setInterval(() => {
        let stamp = last;
        try {
          stamp = readStore().boardStamps[boardId] ?? "";
        } catch {
          return; // arquivo sendo gravado; tenta no próximo segundo
        }
        if (stamp !== last) {
          last = stamp;
          send(`event: board\ndata: ${JSON.stringify({ stamp })}\n\n`);
        }
      }, 1000);
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
