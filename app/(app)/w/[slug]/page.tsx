import { BarChart3, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/server/auth/session";
import { getWorkspaceHome } from "@/server/data/boards";

export const metadata: Metadata = { title: "Início" };

// S03 Início do workspace. Nesta etapa: os quadros e os dashboards, como atalhos.
export default async function WorkspaceHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const home = await getWorkspaceHome({ user }, slug);

  return (
    <PageBody>
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}`} description={`Workspace ${home.workspace.name}`} />

      <section aria-labelledby="quadros" className="grid gap-3">
        <h2 id="quadros" className="text-base font-semibold">
          Quadros
        </h2>
        {home.boards.length === 0 ? (
          <p className="text-muted-foreground">Nenhum quadro ainda.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {home.boards.map((b) => (
              <li key={b.id} className="relative">
                <Link
                  href={`/b/${b.id}`}
                  className="flex h-24 rounded-lg p-3 text-sm font-semibold text-white outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  style={{ background: `var(--ds-label-${b.background}-bold)` }}
                >
                  {b.name}
                </Link>
                <Star aria-hidden="true" className="pointer-events-none absolute right-3 bottom-3 size-4 text-white/60" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dashboards" className="grid gap-3">
        <h2 id="dashboards" className="text-base font-semibold">
          Dashboards de vendas
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {home.dashboards.map((d) => (
            <li key={d.id}>
              <Link
                href={`/d/${d.id}`}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <BarChart3 aria-hidden="true" className="size-5 text-primary" />
                <span className="grid">
                  <span className="font-semibold">{d.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.adPlatforms.map((p) => (p === "meta" ? "Meta" : "Google")).join(" e ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageBody>
  );
}
