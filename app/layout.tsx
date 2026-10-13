import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// A fonte entra como --font-inter; os tokens usam var(--font-inter, Inter).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "INtellect", template: "%s · INtellect" },
  description: "Quadros, automações e o resultado das campanhas da INtellect num lugar só.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider delayDuration={500}>
            {children}
            <Toaster position="bottom-right" visibleToasts={3} />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
