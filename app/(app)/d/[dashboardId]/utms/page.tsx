import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "UTMs" };

export default function UtmsPage() {
  return (
    <ComingSoon
      screen="S27"
      title="UTMs"
      description="Vendas agrupadas por utm_source, utm_campaign e os outros parâmetros, inclusive orgânico."
    />
  );
}
