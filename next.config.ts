import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents fica desligado: o app é interno e com login, então toda página
  // é montada na hora do acesso, e prazos, "há 3 min" e filtros de período usam a
  // hora atual o tempo todo. Ligar depois exige rever cada página.
  // Sem o indicador do Next.js no canto da tela (o "N" e os pontinhos de
  // "Compiling…"/"Rendering…" que aparecem só no modo de desenvolvimento).
  // Erros de compilação e de execução continuam aparecendo.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
