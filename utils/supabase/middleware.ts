import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Renova a sessão do Supabase a cada requisição. Chamado pelo proxy.ts da raiz.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Sem as variáveis do Supabase o app segue no modo atual, sem quebrar.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          // Resposta que grava cookie de sessão não pode ficar em cache de CDN.
          Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
        },
      },
    },
  );

  // Não coloque código entre createServerClient e getClaims(): se o getClaims()
  // sair daqui, usuários podem ser deslogados sem motivo aparente.
  await supabase.auth.getClaims();

  // O guia oficial redireciona quem não tem sessão do Supabase para o login.
  // Isso fica de fora enquanto o login do app for o simulado (AUTH_MODE=fake):
  // ninguém tem sessão do Supabase ainda, e o redirecionamento travaria todas
  // as telas e o webhook da Shopify. Entra quando o login migrar para o Supabase.

  // Devolva o supabaseResponse como está. Se precisar de outra resposta, copie
  // os cookies e os cabeçalhos dele, senão a sessão sai de sincronia.
  return supabaseResponse;
}
