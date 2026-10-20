// Só para os testes do modo real (tests/live): as actions rodam fora do Next,
// então quem está logado vem de tests/live/test-session.ts (o teste escolhe a
// pessoa) e o revalidatePath não faz nada. O resto do app é o de verdade.
//
// Uso, dentro do teste, antes de importar as actions:
//   register("./stubs.mjs", import.meta.url)

const SESSION = new URL("./test-session.ts", import.meta.url).href;
const NEXT_CACHE = new URL("./test-next-cache.ts", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  // O próprio substituto importa a sessão de verdade pelo caminho relativo (não passa por aqui).
  if (specifier === "@/server/auth/session") return { url: SESSION, shortCircuit: true };
  if (specifier === "next/cache") return { url: NEXT_CACHE, shortCircuit: true };
  return nextResolve(specifier, context);
}
