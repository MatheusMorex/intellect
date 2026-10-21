import { downloadHeaders, readAttachment } from "@/server/attachments";
import { getCurrentUser } from "@/server/auth/session";

// GET /api/attachments/<id>: entrega o arquivo de um anexo, só para quem vê o
// quadro do card. Sem acesso, 404 (quem não pode ver não fica sabendo que existe).
// ?baixar=1 sempre baixa; sem ele, imagens abrem no navegador.

const NOT_FOUND = () => new Response("Não encontrado.", { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NOT_FOUND();
  const { attachmentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) return NOT_FOUND();
  const found = await readAttachment(user, attachmentId);
  if (!found) return NOT_FOUND();
  const download = new URL(request.url).searchParams.get("baixar") === "1";
  return new Response(new Uint8Array(found.bytes), { headers: downloadHeaders(found.row, found.bytes.length, download) });
}
