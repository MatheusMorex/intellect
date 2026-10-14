import { type NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/middleware";

// No Next.js 16 o antigo middleware.ts se chama proxy.ts e a função, proxy.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Tudo, menos arquivos estáticos, otimização de imagem, favicon e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
