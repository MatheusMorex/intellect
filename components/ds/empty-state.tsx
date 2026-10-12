import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Estado vazio (components.md, "Estado vazio"): ícone, título, uma linha e a ação principal.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-10 text-center", className)}>
      {Icon && <Icon aria-hidden="true" className="mb-1 size-8 text-muted-foreground" />}
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="max-w-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
