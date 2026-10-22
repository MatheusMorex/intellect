// Como ordenar os cards de uma lista: pelo menu da lista e pela ação de automação.

export const LIST_SORTS = ["prazo", "nome", "novos", "antigos"] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export const LIST_SORT_LABEL: Record<ListSort, string> = {
  prazo: "Prazo (mais perto primeiro)",
  nome: "Nome (A a Z)",
  novos: "Mais novos primeiro",
  antigos: "Mais antigos primeiro",
};

type Sortable = { id: string; name: string; dueAt: string | null; createdAt: string; number: number };

const byName = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Prazo mais perto primeiro (sem prazo no fim), nome, mais novos ou mais antigos; empate desfeito sempre do mesmo jeito. */
export function compareCards(by: ListSort) {
  return (a: Sortable, b: Sortable) => {
    if (by === "nome") return byName.compare(a.name, b.name) || a.id.localeCompare(b.id);
    if (by === "prazo") {
      if (a.dueAt !== b.dueAt) return a.dueAt == null ? 1 : b.dueAt == null ? -1 : a.dueAt.localeCompare(b.dueAt);
      return byName.compare(a.name, b.name) || a.id.localeCompare(b.id);
    }
    const order = a.createdAt.localeCompare(b.createdAt) || a.number - b.number;
    return by === "novos" ? -order : order;
  };
}
