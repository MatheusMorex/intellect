import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Faixa de aviso (components.md): informação, atenção, erro, sucesso.

type Variant = "info" | "warning" | "error" | "success";

const STYLE: Record<Variant, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "bg-muted", icon: "text-muted-foreground", Icon: Info },
  warning: { box: "bg-warning-subtle", icon: "text-warning", Icon: AlertTriangle },
  error: { box: "bg-danger-subtle", icon: "text-danger", Icon: OctagonAlert },
  success: { box: "bg-success-subtle", icon: "text-success", Icon: CheckCircle2 },
};

export function Banner({
  variant = "info",
  title,
  children,
  action,
  onDismiss,
  live = false,
  className,
}: {
  variant?: Variant;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  live?: boolean;
  className?: string;
}) {
  const { box, icon, Icon } = STYLE[variant];
  return (
    <div
      role={live ? (variant === "error" ? "alert" : "status") : undefined}
      className={cn("flex items-start gap-3 rounded-md px-4 py-3 text-foreground", box, className)}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", icon)} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-muted-foreground">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="icon-sm" aria-label="Dispensar aviso" onClick={onDismiss}>
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
