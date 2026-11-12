/**
 * Typed API client. The browser always talks to one origin and Next proxies `/api/*`.
 *
 * مهم برای Render (و هر PaaS): اگر NEXT_PUBLIC_API_BASE_URL مثل
 * `https://forooshyar-api.onrender.com/` با اسلش انتهایی ست شود، هر مسیر به
 * `//auth/login` تبدیل می‌شد و API با ۴۰۴ جواب می‌داد (path در لاگ audit:
 * `//auth/login`). حالا **همه‌ی** اسلش‌های انتهایی حذف می‌شوند.
 * اگر مقدار ناقص/غلط باشد هم بی‌صدا خراب نمی‌کنیم: در development هشدار، در
 * production توکن/درخواست به همان origin (`/api`) می‌رود.
 */
function resolveApiBase(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return '/api';
  if (/^https?:\/\//.test(value) || value.startsWith('/')) return value;
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[api] NEXT_PUBLIC_API_BASE_URL نامعتبر  است (${raw}); از /api هم‌مبدأ استفاده می‌شود.`);
  }
  return '/api';
}

export const API_BASE = resolveApiBase(process.env.NEXT_PUBLIC_API_BASE_URL);
const TOKEN_KEY = 'forooshyar.token';

export type Variant = {
  id: string; productId: string; sku: string | null; size: string; color: string;
  optionsJson?: Record<string, string>;
  price: number; stock: number; active: boolean; stockUpdatedAt: string;
};
export type ProductAttribute = {
  id: string; name: string; sortOrder: number;
  values: { id: string; value: string; sortOrder: number }[];
};
export type Product = {
  id: string; title: string; description: string; category: string;
  active: boolean; createdAt: string; updatedAt: string; variants: Variant[];
  type?: 'PRODUCT' | 'SERVICE';
  isShippable?: boolean;
  defaultPrice?: number | null; defaultStock?: number | null; compareAtPrice?: number | null;
  serviceDurationMinutes?: number | null; serviceRequiresBooking?: boolean; serviceCapacity?: number | null;
  attributes?: ProductAttribute[];
};
export type Shop = {
  id: string; name: string; tone: string; shipping: string; payment: string;
  workingHours: string; returns: string; handoffMessage: string; smsPhone?: string; notifySellerBySms?: boolean;
  receiptAutoConfirm?: boolean; receiptAutoConfirmMax?: number | null; paymentWaitHours?: number;
};
export type PaymentMethod = {
  id: string; holderName: string; masked: string; last4: string;
  bankName: string; sheba: string; instruction: string; active: boolean; sortOrder: number;
};
export type ReceiptPolicy = {
  receiptAutoConfirm: boolean; receiptAutoConfirmMax: number | null; paymentWaitHours: number;
};
export type Movement = {
  id: string; delta: number; reason: string; createdAt: string;
  variant: { id: string; size: string; color: string; price: number; product: { id: string; title: string } };
};
export type Summary = {
  products: { total: number; active: number };
  variants: { total: number; outOfStock: number; lowStock: number; stale: number };
  inventory: { totalStock: number; value: number; lowStockThreshold: number };
  sales: {
    today: { units: number; revenue: number };
    week: { units: number; revenue: number };
    series: { date: string; units: number; revenue: number }[];
  };
  recent: Movement[];
};
export type NotificationItem = {
  id: string;
  kind: 'order' | 'message' | 'stock' | 'waitlist' | 'system';
  title: string;
  body: string;
  at: string;
  href: string;
  tone: 'brand' | 'amber' | 'danger';
};
export type Notifications = { items: NotificationItem[]; total: number; generatedAt: string };
export type AttentionItem = {
  id: string; size: string; color: string; price: number; stock: number;
  stockUpdatedAt: string; severity: 'out' | 'low' | 'stale';
  product: { id: string; title: string };
};
export type ImportResult = {
  imported: number; failed: number;
  results: { row: number; status: string; errors?: string[] }[];
};
export type BotReply = {
  kind: 'answer' | 'clarify' | 'handoff';
  text: string;
  reason?: string;
  /** 'ai' یعنی پاسخ از مدل زبانی آمده، نه از موتور قاعده‌محور. */
  source?: 'rules' | 'ai';
};
export type AiStatus = {
  enabled: boolean;
  ready: boolean;
  model: string;
  provider: string;
  reason: string;
};
export type TelegramWebhook = {
  /** آیا تلگرام آدرسی برای این بات ثبت کرده است */
  registered: boolean;
  /** آدرس ثبت‌شده به همین سرویس اشاره می‌کند */
  pointsHere: boolean;
  pending: number;
  /** دکمه‌های inline کار می‌کنند (webhook با callback_query ثبت شده) */
  buttonsWork: boolean;
  lastError: string;
  error: string;
};
export type TelegramStatus = {
  botConfigured: boolean;
  webhook: TelegramWebhook;
  botUsername: string;
  /** لینکی که فروشنده به مشتری‌ها می‌دهد */
  customerLink: string | null;
  code: string | null;
  active: boolean;
  ownerLinked: boolean;
  ownerLinkedAt: string | null;
  conversations: number;
};
export type OrderStatus = 'AWAITING_PAYMENT' | 'RECEIPT_RECEIVED' | 'NEEDS_REVIEW' | 'PAID' | 'PREPARING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type OrderItem = {
  id: string; title: string; spec: string; price: number; quantity: number; variantId: string | null;
};
export type Order = {
  id: string; code: string; status: OrderStatus;
  chatId: string | null; customerName: string; customerPhone: string; address: string; note: string;
  province: string; city: string; street: string; alley: string; plaque: string; unit: string; postalCode: string;
  subtotal?: number; shippingCost?: number; discount?: number; shippingMethodId?: string | null;
  total: number; paymentProvider: string; paymentRefId: string; paidAt: string | null;
  cancelledReason: string; createdAt: string; updatedAt: string;
  items: OrderItem[]; itemsCount?: number;
};
export type ShippingMethod = {
  id: string; name: string; kind: 'FIXED' | 'FREE_OVER' | 'TABLE' | 'PICKUP';
  baseCost: number; freeOver: number | null; rulesJson: Record<string, number>;
  active: boolean; sortOrder: number;
};
export type ReceiptCheck = { check: string; ok: boolean; detail: string };
export type PaymentReceipt = {
  id: string; orderId: string; verdict: 'CONFIRMED' | 'NEEDS_REVIEW' | 'REJECTED';
  verdictReason: string; extractedJson: Record<string, unknown>; checksJson: ReceiptCheck[];
  reviewNote: string; reviewedAt: string | null; createdAt: string;
  order?: { id: string; code: string; total: number; customerName: string; customerPhone: string; status: OrderStatus; createdAt: string };
};
export type ChatMessage = {
  id: string; chatId: string; direction: 'in' | 'out'; text: string;
  /** نویسنده: 'customer' | 'bot' | 'seller' */
  author?: 'customer' | 'bot' | 'seller' | string;
  orderId: string | null; createdAt: string;
  /** اگر این پیام ریپلای باشد: متن نقل‌شده و نویسنده‌ی پیام اصلی. */
  replyToId?: string | null;
  replyText?: string;
  replyFrom?: 'in' | 'out' | '';
};
export type OrdersSummary = {
  awaitingPayment: number; paidLast24h: number; revenueLast24h: number;
  /** سفارش‌های لغوشده: مجموع و ۲۴ ساعت گذشته. */
  cancelled?: number; cancelledLast24h?: number;
  recent: { id: string; code: string; total: number; status: OrderStatus; customerName: string; createdAt: string }[];
};
export type TelegramOwnerCode = { ownerCode: string | null; ownerLink: string | null; command?: string; reason?: string };

/** پیج‌های قابل انتخاب و وضعیت اتصال اینستاگرام برای فروشگاه جاری. */
export type InstagramAccount = {
  id: string;
  username: string;
  profilePhoto: string;
  active: boolean;
  expiresAt: string | null;
  mine: boolean;
};
export type InstagramStatus = {
  configured: boolean;
  connectable: boolean;
  accountLinked: boolean;
  account: {
    id: string;
    username: string;
    profilePhoto: string;
    expiresAt: string | null;
    daysLeft: number | null;
    active: boolean;
    linkedAt: string | null;
  } | null;
  webhookUrl: string;
  webhookUrlIsHttps: boolean;
  signatureEnforced: boolean;
  stats: { messages: number; conversations: number; lastEventAt: string | null; lastEventAction: string };
};
export type SaleResult = Variant & { stock: number };
export type AuthResult = { accessToken: string; tokenType: string; expiresIn: number };

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const tokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) { window.localStorage.setItem(TOKEN_KEY, token); },
  clear() { window.localStorage.removeItem(TOKEN_KEY); },
};

const messages: Record<number, string> = {
  400: 'اطلاعات ارسالی معتبر نیست. مقادیر فرم را بررسی کنید.',
  401: 'نشست شما پایان یافته است. دوباره وارد شوید.',
  404: 'موردی با این شناسه پیدا نشد.',
  409: 'این عملیات با وضعیت فعلی موجودی یا داده‌های تکراری سازگار نیست.',
  413: 'حجم فایل بیش از حد مجاز است (حداکثر ۲ مگابایت).',
  429: 'تعداد درخواست‌ها زیاد بود؛ چند لحظه بعد دوباره تلاش کنید.',
  500: 'خطای غیرمنتظره‌ای در سرور رخ داد.',
};

/** Pull the first human-readable message out of a Nest/Zod error payload. */
function describe(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, unknown>;
  const flatten = body.message ?? body.error;
  if (typeof flatten === 'string') return flatten;
  if (Array.isArray(flatten) && typeof flatten[0] === 'string') return flatten[0];
  if (flatten && typeof flatten === 'object') {
    const fieldErrors = (flatten as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    const first = fieldErrors && Object.values(fieldErrors).find(list => list?.length);
    if (first?.[0]) return first[0];
  }
  return null;
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean };

export async function request<T>(path: string, { body, auth = true, headers = {}, ...rest }: Options = {}): Promise<T> {
  const token = auth ? tokenStore.get() : null;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string>),
    },
    ...(body !== undefined ? { body: isForm ? (body as FormData) : JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = text; } }

  if (!response.ok) {
    if (response.status === 401 && auth && typeof window !== 'undefined') {
      tokenStore.clear();
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
    }
    const detail = describe(payload);
    throw new ApiError(detail || messages[response.status] || `درخواست انجام نشد (${response.status}).`, response.status, payload);
  }
  return payload as T;
}

// ------------------------------------------------------ گفتگوها و مشتریان
export type ConversationSummary = {
  id: string;
  chatId: string;
  name: string;
  username: string;
  messageCount: number;
  lastMessage: { id: string; text: string; direction: string; author?: string; at: string } | null;
  pending: boolean;
  orders: number;
  spent: number;
  lastSeenAt: string;
  createdAt: string;
};
export type Conversations = {
  items: ConversationSummary[];
  counts: { all: number; pending: number; open: number };
};
export type ThreadMessage = {
  id: string;
  direction: 'in' | 'out';
  /** نویسنده: مشتری، بات یا فروشنده — پنل با همین حباب و برچسب را می‌چیند. */
  author?: 'customer' | 'bot' | 'seller' | string;
  text: string;
  at: string;
  replyText?: string;
  replyFrom?: string;
  orderId?: string | null;
};
export type ConversationThread = {
  conversation: { id: string; chatId: string; name: string; username: string; lastSeenAt: string; createdAt: string };
  messages: ThreadMessage[];
  orders: { id: string; code: string; status: OrderStatus; total: number; createdAt: string }[];
};
export type CustomerRow = {
  chatId: string;
  name: string;
  username: string;
  messageCount: number;
  orders: number;
  paidOrders: number;
  value: number;
  lastActivityAt: string;
  firstSeenAt: string;
  segments: { buyer: boolean; repeat: boolean; quiet: boolean };
};
export type Customers = {
  items: CustomerRow[];
  counts: { all: number; buyers: number; repeat: number; value: number };
};

export const api = {
  login: (email: string, password: string) =>
    request<AuthResult>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (email: string, password: string, shopName: string) =>
    request<AuthResult>('/auth/register', { method: 'POST', body: { email, password, shopName }, auth: false }),

  shop: () => request<Shop>('/shop'),
  updateShop: (body: Partial<Shop>) => request<Shop>('/shop', { method: 'PATCH', body }),

  paymentMethods: () => request<PaymentMethod[]>('/payment-methods'),
  createPaymentMethod: (body: { holderName: string; cardNumber: string; bankName?: string; sheba?: string; instruction?: string }) =>
    request<PaymentMethod>('/payment-methods', { method: 'POST', body }),
  updatePaymentMethod: (id: string, body: Partial<PaymentMethod> & { cardNumber?: string }) =>
    request<PaymentMethod>(`/payment-methods/${id}`, { method: 'PATCH', body }),
  deletePaymentMethod: (id: string) =>
    request<{ ok: true }>(`/payment-methods/${id}`, { method: 'DELETE' }),
  receiptPolicy: () => request<ReceiptPolicy>('/payment-methods/receipt-policy'),
  updateReceiptPolicy: (body: Partial<ReceiptPolicy>) =>
    request<ReceiptPolicy>('/payment-methods/receipt-policy', { method: 'PATCH', body }),

  products: () => request<Product[]>('/products'),
  product: (id: string) => request<Product>(`/products/${id}`),
  createProduct: (body: {
    title: string; description?: string; category?: string;
    type?: 'PRODUCT' | 'SERVICE'; isShippable?: boolean;
    defaultPrice?: number | null; defaultStock?: number | null; compareAtPrice?: number | null;
    serviceDurationMinutes?: number | null; serviceRequiresBooking?: boolean; serviceCapacity?: number | null;
  }) => request<Product>('/products', { method: 'POST', body }),
  updateProduct: (id: string, body: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: 'PATCH', body }),
  archiveProduct: (id: string) => request<Product>(`/products/${id}`, { method: 'DELETE' }),
  attributeSuggestions: () =>
    request<{ names: string[]; valuesByName: Record<string, string[]> }>('/attribute-suggestions'),
  setAttributes: (productId: string, attributes: { name: string; values: string[] }[]) =>
    request<Product>(`/products/${productId}/attributes`, { method: 'POST', body: { attributes } }),
  generateVariants: (productId: string) =>
    request<{ created: number; kept: number; deactivated: number; product: Product }>(`/products/${productId}/generate-variants`, { method: 'POST' }),
  bulkVariants: (productId: string, body: {
    variantIds?: string[]; priceMode?: 'set' | 'percent'; priceValue?: number;
    stockMode?: 'set' | 'add'; stockValue?: number;
  }) => request<{ updated: number }>(`/products/${productId}/bulk-variants`, { method: 'POST', body }),

  createVariant: (productId: string, body: { sku?: string; size?: string; color?: string; price: number; stock: number }) =>
    request<Variant>(`/products/${productId}/variants`, { method: 'POST', body }),
  updateVariant: (id: string, body: { sku?: string | null; size?: string; color?: string; price?: number; active?: boolean }) =>
    request<Variant>(`/variants/${id}`, { method: 'PATCH', body }),
  archiveVariant: (id: string) => request<Variant>(`/variants/${id}`, { method: 'DELETE' }),

  sell: (id: string, quantity = 1) =>
    request<SaleResult>(`/variants/${id}/sell`, {
      method: 'POST',
      body: { quantity },
      headers: { 'Idempotency-Key': `web-${crypto.randomUUID()}` },
    }),
  adjustStock: (id: string, delta: number, reason: 'restock' | 'manual' = 'manual') =>
    request<Variant>(`/variants/${id}/stock`, { method: 'POST', body: { delta, reason } }),
  movements: (variantId: string) =>
    request<{ id: string; delta: number; reason: string; createdAt: string }[]>(`/variants/${variantId}/movements`),

  importCatalog: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<ImportResult>('/catalog/import', { method: 'POST', body: form });
  },

  botPreview: (message: string) => request<BotReply>('/bot/preview', { method: 'POST', body: { message } }),
  botAi: () => request<AiStatus>('/bot/ai'),

  telegramStatus: () => request<TelegramStatus>('/channel/telegram'),
  telegramConnect: () => request<TelegramStatus>('/channel/telegram/connect', { method: 'POST' }),
  /** ثبت webhook از سمت خود سرور (سرور به تلگرام دسترسی دارد، لپ‌تاپ شاید نه) */
  telegramRegisterWebhook: () =>
    request<{ ok: boolean; url: string }>('/channel/telegram/register-webhook', { method: 'POST' }),
  telegramOwnerCode: () => request<TelegramOwnerCode>('/channel/telegram/owner-code', { method: 'POST' }),
  telegramDisconnectOwner: () => request<TelegramStatus>('/channel/telegram/disconnect-owner', { method: 'POST' }),
  telegramDisable: () => request<TelegramStatus>('/channel/telegram', { method: 'DELETE' }),

  instagramStatus: () => request<InstagramStatus>('/instagram/status'),
  instagramConnectUrl: () => request<{ ok: boolean; url?: string; error?: string }>('/instagram/connect-url'),
  instagramAccounts: () => request<{ ok: boolean; items: InstagramAccount[]; error?: string }>('/instagram/accounts'),
  instagramEvents: () => request<{ ok: boolean; items: { eventType: string; at: string; summary: string }[] }>('/instagram/events'),
  instagramLink: (accountId: string) =>
    request<{ ok: boolean; error?: string; accountId?: string; username?: string }>('/instagram/link', { method: 'POST', body: { accountId } }),
  instagramUnlink: () => request<{ ok: boolean; error?: string }>('/instagram/link', { method: 'DELETE' }),
  instagramTest: (recipientId: string) =>
    request<{ ok: boolean; error?: string; message?: string }>('/instagram/test', { method: 'POST', body: { recipientId } }),
  instagramBackfillProfiles: () =>
    request<{ checked: number; updated: number; failed: number }>('/instagram/backfill-profiles', { method: 'POST' }),

  orders: (query: { status?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.limit) params.set('limit', String(query.limit));
    const suffix = params.toString() ? `?${params}` : '';
    return request<Order[]>(`/orders${suffix}`);
  },
  order: (id: string) => request<Order>(`/orders/${id}`),
  ordersSummary: () => request<OrdersSummary>('/orders/summary'),
  setOrderStatus: (id: string, status: OrderStatus) =>
    request<Order>(`/orders/${id}/status`, { method: 'POST', body: { status } }),

  shippingMethods: () => request<ShippingMethod[]>('/shipping-methods'),
  createShippingMethod: (body: { name: string; kind: ShippingMethod['kind']; baseCost: number; freeOver?: number | null; rules?: Record<string, number> }) =>
    request<ShippingMethod>('/shipping-methods', { method: 'POST', body }),
  updateShippingMethod: (id: string, body: Partial<ShippingMethod> & { rules?: Record<string, number> }) =>
    request<ShippingMethod>(`/shipping-methods/${id}`, { method: 'PATCH', body }),
  deleteShippingMethod: (id: string) =>
    request<{ ok: true }>(`/shipping-methods/${id}`, { method: 'DELETE' }),

  receiptQueue: () => request<PaymentReceipt[]>('/receipts/review-queue'),
  reviewReceipt: (id: string, decision: 'CONFIRMED' | 'REJECTED', note?: string) =>
    request<PaymentReceipt>(`/receipts/${id}/review`, { method: 'POST', body: { decision, note } }),
  orderMessages: (id: string) => request<ChatMessage[]>(`/orders/${id}/messages`),
  sendOrderMessage: (id: string, text: string, replyToId?: string) =>
    request<ChatMessage[]>(`/orders/${id}/message`, { method: 'POST', body: { text, ...(replyToId ? { replyToId } : {}) } }),

  // -------------------------------------------------- گفتگوها و مشتریان
  conversations: () => request<Conversations>('/chat/conversations'),
  conversation: (chatId: string) => request<ConversationThread>(`/chat/conversations/${encodeURIComponent(chatId)}`),
  replyConversation: (chatId: string, text: string) =>
    request<{ ok: boolean; message?: ThreadMessage; error?: string }>(
      `/chat/conversations/${encodeURIComponent(chatId)}/reply`, { method: 'POST', body: { text } },
    ),
  customers: () => request<Customers>('/chat/customers'),

  summary: () => request<Summary>('/reports/summary'),
  attention: () => request<AttentionItem[]>('/reports/attention'),
  notifications: () => request<Notifications>('/reports/notifications'),
};
