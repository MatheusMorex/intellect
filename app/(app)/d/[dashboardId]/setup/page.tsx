import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Banner } from "@/components/ds/banner";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getSetup, type SetupStep } from "@/server/data/settings";

export const metadata: Metadata = { title: "Configuração inicial" };

/** Título, explicação e o botão de cada passo. */
function stepText(step: SetupStep, dashboardId: string): { title: string; why: string; action: string; href: string } {
  const integrations = `/d/${dashboardId}/integrations`;
  switch (step.id) {
    case "plataformas":
      return {
        title: "Escolher as plataformas de anúncio",
        why: "Diz onde você anuncia, para o dashboard saber de onde buscar o gasto.",
        action: "Mudar as plataformas",
        href: `/settings?aba=vendas&dashboard=${dashboardId}`,
      };
    case "meta":
      return {
        title: "Conectar o Meta Ads e escolher as contas",
        why: "O gasto, as campanhas e os anúncios do Facebook e do Instagram entram por aqui.",
        action: step.done ? "Ver as contas" : "Conectar o Meta",
        href: `${integrations}?aba=anuncios`,
      };
    case "google":
      return {
        title: "Conectar o Google Ads e escolher as contas",
        why: "O gasto, as campanhas e as palavras-chave do Google entram por aqui.",
        action: step.done ? "Ver as contas" : "Conectar o Google",
        href: `${integrations}?aba=anuncios`,
      };
    case "loja":
      return {
        title: "Ligar a loja Shopify",
        why: "As vendas chegam da loja na hora em que acontecem, com a origem de cada uma.",
        action: step.done ? "Ver a loja" : "Ligar a loja",
        href: `${integrations}?aba=loja`,
      };
    case "parametros":
      return {
        title: "Colocar os parâmetros nos anúncios",
        why: "É o que diz de qual campanha, conjunto e anúncio veio cada venda. Sem eles, a venda aparece como não rastreada.",
        action: "Ver os parâmetros",
        href: `${integrations}?aba=utms`,
      };
    case "teste":
      return {
        title: "Fazer um teste de integração",
        why: "Um pedido de teste confere, de ponta a ponta, que a venda chega com a origem certa.",
        action: step.done ? "Ver os testes" : "Fazer o teste",
        href: `${integrations}?aba=testes`,
      };
  }
}

// S29 Configuração inicial: o passo a passo para o dashboard ficar pronto (aberto ao criar um dashboard e pela faixa do Resumo).
export default async function SetupPage({ params }: { params: Promise<{ dashboardId: string }> }) {
  const { dashboardId } = await params;
  const user = await requireUser();
  const setup = await getSetup({ user }, dashboardId);
  const total = setup.steps.length;
  const complete = setup.done === total;
  const next = setup.steps.find((s) => !s.done);

  return (
    <PageBody>
      <PageHeader title="Configuração inicial" help="setup" description={setup.dashboard.name} />

      <div className="grid gap-2 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">
            {setup.done} de {total} passos feitos
          </span>
          {!complete && next && <span className="text-muted-foreground">Próximo: {stepText(next, dashboardId).title.toLowerCase()}</span>}
        </div>
        <Progress value={Math.round((setup.done / total) * 100)} aria-label={`${setup.done} de ${total} passos feitos`} />
      </div>

      {complete && (
        <Banner
          variant="success"
          title="Tudo pronto"
          action={
            <Button asChild size="sm">
              <Link href={`/d/${dashboardId}`}>Abrir o Resumo</Link>
            </Button>
          }
        >
          As contas e a loja estão ligadas e o teste passou. Os números do dashboard já são da sua operação.
        </Banner>
      )}

      {!setup.canManage && !complete && (
        <p className="text-sm text-muted-foreground">Só admins do workspace conectam contas e lojas. Peça para um admin terminar a configuração.</p>
      )}

      <ol className="grid gap-3">
        {setup.steps.map((step, i) => {
          const text = stepText(step, dashboardId);
          const current = step === next;
          return (
            // No celular o botão desce para baixo do texto (ao lado, ele espreme a explicação).
            <li
              key={step.id}
              className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border bg-card p-4 sm:flex", current && "border-primary")}
              aria-current={current ? "step" : undefined}
            >
              {step.done ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
              ) : (
                <Circle aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", current ? "text-primary" : "text-muted-foreground")} />
              )}
              <div className="grid min-w-0 flex-1 gap-1">
                <h2 className="text-base font-semibold">
                  <span className="sr-only">{step.done ? "Feito: " : "Falta: "}</span>
                  {i + 1}. {text.title}
                </h2>
                <p className="text-sm text-muted-foreground">{text.why}</p>
                <p className={cn("text-sm", step.done ? "text-success" : "text-foreground")}>{step.detail}</p>
              </div>
              <Button asChild size="sm" variant={current ? "default" : "secondary"} className="col-start-2 justify-self-start sm:self-center">
                <Link href={text.href}>
                  {text.action}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </li>
          );
        })}
      </ol>
    </PageBody>
  );
}
