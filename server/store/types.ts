// Linhas do armazenamento simulado. Os campos espelham as tabelas de
// replica/schema.sql (em camelCase). Quando o banco de verdade entrar
// (/replica-backend), só server/store e server/data mudam; as telas não.

import type { WeekStart } from "../../lib/charts/options.ts";

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
  bio: string;
  preferences: UserPreferences;
  /** Foto de perfil enviada pela pessoa (FileRow do tipo "avatar"). Sem foto, ficam as iniciais. */
  avatarFileId: Id | null;
  appearance: UserAppearance;
  lastActiveAt: IsoDateTime | null;
};

/** Plano de fundo do app: a imagem, o quanto o tema cobre a imagem (dim, 0–90%) e o desfoque (blur, 0–20 px). */
export type Wallpaper = { fileId: Id; dim: number; blur: number };

export type HomePage = "inicio" | "meus-cards" | "resumo";

export type UserAppearance = {
  wallpaper: Wallpaper | null;
  /** A frase em destaque sobre a INtellect no topo do Início. */
  showTaglines: boolean;
  /** Tela que abre depois de entrar. */
  homePage: HomePage;
};

export type UserPreferences = {
  colorblind: boolean;
  reduceMotion: boolean;
  singleKeyShortcuts: boolean;
  emailNotifications: "never" | "periodic" | "instant";
};

export type WorkspaceRow = {
  id: Id;
  name: string;
  slug: string;
  description: string;
  allowedEmailDomain: string | null;
  createdAt: IsoDateTime;
};

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
  /** Dia em que a semana começa nos gráficos dos Painéis (lib/charts/options.ts). */
  weekStart: WeekStart;
};

/**
 * Um painel de gráficos de um dashboard (S28 Painéis): os gráficos, onde cada
 * um fica na grade, quem vê e com que filtros abre. No banco: dashboard_panels.
 */
export type PanelRow = {
  id: Id;
  dashboardId: Id;
  name: string;
  /** Ordem das abas. */
  position: number;
  /** O painel que abre primeiro (um por dashboard). */
  isDefault: boolean;
  /** Quem vê, além dos admins do workspace: todo o workspace ou só as pessoas escolhidas. */
  visibility: "workspace" | "restricted";
  viewerIds: Id[];
  /** Membros podem mudar período e filtros só para a própria visualização (no endereço da página). */
  membersCanFilter: boolean;
  /** Período, agrupamento, comparação e filtros com que o painel abre (os parâmetros do endereço). */
  defaults: Record<string, string>;
  /** Configuração de cada gráfico (lib/charts/widgets.ts, PANEL_WIDGET), validada a cada leitura. */
  widgets: unknown[];
  /** Posição de cada gráfico na grade de 12 colunas (lib/charts/templates.ts). */
  layout: { i: string; x: number; y: number; w: number; h: number }[];
  createdBy: Id | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
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
  connectionId: Id | null;
  syncEnabled: boolean;
  lastSyncedAt: IsoDateTime | null;
  lastSyncError: string | null;
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
  targetCpaCents: number | null;
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

/** Formato do criativo. Hook e hold só existem para vídeo. */
export type AdFormat = "video" | "image" | "carousel" | null;

export type AdRow = {
  id: Id;
  adAccountId: Id;
  campaignId: Id;
  adSetId: Id;
  externalId: string;
  name: string;
  status: AdStatus;
  format: AdFormat;
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
  /** Visualizações de pelo menos 3 segundos do vídeo (o "hook" do Meta). */
  videoViews3s: number;
  /** Visualizações até 75% do vídeo (o "hold" de 75%). */
  videoP75Views: number;
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

/** Fundo do quadro: uma cor da paleta (lib/board-backgrounds.ts) ou uma imagem enviada (FileRow "board_background"). */
export type BoardBackground = { type: "color"; value: string } | { type: "image"; fileId: Id };

export type BoardRow = {
  id: Id;
  workspaceId: Id;
  name: string;
  description: string;
  background: BoardBackground;
  visibility: "private" | "workspace";
  prefs: BoardPrefs;
  nextCardNumber: number;
  closedAt: IsoDateTime | null;
  createdBy: Id | null;
  createdAt: IsoDateTime;
};

export type BoardPrefs = {
  /** Quem comenta: membros do quadro ou também os observadores. */
  comments: "members" | "observers";
  /** Membros do workspace editam quadros com visibilidade "workspace". */
  workspaceCanEdit: boolean;
  showCompleteOnFront: boolean;
  cardCovers: boolean;
  /** Etiquetas na frente do card: faixa fina ou com o nome. */
  labelsExpanded: boolean;
};

export type BoardMemberRow = { id: Id; boardId: Id; userId: Id; role: "admin" | "normal" | "observer" };

export type ListRow = { id: Id; boardId: Id; name: string; rank: string; color: string | null; archivedAt: IsoDateTime | null };

/** Capa do card: uma cor de etiqueta ou uma imagem anexada ao próprio card. */
export type CardCover = { size: "strip" | "full" } & ({ color: string; attachmentId?: undefined } | { attachmentId: Id; color?: undefined });

export type CardRow = {
  id: Id;
  boardId: Id;
  listId: Id;
  number: number;
  name: string;
  description: unknown | null; // documento do editor (Tiptap)
  descriptionText: string;
  version: number;
  rank: string;
  startAt: IsoDateTime | null;
  dueAt: IsoDateTime | null;
  dueComplete: boolean;
  dueReminderMinutes: number | null;
  dueRecurrence: "daily" | "weekly" | "monthly" | null;
  cover: CardCover | null;
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
  /** Execução de automação que gerou a atividade (proteção contra loop). */
  automationRunId?: Id | null;
  /** Nulo: as regras de automação ainda não olharam esta atividade. */
  automationCheckedAt?: IsoDateTime | null;
  createdAt: IsoDateTime;
};

export type AdConnectionRow = {
  id: Id;
  workspaceId: Id;
  provider: "meta" | "google";
  externalUserId: string;
  externalUserName: string | null;
  tokenExpiresAt: IsoDateTime | null;
  status: "active" | "expired" | "revoked" | "error";
  lastError: string | null;
  createdBy: Id | null;
  createdAt: IsoDateTime;
};

export type KeywordRow = {
  id: Id;
  adAccountId: Id;
  campaignId: Id;
  adSetId: Id;
  externalId: string;
  text: string;
  matchType: "exact" | "phrase" | "broad";
  status: AdStatus;
};

export type KeywordInsightRow = {
  id: Id;
  keywordId: Id;
  date: DateKey;
  currency: string;
  spendCents: number;
  impressions: number;
  clicks: number;
};

export type CostSettingRow = {
  id: Id;
  dashboardId: Id;
  validFrom: DateKey;
  salesTaxBp: number;
  metaAdsTaxBp: number;
  extraTaxes: { name: string; bp: number }[];
  createdBy: Id | null;
  createdAt: IsoDateTime;
};

export type ProductCostRow = {
  id: Id;
  productId: Id;
  costCents: number;
  currency: string;
  validFrom: DateKey;
  createdBy: Id | null;
  createdAt: IsoDateTime;
};

export type AdditionalFeeRow = {
  id: Id;
  dashboardId: Id;
  name: string;
  kind: "fixed" | "percent";
  amountCents: number | null;
  /** Moeda do valor fixo (a do dashboard quando a taxa foi salva). */
  currency: string;
  bp: number | null;
  scope: "all" | "product" | "payment_method";
  productId: Id | null;
  paymentMethod: PaymentMethod | null;
  validFrom: DateKey;
  validUntil: DateKey | null;
  createdBy: Id | null;
  createdAt: IsoDateTime;
};

export type ExpenseCategory = "traffic" | "tools" | "staff" | "accounting" | "other";

export type ExpenseRow = {
  id: Id;
  dashboardId: Id;
  kind: "once" | "recurring";
  category: ExpenseCategory;
  description: string;
  amountCents: number;
  currency: string;
  date: DateKey;
  endDate: DateKey | null;
  createdBy: Id | null;
  createdAt: IsoDateTime;
};

export type IntegrationTestRow = {
  id: Id;
  dashboardId: Id;
  trafficSource: "meta" | "google" | "organic";
  campaignUrl: string;
  testCode: string;
  status: "waiting" | "received" | "attributed" | "failed";
  orderId: Id | null;
  createdBy: Id | null;
  createdAt: IsoDateTime;
};

export type InviteRow = {
  id: Id;
  workspaceId: Id;
  boardId: Id | null;
  email: string | null;
  role: "admin" | "normal" | "observer";
  tokenHash: string;
  expiresAt: IsoDateTime;
  maxUses: number | null;
  usedCount: number;
  createdBy: Id | null;
  revokedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

export type BoardStarRow = { id: Id; userId: Id; boardId: Id; createdAt: IsoDateTime };
export type BoardVisitRow = { id: Id; userId: Id; boardId: Id; visitedAt: IsoDateTime };
export type CardMemberRow = { id: Id; cardId: Id; userId: Id; createdAt: IsoDateTime };

export type LabelRow = { id: Id; boardId: Id; name: string; color: string | null; createdAt: IsoDateTime };
export type CardLabelRow = { id: Id; cardId: Id; labelId: Id };

export type ChecklistRow = { id: Id; cardId: Id; name: string; rank: string; hideChecked: boolean; createdAt: IsoDateTime };

export type ChecklistItemRow = {
  id: Id;
  checklistId: Id;
  name: string;
  rank: string;
  completedAt: IsoDateTime | null;
  dueAt: IsoDateTime | null;
  assigneeId: Id | null;
  createdAt: IsoDateTime;
};

export type CommentRow = {
  id: Id;
  cardId: Id;
  authorId: Id | null;
  body: unknown; // documento do editor (Tiptap)
  bodyText: string;
  mentions: Id[];
  /** Comentário feito por uma automação (mostra "via automação"). */
  automationName?: string | null;
  editedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

export type NotificationRow = {
  id: Id;
  userId: Id;
  type: "mention" | "assigned" | "due_soon" | "comment" | "added_to_board" | "automation_error" | "integration_error";
  boardId: Id | null;
  cardId: Id | null;
  actorId: Id | null;
  data: Record<string, unknown>;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

/** E-mail que sairia (convite, menção). No modo simulado fica só aqui, como o Mailpit. */
export type OutboxRow = { id: Id; to: string; subject: string; text: string; link: string | null; createdAt: IsoDateTime };

/** Automação do quadro (S14/S15). trigger, filters e actions seguem lib/automation/schema.ts. */
export type AutomationRow = {
  id: Id;
  boardId: Id;
  type: "rule" | "metric" | "scheduled" | "due_date" | "card_button" | "board_button";
  name: string;
  trigger: Record<string, unknown>;
  filters: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  enabled: boolean;
  timezone: string;
  nextRunAt: IsoDateTime | null;
  dashboardId: Id | null;
  createdBy: Id | null;
  failureCount: number;
  disabledReason: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

/** Execução de uma automação (S16). depth e chain protegem contra loop. */
export type AutomationRunRow = {
  id: Id;
  automationId: Id;
  boardId: Id;
  triggerActivityId: Id | null;
  cardId: Id | null;
  status: "success" | "error" | "skipped";
  dedupeKey: string | null;
  depth: number;
  chain: Id[];
  message: string | null;
  operations: number;
  startedAt: IsoDateTime;
  finishedAt: IsoDateTime | null;
};

/**
 * Anexo de um card: arquivo do computador (até 25 MB) ou link. O arquivo fica em
 * .data/attachments/<storageKey> (no Supabase, no bucket "attachments"); a chave é
 * cards/<id do card>/<id novo>, e o nome original fica só aqui.
 */
export type AttachmentRow = {
  id: Id;
  cardId: Id;
  uploaderId: Id | null;
  kind: "file" | "link";
  name: string;
  /** Só no link (http ou https). */
  url: string | null;
  /** Só no arquivo. */
  storageKey: string | null;
  bytes: number | null;
  /** Tipo do arquivo: imagem conferida pelos primeiros bytes; nos outros, o que o navegador informou. */
  mimeType: string | null;
  createdAt: IsoDateTime;
};

/** Imagem enviada do computador da pessoa. O arquivo fica em .data/uploads/<id>.<ext> (no Supabase, no Storage). */
export type FileRow = {
  id: Id;
  ownerId: Id;
  kind: "avatar" | "wallpaper" | "board_background";
  /** Quadro do fundo (só "board_background"). */
  boardId: Id | null;
  mime: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  createdAt: IsoDateTime;
};

/** Cotação de referência do Banco Central Europeu: 1 BRL = rate unidades de quote, no dia útil date. */
export type FxRateRow = { date: DateKey; quote: string; rate: number };

/** Até onde as cotações de cada moeda já foram buscadas (fim de semana e feriado não têm cotação). */
export type FxCoverage = { from: DateKey; to: DateKey; fetchedAt: IsoDateTime };

export type Store = {
  version: number;
  seededAt: IsoDateTime;
  users: UserRow[];
  workspaces: WorkspaceRow[];
  workspaceMembers: WorkspaceMemberRow[];
  dashboards: DashboardRow[];
  panels: PanelRow[];
  adConnections: AdConnectionRow[];
  adAccounts: AdAccountRow[];
  dashboardAdAccounts: DashboardAdAccountRow[];
  campaigns: CampaignRow[];
  adSets: AdSetRow[];
  ads: AdRow[];
  adInsightsDaily: AdInsightRow[];
  keywords: KeywordRow[];
  keywordInsightsDaily: KeywordInsightRow[];
  stores: StoreRow[];
  dashboardStores: DashboardStoreRow[];
  webhookDeliveries: WebhookDeliveryRow[];
  products: ProductRow[];
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  orderEvents: OrderEventRow[];
  costSettings: CostSettingRow[];
  productCosts: ProductCostRow[];
  additionalFees: AdditionalFeeRow[];
  expenses: ExpenseRow[];
  integrationTests: IntegrationTestRow[];
  invites: InviteRow[];
  boards: BoardRow[];
  boardMembers: BoardMemberRow[];
  boardStars: BoardStarRow[];
  boardVisits: BoardVisitRow[];
  lists: ListRow[];
  cards: CardRow[];
  cardMembers: CardMemberRow[];
  labels: LabelRow[];
  cardLabels: CardLabelRow[];
  checklists: ChecklistRow[];
  checklistItems: ChecklistItemRow[];
  comments: CommentRow[];
  notifications: NotificationRow[];
  outbox: OutboxRow[];
  automations: AutomationRow[];
  automationRuns: AutomationRunRow[];
  /** Carimbo por quadro: muda a cada alteração e avisa quem está com o quadro aberto (tempo real). */
  boardStamps: Record<Id, string>;
  cardLinks: CardLinkRow[];
  activities: ActivityRow[];
  attachments: AttachmentRow[];
  files: FileRow[];
  fxRates: FxRateRow[];
  fxCoverage: Record<string, FxCoverage>;
};
