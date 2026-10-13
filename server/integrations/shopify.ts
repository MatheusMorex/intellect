// Cliente da Shopify com duas implementações atrás da mesma interface
// (architecture.md: INTEGRATIONS_MODE=fake|live). A "fake" lê a jornada do
// cliente de .data/fake-shopify.json, que o npm run simulate:order escreve.
// A "live" (GraphQL Admin API, CustomerJourneySummary) entra quando o dono
// aprovar a conexão real.

import fs from "node:fs";
import path from "node:path";

import type { Visit } from "@/server/store/types";

export type CustomerJourney = {
  firstVisit: Visit | null;
  lastVisit: Visit | null;
  daysToConversion: number | null;
};

export interface ShopifyClient {
  getCustomerJourney(shopDomain: string, orderGid: string): Promise<CustomerJourney | null>;
}

const FAKE_FILE = path.join(process.cwd(), ".data", "fake-shopify.json");

const fakeShopify: ShopifyClient = {
  async getCustomerJourney(_shop, orderGid) {
    try {
      const data = JSON.parse(fs.readFileSync(FAKE_FILE, "utf8")) as { journeys?: Record<string, CustomerJourney> };
      return data.journeys?.[orderGid] ?? null;
    } catch {
      return null;
    }
  },
};

const liveShopify: ShopifyClient = {
  async getCustomerJourney() {
    throw new Error("A integração real da Shopify ainda não está ligada (INTEGRATIONS_MODE=live sem app instalado).");
  },
};

export function shopifyClient(): ShopifyClient {
  return process.env.INTEGRATIONS_MODE === "live" ? liveShopify : fakeShopify;
}
