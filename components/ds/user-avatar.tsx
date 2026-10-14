import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

// Avatar de uma pessoa: a foto de perfil que ela enviou ou, sem foto (ou
// enquanto a foto carrega), as iniciais na cor dela.

export function UserAvatar({
  person,
  className,
  textClassName = "text-xs",
  title,
}: {
  person: { name: string; avatarColor: string; avatarUrl?: string | null };
  className?: string;
  textClassName?: string;
  title?: string;
}) {
  return (
    <Avatar className={className} title={title}>
      {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" className="object-cover" />}
      <AvatarFallback
        className={cn("font-semibold", textClassName)}
        style={{ background: `var(--ds-label-${person.avatarColor}-bold)`, color: "var(--ds-label-text-bold)" }}
      >
        {initials(person.name)}
      </AvatarFallback>
    </Avatar>
  );
}
