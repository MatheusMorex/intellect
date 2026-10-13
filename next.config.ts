import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents fica desligado: o app é interno e com login, então toda página
  // é montada na hora do acesso, e prazos, "há 3 min" e filtros de período usam a
  // hora atual o tempo todo. Ligar depois exige rever cada página.
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
