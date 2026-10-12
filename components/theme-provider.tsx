"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Tema claro, escuro ou automático. O next-themes põe data-theme="light|dark" no
// <html> antes da primeira pintura; os tokens (app/tokens.css) e a variante dark:
// do Tailwind leem esse atributo.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
