import Link from "next/link";

import { cn } from "@/lib/utils";

// Abas do workspace (S12): Membros e Configurações.
export function WorkspaceTabs({ slug, active }: { slug: string; active: "members" | "settings" }) {
  const tab = (id: "members" | "settings", label: string) => (
    <Link
      href={`/w/${slug}/${id}`}
      aria-current={active === id ? "page" : undefined}
      className={cn(
        "border-b-2 px-1 pb-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active === id ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Seções do workspace" className="flex gap-6 border-b">
      {tab("members", "Membros")}
      {tab("settings", "Configurações")}
    </nav>
  );
}
