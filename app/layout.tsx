import React from 'react';
import Link from 'next/link';
import { MOCK_WORKSPACE } from '@/lib/mocks/data';
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "INtellect", template: "%s · INtellect" },
  description: "Quadros, automações e o resultado das campanhas da INtellect num lugar só.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider>
          <TooltipProvider delayDuration={500}>
            <div className="flex h-screen overflow-hidden">
              {/* Sidebar Base */}
              <aside className="w-64 bg-secondary/30 border-r border-border flex flex-col">
                <div className="p-4 border-b border-border flex items-center gap-2 font-bold text-xl text-primary">
                  <div className="w-8 h-8 bg-primary rounded-lg" />
                  INtellect
                </div>

                <nav className="flex-1 p-4 space-y-8 overflow-y-auto">
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Trabalho</h3>
                    <ul className="space-y-2">
                      <li>
                        <Link href={`/w/${MOCK_WORKSPACE.slug}`} className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>🏠 Home</span>
                        </Link>
                      </li>
                      <li>
                        <Link href={`/b/b1/fluxo-operacoes`} className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>📋 Quadro Principal</span>
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Dados</h3>
                    <ul className="space-y-2">
                      <li>
                        <Link href={`/d/d1`} className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>📊 Resumo</span>
                        </Link>
                      </li>
                      <li>
                        <Link href={`/d/d1/analytics`} className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>📈 Analytics</span>
                        </Link>
                      </li>
                      <li>
                        <Link href={`/d/d1/meta`} className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>💙 Meta Ads</span>
                        </Link>
                      </li>
                      <li>
                        <Link href={`/d/d1/google`} className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>❤️ Google Ads</span>
                        </Link>
                      </li>
                      <li>
                        <Link href={`/d/d1/orders`} className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>🛒 Vendas</span>
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Sistema</h3>
                    <ul className="space-y-2">
                      <li>
                        <Link href="/s/settings/butler" className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>🤖 Butler (Automações)</span>
                        </Link>
                      </li>
                      <li>
                        <Link href="/integrations" className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>🔌 Integrações</span>
                        </Link>
                      </li>
                      <li>
                        <Link href="/me" className="flex items-center p-2 rounded-md hover:bg-accent transition-colors">
                          <span>👤 Perfil</span>
                        </Link>
                      </li>
                    </ul>
                  </div>
                </nav>

                <div className="p-4 border-t border-border bg-secondary/10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary" />
                    <div className="text-sm font-medium truncate">Soare</div>
                  </div>
                </div>
              </aside>

              {/* Main Content Area */}
              <main className="flex-1 flex flex-col overflow-hidden bg-background">
                <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-sm">
                  <div className="text-sm text-muted-foreground">
                    INtellect / <span className="text-foreground font-medium">Dashboard</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="bg-secondary px-3 py-1 rounded-full text-xs font-medium">
                      Modo Escuro 🌙
                    </div>
                  </div>
                </header>
                <div className="flex-1 overflow-auto p-6">
                  {children}
                </div>
              </main>
            </div>
            <Toaster position="bottom-right" visibleToasts={3} />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
