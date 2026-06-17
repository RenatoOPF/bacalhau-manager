const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---- Tipos compartilhados (espelham o backend) ----

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  available: boolean;
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
  quantity: number;
  priceCents: number;
  notes?: string | null;
}

export interface Order {
  id: string;
  protocol: number;
  status: OrderStatus;
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

export type PaymentMethod = 'CASH' | 'PIX';

export interface Transaction {
  id: string;
  protocol: number;
  customerName: string;
  paymentMethod: PaymentMethod;
  totalCents: number;
  paidAt: string;
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
  status: OrderStatus;
  createdAt: string;
  items: { nameSnapshot: string; quantity: number }[];
}

export interface CreateOrderPayload {
  customerName: string;
  customerPhone?: string;
  addressStreet: string;
  addressNumber?: string;
  paymentMethod: 'CASH' | 'PIX';
  notes?: string;
  items: { menuItemId: string; quantity: number; notes?: string }[];
}

// ---- Endpoints ----

export const api = {
  getMenu: () => request<MenuCategory[]>('/menu'),

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

  // ---- Caixa / fechamento ----
  payOrder: (id: string, paymentMethod?: PaymentMethod) =>
    request<Order>(`/cash/orders/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify(paymentMethod ? { paymentMethod } : {}),
    }),
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
};

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
