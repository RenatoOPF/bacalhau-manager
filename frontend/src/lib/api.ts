const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

const TOKEN_KEY = 'bacalhau_token';

// Pula a página de aviso do ngrok (plano free) quando o backend é exposto por
// um túnel *.ngrok-free.app. Inofensivo com qualquer outro host.
const baseHeaders: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
};

export const auth = {
  getToken: (): string | null =>
    typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Lançado quando a API responde — carrega o status HTTP para tratamento. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  const token = auth.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...baseHeaders,
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, `API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---- Tipos compartilhados (espelham o backend) ----

/** Vínculo prato/opção → insumo. qtyMilli = consumo por venda em milésimos
 *  da unidade do insumo (1000 = 1 porção/kg/un). Em itens com opções de
 *  tamanho refere-se à Porção Inteira (a Meia desconta metade). */
export interface StockLink {
  id: string;
  stockItemId: string;
  menuItemId?: string | null;
  optionId?: string | null;
  qtyMilli: number;
}

export interface MenuItemOption {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
  sortOrder?: number;
  // Insumos da opção (proteína por opção, ex.: Tilápia/Salmão).
  stockLinks?: StockLink[];
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  available: boolean;
  // Presente quando o item tem variações (ex.: Individual/Inteira). Quando há
  // opções, o preço vem da opção escolhida.
  options?: MenuItemOption[];
  // Insumos consumidos pelo prato (um prato pode descontar de vários).
  stockLinks?: StockLink[];
}

export interface MenuCategory {
  id: string;
  name: string;
  // Presentes no endpoint admin (/menu/admin).
  sortOrder?: number;
  active?: boolean;
  items: MenuItem[];
}

export interface CreateItemPayload {
  categoryId: string;
  name: string;
  description?: string;
  priceCents: number;
}

export interface UpdateItemPayload {
  name?: string;
  description?: string;
  priceCents?: number;
  available?: boolean;
}

export type OrderStatus =
  | 'RECEIVED'
  | 'IN_PREPARATION'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELED';

export interface OrderItem {
  id: string;
  nameSnapshot: string;
  optionNameSnapshot?: string | null;
  quantity: number;
  priceCents: number;
  notes?: string | null;
}

export type OrderChannel = 'OWN' | 'IFOOD' | 'NOVENTA_NOVE' | 'GAMI';

export interface Order {
  id: string;
  protocol: number;
  dailyNumber: number;
  status: OrderStatus;
  channel: OrderChannel;
  customerName: string;
  addressStreet: string;
  addressNumber?: string | null;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PENDING' | 'PAID';
  paidAt?: string | null;
  createdAt: string;
  items: OrderItem[];
}

export type PaymentMethod = 'CASH' | 'PIX' | 'ONLINE';

/** Rótulos de canal e forma de pagamento para exibição. */
export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  OWN: 'Cardápio',
  IFOOD: 'iFood',
  NOVENTA_NOVE: '99',
  GAMI: 'Gami',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  ONLINE: 'Online (app)',
};

export interface Transaction {
  id: string;
  protocol: number;
  dailyNumber: number;
  customerName: string;
  paymentMethod: PaymentMethod;
  totalCents: number;
  paidAt: string;
}

export interface RevenueReport {
  from?: string;
  to?: string;
  count: number;
  totalCents: number;
  byDay: { date: string; count: number; totalCents: number }[];
}

export interface ChannelReportItem {
  channel: OrderChannel;
  count: number;
  totalCents: number;
}

export interface TopItem {
  name: string;
  quantity: number;
  totalCents: number;
}

export interface DailySummary {
  date: string;
  count: number;
  totalCents: number;
  byMethod: Record<string, { count: number; totalCents: number }>;
}

// Payload reduzido do acompanhamento público (sem endereço/dados do cliente).
export interface TrackedOrder {
  protocol: number;
  dailyNumber: number;
  status: OrderStatus;
  createdAt: string;
  items: {
    nameSnapshot: string;
    optionNameSnapshot?: string | null;
    quantity: number;
  }[];
}

export interface CreateOrderPayload {
  customerName: string;
  customerPhone?: string;
  addressStreet: string;
  addressNumber?: string;
  paymentMethod: 'CASH' | 'PIX';
  notes?: string;
  items: {
    menuItemId: string;
    optionId?: string;
    quantity: number;
    notes?: string;
  }[];
}

export interface CreateOptionPayload {
  name: string;
  priceCents: number;
  sortOrder?: number;
}

export interface UpdateOptionPayload {
  name?: string;
  priceCents?: number;
  sortOrder?: number;
  available?: boolean;
}

// ---- Estoque ----

export type StockUnit = 'porção' | 'kg' | 'un';

export interface StockItem {
  id: string;
  name: string;
  unit: StockUnit;
  qty: number;
  alertQty: number;
  active: boolean;
  linkedCount: number;
  source?: { id: string; name: string; unit: StockUnit } | null;
  // Substituto quando zerado (ex.: Porção 200g ↔ 400g).
  substituteId?: string | null;
  substituteFactor?: number;
  substitute?: { id: string; name: string } | null;
}

export interface StockMovementRow {
  id: string;
  deltaQty: number;
  reason: string;
  orderId?: string | null;
  createdAt: string;
}

export interface UpdateStockPayload {
  name?: string;
  unit?: StockUnit;
  active?: boolean;
  alertQty?: number;
  setQty?: number;
  deltaQty?: number;
  substituteId?: string | null;
  substituteFactor?: number;
}

export type Role = 'ADMIN' | 'MANAGER' | 'KITCHEN' | 'DELIVERY';

export interface Employee {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  createdAt?: string;
}

export interface Session {
  token: string;
  employee: Pick<Employee, 'id' | 'name' | 'username' | 'role'>;
}

export interface CreateEmployeePayload {
  name: string;
  username: string;
  password: string;
  role: Role;
}

export interface UpdateEmployeePayload {
  name?: string;
  role?: Role;
  active?: boolean;
  password?: string;
}

// ---- Endpoints ----

export const api = {
  getMenu: () => request<MenuCategory[]>('/menu'),

  // ---- Autenticação ----
  login: (username: string, password: string) =>
    request<Session>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<Employee>('/auth/me'),

  // ---- Funcionários (ADMIN) ----
  listEmployees: () => request<Employee[]>('/employees'),
  createEmployee: (payload: CreateEmployeePayload) =>
    request<Employee>('/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateEmployee: (id: string, payload: UpdateEmployeePayload) =>
    request<Employee>(`/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // ---- Gestão do cardápio (admin) ----
  getFullMenu: () => request<MenuCategory[]>('/menu/admin'),
  createCategory: (name: string, sortOrder?: number) =>
    request<MenuCategory>('/menu/categories', {
      method: 'POST',
      body: JSON.stringify({ name, sortOrder }),
    }),
  createItem: (payload: CreateItemPayload) =>
    request<MenuItem>('/menu/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateItem: (id: string, payload: UpdateItemPayload) =>
    request<MenuItem>(`/menu/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteItem: (id: string) =>
    request<{ id: string }>(`/menu/items/${id}`, { method: 'DELETE' }),
  deleteCategory: (id: string) =>
    request<{ id: string }>(`/menu/categories/${id}`, { method: 'DELETE' }),
  updateCategory: (
    id: string,
    payload: { name?: string; sortOrder?: number; active?: boolean },
  ) =>
    request<MenuCategory>(`/menu/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  moveCategory: (id: string, direction: 'up' | 'down') =>
    request<{ moved: boolean }>(`/menu/categories/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
  moveItem: (id: string, direction: 'up' | 'down') =>
    request<{ moved: boolean }>(`/menu/items/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),

  // ---- Opções (variações) do item ----
  createOption: (itemId: string, payload: CreateOptionPayload) =>
    request<MenuItemOption>(`/menu/items/${itemId}/options`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateOption: (id: string, payload: UpdateOptionPayload) =>
    request<MenuItemOption>(`/menu/options/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteOption: (id: string) =>
    request<{ id: string }>(`/menu/options/${id}`, { method: 'DELETE' }),

  // ---- Estoque ----
  listStock: () => request<StockItem[]>('/stock'),
  createStock: (payload: {
    name: string;
    unit?: StockUnit;
    qty?: number;
    alertQty?: number;
  }) =>
    request<StockItem>('/stock', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateStock: (id: string, payload: UpdateStockPayload) =>
    request<StockItem>(`/stock/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteStock: (id: string) =>
    request<{ id: string }>(`/stock/${id}`, { method: 'DELETE' }),
  moveStock: (id: string, direction: 'up' | 'down') =>
    request<{ moved: boolean }>(`/stock/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
  stockMovements: (id: string) =>
    request<StockMovementRow[]>(`/stock/${id}/movements`),
  // Produção manual (bacalhau): baixa a matéria-prima do insumo (kg) e
  // credita as porções preparadas. fromQty = kg usados, toQty = porções feitas.
  produceStock: (payload: {
    toId: string;
    fromQty: number;
    toQty: number;
  }) =>
    request<{ produced: boolean }>('/stock/produce', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  // Vínculos prato/opção → insumo.
  createStockLink: (payload: {
    stockItemId: string;
    menuItemId?: string;
    optionId?: string;
    qty?: number;
  }) =>
    request<StockLink>('/stock/links', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateStockLink: (id: string, qty: number) =>
    request<StockLink>(`/stock/links/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ qty }),
    }),
  deleteStockLink: (id: string) =>
    request<{ id: string }>(`/stock/links/${id}`, { method: 'DELETE' }),

  createOrder: (payload: CreateOrderPayload) =>
    request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listOrders: (status?: OrderStatus) =>
    request<Order[]>(`/orders${status ? `?status=${status}` : ''}`),
  trackOrder: (protocol: number) =>
    request<TrackedOrder>(`/orders/track/${protocol}`),
  updateStatus: (id: string, status: OrderStatus) =>
    request<Order>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  reprint: (id: string) =>
    request<{ enqueued: boolean }>(`/orders/${id}/reprint`, {
      method: 'POST',
    }),
  deleteOrder: (id: string) =>
    request<{ deleted: boolean }>(`/orders/${id}`, { method: 'DELETE' }),

  // ---- Caixa / fechamento ----
  payOrder: (id: string, paymentMethod?: PaymentMethod) =>
    request<Order>(`/cash/orders/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify(paymentMethod ? { paymentMethod } : {}),
    }),
  closeCash: () =>
    request<{ closed: boolean }>('/cash/close', { method: 'POST' }),
  pendingPayments: () => request<Order[]>('/cash/pending'),
  transactions: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const q = qs.toString();
    return request<Transaction[]>(`/cash/transactions${q ? `?${q}` : ''}`);
  },
  dailySummary: (date?: string) =>
    request<DailySummary>(`/cash/summary${date ? `?date=${date}` : ''}`),

  // ---- Relatórios ----
  revenue: (from?: string, to?: string) =>
    request<RevenueReport>(`/reports/revenue${periodQuery(from, to)}`),
  byChannel: (from?: string, to?: string) =>
    request<ChannelReportItem[]>(`/reports/by-channel${periodQuery(from, to)}`),
  topItems: (from?: string, to?: string, limit?: number) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (limit) qs.set('limit', String(limit));
    const q = qs.toString();
    return request<TopItem[]>(`/reports/top-items${q ? `?${q}` : ''}`);
  },
  // Baixa o CSV autenticado e dispara o download no navegador.
  downloadTransactionsCsv: async (from?: string, to?: string) => {
    const res = await fetch(
      `${API_URL}/reports/export${periodQuery(from, to)}`,
      { headers: { ...baseHeaders, ...authHeaders() } },
    );
    if (!res.ok) throw new ApiError(res.status, `API ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacoes_${from ?? 'inicio'}_${to ?? 'fim'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

function periodQuery(from?: string, to?: string): string {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const q = qs.toString();
  return q ? `?${q}` : '';
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Termo da opção usado na cozinha/impressão: "Meia Porção" → "Individual",
 * "Porção Inteira" → "Inteira". O cardápio do cliente mantém o nome original.
 */
export function toPrintOption(name: string): string {
  return name
    .replace(/Meia Porção/gi, 'Individual')
    .replace(/Porção Inteira/gi, 'Inteira');
}

/** Rótulo do item como sai na impressão: MAIÚSCULAS + opção no termo da cozinha. */
export function printLabel(name: string, optionName?: string | null): string {
  const full = optionName ? `${name} (${toPrintOption(optionName)})` : name;
  return full.toUpperCase();
}
