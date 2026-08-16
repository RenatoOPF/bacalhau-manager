'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatBRL, type CourierOrder } from '@/lib/api';

type DeliveryStatus = 'OUT_FOR_DELIVERY' | 'DELIVERED';
type Period = 'today' | 'week' | 'custom';

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Recebido',
  IN_PREPARATION: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
};

const STATUS_COLOR: Record<string, string> = {
  RECEIVED: 'bg-gray-200 text-gray-700',
  IN_PREPARATION: 'bg-yellow-100 text-yellow-800',
  READY: 'bg-brand-gold/30 text-brand-ink',
  OUT_FOR_DELIVERY: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-green-100 text-green-800',
};

const DONE = new Set(['DELIVERED', 'CANCELED']);

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

function buildAddress(order: CourierOrder): string {
  return [
    order.addressStreet + (order.addressNumber ? ', ' + order.addressNumber : ''),
    order.addressComplement,
    order.addressNeighborhood ?? order.neighborhood?.name,
  ]
    .filter(Boolean)
    .join(' — ');
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function OrderCard({ order }: { order: CourierOrder }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (status: DeliveryStatus) =>
      api.updateCourierStatus(order.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courier-orders'] }),
  });

  const nextStatus: DeliveryStatus | null =
    order.status === 'READY' ||
    order.status === 'IN_PREPARATION' ||
    order.status === 'RECEIVED'
      ? 'OUT_FOR_DELIVERY'
      : order.status === 'OUT_FOR_DELIVERY'
        ? 'DELIVERED'
        : null;

  const nextLabel =
    nextStatus === 'OUT_FOR_DELIVERY'
      ? 'Saiu para entrega'
      : nextStatus === 'DELIVERED'
        ? 'Marcar entregue'
        : null;

  return (
    <div className={`rounded-xl border bg-white shadow-sm ${order.status === 'DELIVERED' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <p className="text-xs text-brand-ink/50">
            #{order.dailyNumber} · {formatTime(order.createdAt)}
          </p>
          <p className="mt-0.5 font-bold text-brand-ink">{order.customerName}</p>
          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone}`}
              className="text-sm text-brand-red underline-offset-2 hover:underline"
            >
              {order.customerPhone}
            </a>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      <div className="border-t px-4 py-3 text-sm text-brand-ink/80">
        <p>{buildAddress(order)}</p>
        {order.addressReference && (
          <p className="mt-1 text-brand-ink/60">Ref: {order.addressReference}</p>
        )}
        {order.notes && (
          <p className="mt-1 italic text-brand-ink/60">Obs: {order.notes}</p>
        )}
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <span className="text-sm">
          Repasse:{' '}
          <strong className="text-brand-ink">{formatBRL(order.courierFeeCents)}</strong>
        </span>
        {nextStatus && nextLabel && (
          <button
            onClick={() => update.mutate(nextStatus)}
            disabled={update.isPending}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 ${
              nextStatus === 'DELIVERED'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-brand-red hover:bg-brand-red/90'
            }`}
          >
            {update.isPending ? '...' : nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CourierPage() {
  const today = isoToday();

  // Pedidos ativos: sempre hoje.
  const { data: todayOrders = [], isLoading: loadingActive } = useQuery({
    queryKey: ['courier-orders', 'today'],
    queryFn: () => api.getCourierOrders(today, today),
    refetchInterval: 30_000,
  });

  // Período para histórico de entregues.
  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const { from, to } = (() => {
    if (period === 'week') return { from: isoWeekStart(), to: today };
    if (period === 'custom') return { from: customFrom, to: customTo };
    return { from: today, to: today };
  })();

  const samePeriodAsToday = period === 'today';

  // Quando o período for "hoje", reutiliza a query dos ativos para evitar requisição dupla.
  const { data: periodOrders = [], isLoading: loadingPeriod } = useQuery({
    queryKey: ['courier-orders', from, to],
    queryFn: () => api.getCourierOrders(from, to),
    enabled: !samePeriodAsToday,
  });

  const allForPeriod = samePeriodAsToday ? todayOrders : periodOrders;

  const active = todayOrders.filter((o) => !DONE.has(o.status));
  const done = allForPeriod.filter((o) => o.status === 'DELIVERED');
  const totalRepasse = done.reduce((s, o) => s + o.courierFeeCents, 0);

  const [showDone, setShowDone] = useState(false);

  if (loadingActive) {
    return (
      <main className="p-6 text-center text-brand-ink/40">
        Carregando pedidos...
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      {/* Pedidos ativos */}
      {active.length === 0 ? (
        <p className="text-center text-sm text-brand-ink/50">
          Nenhum pedido ativo no momento.
        </p>
      ) : (
        <div className="space-y-4">
          {active.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}

      {/* Histórico de entregues */}
      <div className="mt-8">
        {/* Cabeçalho com toggle */}
        <button
          onClick={() => setShowDone((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm font-medium text-brand-ink shadow-sm"
        >
          <span>
            Entregues
            {done.length > 0 && (
              <>
                {' '}({done.length}) —{' '}
                <strong>{formatBRL(totalRepasse)}</strong>
              </>
            )}
          </span>
          <span className="text-brand-ink/40">{showDone ? '▲' : '▼'}</span>
        </button>

        {showDone && (
          <div className="mt-3">
            {/* Seletor de período */}
            <div className="mb-3 flex flex-wrap gap-2">
              {(['today', 'week', 'custom'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    period === p
                      ? 'bg-brand-red text-white'
                      : 'bg-white border text-brand-ink hover:bg-brand-cream'
                  }`}
                >
                  {p === 'today' ? 'Hoje' : p === 'week' ? 'Últimos 7 dias' : 'Personalizado'}
                </button>
              ))}
            </div>

            {period === 'custom' && (
              <div className="mb-3 flex flex-wrap gap-3 text-sm">
                <label>
                  De
                  <input
                    type="date"
                    className="ml-2 rounded border border-brand-cream-dark p-1"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </label>
                <label>
                  Até
                  <input
                    type="date"
                    className="ml-2 rounded border border-brand-cream-dark p-1"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </label>
              </div>
            )}

            {loadingPeriod && (
              <p className="py-4 text-center text-sm text-brand-ink/40">
                Carregando...
              </p>
            )}

            {!loadingPeriod && done.length === 0 && (
              <p className="py-4 text-center text-sm text-brand-ink/40">
                Nenhuma entrega finalizada no período.
              </p>
            )}

            <div className="space-y-3">
              {done.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
