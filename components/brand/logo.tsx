import { cn } from "@/lib/utils";

// Peças da marca INtellect (public/marca, vindas de replica/design/marca).
// As duas versões do logo ficam no HTML e o CSS mostra a do tema, para não piscar.

const LOGO_RATIO = 485.87 / 100;

/** imgClassName muda o tamanho por tela (ex.: menor no celular), mantendo a proporção com w-auto. */
export function Logo({ height = 24, className, imgClassName }: { height?: number; className?: string; imgClassName?: string }) {
  const width = Math.round(height * LOGO_RATIO);
  return (
    <span className={cn("inline-flex", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático, sem otimização */}
      <img src="/marca/intellect-logo-para-fundo-claro.svg" alt="INtellect" width={width} height={height} className={cn("block dark:hidden", imgClassName)} />
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático, sem otimização */}
      <img src="/marca/intellect-logo-para-fundo-escuro.svg" alt="INtellect" width={width} height={height} className={cn("hidden dark:block", imgClassName)} />
    </span>
  );
}

type SymbolVariant = "square" | "purple" | "white";

const SYMBOL_FILE: Record<SymbolVariant, string> = {
  square: "/marca/intellect-simbolo.svg",
  purple: "/marca/intellect-simbolo-roxo.svg",
  white: "/marca/intellect-simbolo-branco.svg",
};

export function BrandSymbol({
  size = 32,
  variant = "square",
  alt = "INtellect",
  className,
}: {
  size?: number;
  variant?: SymbolVariant;
  alt?: string;
  className?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element -- SVG estático, sem otimização
  return <img src={SYMBOL_FILE[variant]} alt={alt} width={size} height={size} className={className} />;
}
