'use client';

import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { CHANNEL_LABEL, type OrderChannel, type OrderStatus } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

interface KitchenItem {
  id: string;
  nameSnapshot: string;
  optionNameSnapshot: string | null;
  quantity: number;
  notes: string | null;
}

interface KitchenOrder {
  id: string;
  dailyNumber: number;
  channel: OrderChannel;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  items: KitchenItem[];
}

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Recebido',
  IN_PREPARATION: 'Em preparo',
  READY: 'Pronto',
};

const STATUS_STYLE: Record<string, string> = {
  RECEIVED: 'border-amber-400 bg-amber-50',
  IN_PREPARATION: 'border-blue-400 bg-blue-50',
  READY: 'border-green-400 bg-green-50',
};

const STATUS_BADGE: Record<string, string> = {
  RECEIVED: 'bg-amber-100 text-amber-800',
  IN_PREPARATION: 'bg-blue-100 text-blue-800',
  READY: 'bg-green-100 text-green-800',
};

const SIZE_KEYWORDS = ['meia', 'inteira', 'porcao', 'porcão', 'porção', 'individual', 'unico', 'único'];

function parseNotes(notes: string | null) {
  if (!notes) return { sizeTag: null, complements: [] as { qty: number; name: string }[], obs: [] as string[] };

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
      const lc = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (SIZE_KEYWORDS.some((kw) => lc.includes(kw))) {
        sizeTag.push(name.toUpperCase());
      } else {
        complements.push({ qty: Number(m[1]), name });
      }
    }
  }

  return { sizeTag: sizeTag[0] ?? null, complements, obs };
}

function elapsed(createdAt: string): string {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (mins < 1) return 'agora';
  return `${mins} min`;
}

export default function CozinhaPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [, setTick] = useState(0);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/orders/kitchen`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      if (res.ok) setOrders(await res.json());
    } catch {
      // silencia falha de rede — a tela simplesmente não atualiza
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    const socket = io(WS_URL, { transports: ['websocket'] });
    socket.on('order:created', fetchOrders);
    socket.on('order:status', fetchOrders);

    // Atualiza o tempo decorrido a cada minuto
    const tickInterval = setInterval(() => setTick((t) => t + 1), 60_000);

    return () => {
      socket.disconnect();
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
    <div className="min-h-screen bg-brand-ink px-4 py-4">
      <header className="mb-4 flex items-center gap-3">
        <img src="/logo.jpeg" alt="Logo" className="h-10 w-10 rounded-full" />
        <h1 className="font-display text-2xl font-extrabold text-brand-gold">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(['RECEIVED', 'IN_PREPARATION', 'READY'] as const).flatMap((status) =>
            grouped[status].map((order) => (
              <OrderCard key={order.id} order={order} />
            )),
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: KitchenOrder }) {
  return (
    <div
      className={`rounded-xl border-l-4 p-4 shadow-sm ${STATUS_STYLE[order.status]}`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-2xl font-extrabold text-brand-ink">
            #{order.dailyNumber}
          </span>
          {order.channel !== 'OWN' && (
            <span className="rounded bg-brand-red/15 px-2 py-0.5 text-xs font-bold text-brand-red">
              {CHANNEL_LABEL[order.channel]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[order.status]}`}
          >
            {STATUS_LABEL[order.status]}
          </span>
          <span className="text-xs text-brand-ink/50">{elapsed(order.createdAt)}</span>
        </div>
      </div>

      {/* Referência iFood/99 */}
      {order.notes && (
        <p className="mt-1 text-xs font-medium text-brand-ink/50">{order.notes}</p>
      )}

      {/* Itens */}
      <ul className="mt-3 space-y-2">
        {order.items.map((item) => {
          const { sizeTag, complements, obs } = parseNotes(item.notes);
          return (
            <li key={item.id} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-display text-base font-extrabold text-brand-ink">
                  {item.quantity}x {item.nameSnapshot.toUpperCase()}
                </span>
                {item.optionNameSnapshot && (
                  <span className="rounded bg-brand-ink/10 px-1.5 py-0.5 text-xs font-bold text-brand-ink/70">
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
                <ul className="mt-1 space-y-0.5 pl-2">
                  {complements.map((c, i) => (
                    <li key={i} className="text-xs text-brand-ink/70">
                      +{c.qty} {c.name}
                    </li>
                  ))}
                </ul>
              )}
              {obs.map((o, i) => (
                <p key={i} className="mt-0.5 pl-2 text-xs italic text-brand-ink/60">
                  Obs: {o}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
