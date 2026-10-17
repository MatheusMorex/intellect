import { MailOpen, MailX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/ds/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/session";
import { getInviteByToken } from "@/server/data/boards";

import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Convite", robots: { index: false } };

const ROLE: Record<string, string> = { admin: "admin", normal: "membro", observer: "observador" };

const PROBLEM = {
  invalid: { title: "Convite não encontrado", text: "Confira se o link está completo. Se não der certo, peça um convite novo." },
  revoked: { title: "Este convite foi cancelado", text: "Quem convidou você cancelou este link. Peça um convite novo." },
  expired: { title: "Este convite expirou", text: "Convites por e-mail valem 7 dias. Peça um convite novo para quem convidou você." },
  used: { title: "Este convite já foi usado", text: "Cada convite por e-mail serve uma vez. Se foi você, é só entrar." },
} as const;

// S02 Aceitar convite: válido, expirado, cancelado, já usado ou já é membro.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  const invite = await getInviteByToken(token, user?.id ?? null);
  const target = invite.status !== "invalid" ? (invite.boardId ? `/b/${invite.boardId}` : `/w/${invite.workspaceSlug}`) : "/";

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="grid w-full max-w-md justify-items-center gap-6">
        <Logo height={32} />
        <div className="w-full rounded-lg border bg-card p-6 shadow-card">
          {invite.status === "valid" ? (
            <div className="grid gap-5">
              <div className="grid justify-items-center gap-2 text-center">
                <MailOpen aria-hidden="true" className="size-8 text-primary" />
                <h1 className="text-lg">
                  {invite.inviter} convidou você para {invite.boardName ? `o quadro ${invite.boardName}` : `o workspace ${invite.workspaceName}`}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Você entra como {ROLE[invite.role] ?? "membro"}
                  {invite.boardName ? ` no workspace ${invite.workspaceName}` : ""}.
                </p>
              </div>
              <InviteForm token={token} email={invite.email} signedInAs={user?.name ?? null} />
              {!user && (
                <p className="text-center text-sm text-muted-foreground">
                  Já tem conta?{" "}
                  <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="font-medium text-primary hover:underline">
                    Entre e volte para este link
                  </Link>
                </p>
              )}
            </div>
          ) : invite.status === "member" ? (
            <EmptyState
              icon={MailOpen}
              title="Você já faz parte"
              description={invite.boardName ? `Você já é membro do quadro ${invite.boardName}.` : `Você já é do workspace ${invite.workspaceName}.`}
              action={
                <Button asChild>
                  <Link href={target}>Abrir {invite.boardName ? "o quadro" : "o workspace"}</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={MailX}
              title={PROBLEM[invite.status].title}
              description={PROBLEM[invite.status].text}
              action={
                <Button asChild variant="outline">
                  <Link href={user ? "/" : "/login"}>{user ? "Ir para o início" : "Ir para o login"}</Link>
                </Button>
              }
            />
          )}
        </div>
      </div>
    </main>
  );
}
