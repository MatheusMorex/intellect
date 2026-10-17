import { getCurrentUser } from "@/server/auth/session";
import { canReadFile, readFileData } from "@/server/files";
import { isLive } from "@/server/mode";
import { readStore } from "@/server/store/db";
import { createClient } from "@/utils/supabase/server";

// GET /api/files/<id> (simulado) ou /api/files/<pasta>/<pessoa>/<arquivo> (Supabase):
// entrega uma imagem enviada, só para quem pode vê-la.
// Sem acesso, a resposta é 404 (quem não pode ver não fica sabendo que existe).
// Cada envio ganha um nome novo, então o navegador pode guardar a imagem para sempre.

const HEADERS = {
  "Cache-Control": "private, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
};
const NOT_FOUND = () => new Response("Não encontrado.", { status: 404 });
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const user = await getCurrentUser();
  if (!user) return NOT_FOUND();

  if (isLive()) {
    // As regras do Storage (RLS) decidem quem vê: usamos a sessão da própria pessoa, não a chave secreta.
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from("uploads").download(path.map(decodeURIComponent).join("/"));
    if (error || !data || !TYPES.includes(data.type)) return NOT_FOUND();
    const bytes = new Uint8Array(await data.arrayBuffer());
    return new Response(bytes, { headers: { ...HEADERS, "Content-Type": data.type, "Content-Length": String(bytes.length) } });
  }

  const file = readStore().files.find((f) => f.id === path[0]);
  if (path.length !== 1 || !file || !canReadFile(user, file)) return NOT_FOUND();
  const data = readFileData(file);
  if (!data) return NOT_FOUND();
  return new Response(new Uint8Array(data), { headers: { ...HEADERS, "Content-Type": file.mime, "Content-Length": String(data.length) } });
}
