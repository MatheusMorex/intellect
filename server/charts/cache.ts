// Cache dos Painéis entre acessos (Fase 6): a mesma tela aberta de novo, por
// outra pessoa ou depois de trocar de aba, não refaz as contas.
//
// Quando vale jogar fora:
// - chegou dado novo (a versão dos dados mudou): o cache inteiro é esvaziado;
// - a hora do fuso do dashboard virou (a chave leva a hora local), para o
//   "Hoje", o balde parcial e os gráficos por hora andarem com o relógio;
// - passou o tempo máximo (rede de segurança para o que muda sem gravação,
//   como a linha "Hoje" do Gantt).
//
// Guarda a promessa, não o resultado: duas telas iguais pedidas ao mesmo tempo
// fazem as contas uma vez só. Se a conta falhar, a entrada sai do cache.

export type VersionedCache<T> = {
  /** O valor guardado para a chave, ou o que `load` devolver (e então fica guardado). */
  get(key: string, version: number, load: () => Promise<T>, nowMs?: number): Promise<T>;
  clear(): void;
  readonly size: number;
};

export function versionedCache<T>({ max, ttlMs }: { max: number; ttlMs: number }): VersionedCache<T> {
  let version = -1;
  const entries = new Map<string, { value: Promise<T>; at: number }>();

  /** Adota a versão nova (esvaziando tudo). Devolve false se `v` é mais velha que a atual. */
  const sync = (v: number) => {
    if (v < version) return false;
    if (v > version) {
      entries.clear();
      version = v;
    }
    return true;
  };

  return {
    get(key, v, load, nowMs = Date.now()) {
      if (!sync(v)) return load();
      const hit = entries.get(key);
      if (hit && nowMs - hit.at <= ttlMs) {
        // Map guarda a ordem de inserção: reinserir deixa a chave como a mais recente.
        entries.delete(key);
        entries.set(key, hit);
        return hit.value;
      }
      entries.delete(key);
      const value = load();
      const entry = { value, at: nowMs };
      entries.set(key, entry);
      value.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      while (entries.size > max) entries.delete(entries.keys().next().value!);
      return value;
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
