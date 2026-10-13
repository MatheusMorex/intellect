// Atribuição de um pedido a um anúncio (architecture.md, "Parâmetros de URL").
// Lê a última visita da jornada da Shopify (a primeira, se faltar a última),
// pega os parâmetros itl_* e as UTMs da página de entrada e casa com os ids
// externos de anúncio, conjunto e campanha. Função pura: os testes ficam em
// tests/attribution.test.ts.

import type { AttributionStatus, Id, Visit } from "../store/types.ts";

export type Platform = "meta" | "google";

export type AdIndex = {
  findAd(platform: Platform, externalId: string): { campaignId: Id; adSetId: Id; adId: Id } | null;
  findAdSet(platform: Platform, externalId: string): { campaignId: Id; adSetId: Id } | null;
  findCampaign(platform: Platform, externalIdOrName: string): { campaignId: Id } | null;
};

export type Attribution = {
  status: AttributionStatus;
  platform: Platform | null;
  campaignId: Id | null;
  adSetId: Id | null;
  adId: Id | null;
  isTest: boolean;
  landingPage: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  src: string | null;
  sck: string | null;
};

const META_SOURCES = new Set(["meta", "facebook", "fb", "instagram", "ig", "an", "msg"]);
const GOOGLE_SOURCES = new Set(["google", "adwords", "googleads", "gads"]);

function clean(value: string | null | undefined) {
  const v = value?.trim();
  // Parâmetro que chegou sem ser preenchido pela plataforma: {{ad.id}}, {creative}.
  if (!v || /^\{\{?.*\}?\}$/.test(v)) return null;
  return v;
}

/** Lê os parâmetros de uma página de entrada, absoluta ou relativa ("/produtos/kit?utm_source=…"). */
export function readParams(landingPage: string | null): URLSearchParams {
  if (!landingPage) return new URLSearchParams();
  try {
    return new URL(landingPage, "https://loja.invalid").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

export function platformOf(utmSource: string | null): Platform | "other" | null {
  if (!utmSource) return null;
  const s = utmSource.toLowerCase();
  if (META_SOURCES.has(s)) return "meta";
  if (GOOGLE_SOURCES.has(s)) return "google";
  return "other";
}

export function attribute(
  journey: { firstVisit: Visit | null; lastVisit: Visit | null } | null,
  index: AdIndex,
): Attribution {
  const visit = journey?.lastVisit ?? journey?.firstVisit ?? null;
  const params = readParams(visit?.landingPage ?? null);
  const get = (key: string) => clean(params.get(key));

  const utmSource = get("utm_source") ?? clean(visit?.utm.source);
  const utmMedium = get("utm_medium") ?? clean(visit?.utm.medium);
  const utmCampaign = get("utm_campaign") ?? clean(visit?.utm.campaign);
  const utmContent = get("utm_content") ?? clean(visit?.utm.content);
  const utmTerm = get("utm_term") ?? clean(visit?.utm.term);
  const itl = { c: get("itl_c"), s: get("itl_s"), a: get("itl_a") };

  const base: Attribution = {
    status: "untracked",
    platform: null,
    campaignId: null,
    adSetId: null,
    adId: null,
    isTest: params.has("itl_test"),
    landingPage: visit?.landingPage ?? null,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    src: get("src"),
    sck: get("sck"),
  };

  const sourcePlatform = platformOf(utmSource);
  const candidates: Platform[] =
    sourcePlatform === "meta" || sourcePlatform === "google" ? [sourcePlatform] : itl.c || itl.a ? ["meta", "google"] : [];

  for (const platform of candidates) {
    // Do nível mais fino para o mais grosso: anúncio, conjunto, campanha.
    const ad = itl.a ? index.findAd(platform, itl.a) : null;
    if (ad) return { ...base, status: "tracked", platform, ...ad };
    const adSet = itl.s ? index.findAdSet(platform, itl.s) : null;
    if (adSet) return { ...base, status: "tracked", platform, ...adSet, adId: null };
    const campaign =
      (itl.c ? index.findCampaign(platform, itl.c) : null) ??
      (utmCampaign ? index.findCampaign(platform, utmCampaign) : null);
    if (campaign) return { ...base, status: "tracked", platform, ...campaign, adSetId: null, adId: null };
  }

  if (sourcePlatform === "meta" || sourcePlatform === "google") {
    // Veio do anúncio, mas a campanha não está (ou ainda não está) sincronizada.
    return { ...base, status: "tracked", platform: sourcePlatform };
  }
  if (sourcePlatform === "other") return { ...base, status: "other_source" };
  return base;
}
