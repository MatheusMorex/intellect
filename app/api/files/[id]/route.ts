import { getCurrentUser } from "@/server/auth/session";
import { canReadFile, readFileData } from "@/server/files";
import { readStore } from "@/server/store/db";

// GET /api/files/<id>: entrega uma imagem enviada, só para quem pode vê-la.
// Sem acesso, a resposta é 404 (quem não pode ver não fica sabendo que existe).
// Cada envio ganha um id novo, então o navegador pode guardar a imagem para sempre.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const file = readStore().files.find((f) => f.id === id);
  if (!user || !file || !canReadFile(user, file)) return new Response("Não encontrado.", { status: 404 });
  const data = readFileData(file);
  if (!data) return new Response("Não encontrado.", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
