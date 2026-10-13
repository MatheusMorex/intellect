// Linhas do armazenamento simulado. Os campos espelham as tabelas de
// replica/schema.sql (em camelCase). Quando o banco de verdade entrar
// (/replica-backend), só server/store e server/data mudam; as telas não.

export type Id = string;
export type IsoDateTime = string; // timestamptz, sempre em UTC
export type DateKey = string; // date, "2026-10-12"

export type UserRow = {
  id: Id;
  name: string;
  email: string;
  username: string | null;
  timezone: string;
  theme: "light" | "dark" | "system";
  passwordHash: string; // só no modo simulado; no Better Auth fica em accounts
  avatarColor: string; // tom de etiqueta usado nas iniciais
};

export type WorkspaceRow = { id: Id; name: string; slug: string; createdAt: IsoDateTime };

export type WorkspaceMemberRow = { id: Id; workspaceId: Id; userId: Id; role: "admin" | "normal" };

export type DashboardRow = {
  id: Id;
  workspaceId: Id;
  name: string;
  timezone: string;
  currency: string;
  revenueBasis: "net" | "gross";
  includeInterest: boolean;
  revenueGoalCents: number | null;
  adPlatforms: ("meta" | "google")[];
};

export type AdAccountRow = {
  id: Id;
  workspaceId: Id;
  provider: "meta" | "google";
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  status: "active" | "disabled" | "unsettled" | "closed" | "unknown";
  lastSyncedAt: IsoDateTime | null;
};

export type DashboardAdAccountRow = { id: Id; dashboardId: Id; adAccountId: Id };

export type AdStatus = "active" | "paused" | "deleted" | "archived" | "in_review" | "rejected" | "with_issues" | "unknown";

export type CampaignRow = {
  id: Id;
  adAccountId: Id;
  externalId: string;
  name: string;
  status: AdStatus;
  channelType: string | null;
  dailyBudgetCents: number | null;
};

export type AdSetRow = {
  id: Id;
  adAccountId: Id;
  campaignId: Id;
  externalId: string;
  name: string;
  status: AdStatus;
  dailyBudgetCents: number | null;
};

export type AdRow = {
  id: Id;
  adAccountId: Id;
  campaignId: Id;
  adSetId: Id;
  externalId: string;
  name: string;
  status: AdStatus;
};

export type AdInsightRow = {
  id: Id;
  adAccountId: Id;
  campaignId: Id;
  adSetId: Id | null;
  adId: Id | null;
  date: DateKey;
  currency: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  addToCarts: number;
};

export type StoreRow = {
  id: Id;
  workspaceId: Id;
  platform: "shopify";
  shopDomain: string;
  name: string;
  currency: string;
  timezone: string;
  status: "active" | "uninstalled" | "error";
  webhooksOk: boolean;
  lastEventAt: IsoDateTime | null;
};

export type DashboardStoreRow = { id: Id; dashboardId: Id; storeId: Id };

export type WebhookDeliveryRow = {
  id: Id;
  storeId: Id | null;
  source: "shopify";
  deliveryId: string;
  topic: string;
  payload: unknown | null; // apagado depois de processado
  receivedAt: IsoDateTime;
  processedAt: IsoDateTime | null;
  attempts: number;
  error: string | null;
};

export type ProductRow = { id: Id; workspaceId: Id; storeId: Id; externalId: string; name: string };

export type OrderStatus = "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback" | "cancelled";
export type PaymentMethod = "credit_card" | "pix" | "boleto" | "paypal" | "other";
export type AttributionStatus = "pending" | "tracked" | "untracked" | "other_source";

export type Visit = {
  occurredAt: IsoDateTime | null;
  landingPage: string | null;
  referrerUrl: string | null;
  source: string | null;
  utm: Partial<Record<"source" | "medium" | "campaign" | "content" | "term", string>>;
};

export type OrderRow = {
  id: Id;
  workspaceId: Id;
  storeId: Id;
  externalId: string;
  name: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  currency: string;
  totalCents: number;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  refundedCents: number;
  gatewayFeeCents: number | null;
  interestCents: number;
  isTest: boolean;
  placedAt: IsoDateTime;
  paidAt: IsoDateTime | null;
  sourceUpdatedAt: IsoDateTime;
  firstVisit: Visit | null;
  lastVisit: Visit | null;
  landingPage: string | null;
  daysToConversion: number | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  src: string | null;
  sck: string | null;
  attributionStatus: AttributionStatus;
  attributedPlatform: "meta" | "google" | null;
  campaignId: Id | null;
  adSetId: Id | null;
  adId: Id | null;
  createdAt: IsoDateTime;
};

export type OrderItemRow = {
  id: Id;
  orderId: Id;
  productId: Id | null;
  externalLineId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type OrderEventRow = {
  id: Id;
  orderId: Id;
  status: OrderStatus;
  occurredAt: IsoDateTime;
  topic: string;
  webhookDeliveryId: Id | null;
};

export type BoardRow = {
  id: Id;
  workspaceId: Id;
  name: string;
  description: string;
  background: { type: "color"; value: string };
  visibility: "private" | "workspace";
  nextCardNumber: number;
  closedAt: IsoDateTime | null;
  createdBy: Id | null;
  createdAt: IsoDateTime;
};

export type BoardMemberRow = { id: Id; boardId: Id; userId: Id; role: "admin" | "normal" | "observer" };

export type ListRow = { id: Id; boardId: Id; name: string; rank: string; color: string | null; archivedAt: IsoDateTime | null };

export type CardRow = {
  id: Id;
  boardId: Id;
  listId: Id;
  number: number;
  name: string;
  descriptionText: string;
  rank: string;
  startAt: IsoDateTime | null;
  dueAt: IsoDateTime | null;
  dueComplete: boolean;
  cover: { color: string } | null;
  createdBy: Id | null;
  lastActivityAt: IsoDateTime;
  archivedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

export type CardLinkRow = {
  id: Id;
  cardId: Id;
  dashboardId: Id;
  targetType: "campaign" | "ad_set" | "ad" | "product" | "dashboard";
  campaignId: Id | null;
  adSetId: Id | null;
  adId: Id | null;
  productId: Id | null;
  createdBy: Id | null;
  createdAt: IsoDateTime;
};

export type ActivityRow = {
  id: Id;
  workspaceId: Id;
  boardId: Id | null;
  cardId: Id | null;
  actorId: Id | null;
  actorKind: "user" | "automation" | "system";
  type: string;
  data: Record<string, unknown>;
  createdAt: IsoDateTime;
};

export type Store = {
  version: number;
  seededAt: IsoDateTime;
  users: UserRow[];
  workspaces: WorkspaceRow[];
  workspaceMembers: WorkspaceMemberRow[];
  dashboards: DashboardRow[];
  adAccounts: AdAccountRow[];
  dashboardAdAccounts: DashboardAdAccountRow[];
  campaigns: CampaignRow[];
  adSets: AdSetRow[];
  ads: AdRow[];
  adInsightsDaily: AdInsightRow[];
  stores: StoreRow[];
  dashboardStores: DashboardStoreRow[];
  webhookDeliveries: WebhookDeliveryRow[];
  products: ProductRow[];
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  orderEvents: OrderEventRow[];
  boards: BoardRow[];
  boardMembers: BoardMemberRow[];
  lists: ListRow[];
  cards: CardRow[];
  cardLinks: CardLinkRow[];
  activities: ActivityRow[];
};
