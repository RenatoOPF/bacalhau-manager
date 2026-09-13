'use client';

import { useEffect, useState, useCallback } from 'react';
import { CHANNEL_LABEL, type OrderChannel, type OrderStatus } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const POLL_INTERVAL = 10_000;

export interface KitchenOrder {
  id: string;
  dailyNumber: number;
  channel: OrderChannel;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  customerName: string | null;
  items: KitchenItem[];
}

export interface KitchenItem {
  id: string;
  nameSnapshot: string;
  optionNameSnapshot: string | null;
  quantity: number;
  notes: string | null;
}

const TWO_COLUMNS = [
  {
    key: 'pending',
    label: 'Em Andamento',
    statuses: ['IN_PREPARATION', 'RECEIVED'] as const,
    headerBg: 'bg-amber-500',
    cardBorderReceived: 'border-amber-400',
    cardBorderPrep: 'border-blue-500',
  },
  {
    key: 'ready',
    label: 'Pronto ✓',
    statuses: ['READY'] as const,
    headerBg: 'bg-green-600',
    cardBorderReceived: 'border-green-500',
    cardBorderPrep: 'border-green-500',
  },
] as const;

const STATUS_CARD_BORDER: Record<string, string> = {
  RECEIVED: 'border-amber-400',
  IN_PREPARATION: 'border-blue-500',
  READY: 'border-green-500',
};

const STATUS_BADGE_STYLE: Record<string, string> = {
  RECEIVED: 'bg-amber-100 text-amber-700',
  IN_PREPARATION: 'bg-blue-100 text-blue-700',
};

const SIZE_KEYWORDS = [
  'meia', 'inteira', 'porcao', 'porcão', 'porção', 'individual', 'unico', 'único',
];

function parseNotes(notes: string | null) {
  if (!notes)
    return {
      sizeTag: null,
      complements: [] as { qty: number; name: string }[],
      obs: [] as string[],
    };

  const sizeTag: string[] = [];
  const complements: { qty: number; name: string }[] = [];
  const obs: string[] = [];

  for (const seg of notes.split(' | ')) {
    const s = seg.trim();
    if (!s) continue;
    if (/^obs:/i.test(s)) {
      obs.push(s.replace(/^obs:\s*/i, ''));
      continue;
    }
    const m = s.match(/^(\d+)\s+(.+)$/);
    if (m) {
      const name = m[2].trim();
      const lc = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
      if (SIZE_KEYWORDS.some((kw) => lc.includes(kw))) {
        sizeTag.push(name.toUpperCase());
      } else {
        complements.push({ qty: Number(m[1]), name });
      }
    }
  }

  return { sizeTag: sizeTag[0] ?? null, complements, obs };
}


export function CozinhaClient({
  initialOrders,
}: {
  initialOrders: KitchenOrder[];
}) {
  const [orders, setOrders] = useState<KitchenOrder[]>(initialOrders);
  const [, setTick] = useState(0);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/orders/kitchen`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      if (res.ok) setOrders(await res.json());
    } catch {
      // silencia falha de rede
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const pollInterval = setInterval(fetchOrders, POLL_INTERVAL);
    const tickInterval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
    };
  }, [fetchOrders]);

  const grouped: Record<string, KitchenOrder[]> = {
    RECEIVED: [],
    IN_PREPARATION: [],
    READY: [],
  };
  for (const o of orders) {
    grouped[o.status]?.push(o);
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-900 px-3 py-3">
      <header className="mb-3 flex items-center gap-3">
        <img src="/logo.jpeg" alt="Logo" className="h-9 w-9 rounded-full" />
        <h1 className="font-display text-xl font-extrabold text-brand-gold">
          Cozinha
        </h1>
        <span className="ml-auto text-sm text-white/40">
          {orders.length === 0
            ? 'Nenhum pedido ativo'
            : `${orders.length} pedido${orders.length !== 1 ? 's' : ''} ativo${orders.length !== 1 ? 's' : ''}`}
        </span>
      </header>

      {orders.length === 0 ? (
        <p className="mt-20 text-center text-lg text-white/30">
          Nenhum pedido em andamento.
        </p>
      ) : (
        <div className="grid flex-1 grid-cols-3 gap-3">
          {TWO_COLUMNS.map((col) => {
            const colOrders = col.statuses.flatMap((s) => grouped[s]);
            return (
              <div key={col.key} className={`flex flex-col gap-2 ${col.key === 'pending' ? 'col-span-2' : 'col-span-1'}`}>
                {/* Column header */}
                <div className={`${col.headerBg} flex items-center justify-between rounded-lg px-4 py-2.5`}>
                  <span className="text-lg font-extrabold uppercase tracking-wide text-white">
                    {col.label}
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-sm font-bold text-white">
                    {colOrders.length}
                  </span>
                </div>

                {/* Cards */}
                {colOrders.length === 0 ? (
                  <p className="mt-4 text-center text-sm text-white/20">—</p>
                ) : col.key === 'pending' ? (
                  <div className="grid grid-cols-2 gap-2">
                    {colOrders.map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </div>
                ) : (
                  colOrders.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: KitchenOrder }) {
  const mins = Math.floor(
    (Date.now() - new Date(order.createdAt).getTime()) / 60_000,
  );
  const elapsedLabel = mins < 1 ? 'agora' : `${mins} min`;
  const timeUrgent = order.status !== 'READY' && mins >= 60;

  return (
    <div
      className={`rounded-xl border-l-[6px] bg-white p-3 shadow ${STATUS_CARD_BORDER[order.status]}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-3xl font-extrabold text-brand-ink">
            #{order.dailyNumber}
          </span>
          {order.channel !== 'OWN' && (
            <span className="rounded bg-brand-red/15 px-2 py-0.5 text-xs font-bold text-brand-red">
              {CHANNEL_LABEL[order.channel]}
            </span>
          )}
          {STATUS_BADGE_STYLE[order.status] && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_STYLE[order.status]}`}>
              {order.status === 'RECEIVED' ? 'Recebido' : 'Em preparo'}
            </span>
          )}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            timeUrgent
              ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {elapsedLabel}
        </span>
      </div>

      {order.customerName && (
        <p className="mt-0.5 text-sm font-semibold text-brand-ink/60">
          {order.customerName}
        </p>
      )}

      {order.notes && (
        <p className="mt-1 rounded bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800">
          {order.notes}
        </p>
      )}

      <ul className="mt-2 space-y-2 border-t border-gray-100 pt-2">
        {order.items.map((item) => {
          const { sizeTag, complements, obs } = parseNotes(item.notes);
          return (
            <li key={item.id}>
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-display text-base font-extrabold text-brand-ink">
                  {item.quantity}x {item.nameSnapshot.toUpperCase()}
                </span>
                {item.optionNameSnapshot && (
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-bold text-gray-700">
                    {item.optionNameSnapshot.toUpperCase()}
                  </span>
                )}
                {sizeTag && !item.optionNameSnapshot && (
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-bold text-amber-800">
                    {sizeTag}
                  </span>
                )}
              </div>
              {complements.length > 0 && (
                <ul className="mt-0.5 space-y-0.5 pl-2">
                  {complements.map((c, i) => (
                    <li key={i} className="text-xs text-brand-ink/70">
                      +{c.qty} {c.name}
                    </li>
                  ))}
                </ul>
              )}
              {obs.map((o, i) => (
                <p
                  key={i}
                  className="mt-0.5 pl-2 text-xs italic text-red-600"
                >
                  ⚠ {o}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
