"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Toast (components.md): fundo popover, borda, sombra pop, z 70.
function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--ds-surface)",
          "--normal-text": "var(--ds-text)",
          "--normal-border": "var(--ds-border)",
          "--border-radius": "var(--ds-radius-md)",
          zIndex: "var(--ds-z-toast)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "shadow-pop font-sans",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-danger",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
