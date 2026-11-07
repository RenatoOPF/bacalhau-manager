'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatBRL, type CourierOrder, CHANNEL_LABEL } from '@/lib/api';
import { formatPhone } from '@/lib/phone';

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

const PLATFORM_CHANNELS = new Set(['IFOOD', 'NOVENTA_NOVE']);

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

  const isPlatformOrder = PLATFORM_CHANNELS.has(order.channel) && !!order.externalId;
  const showPlatformConfirm =
    isPlatformOrder && order.status === 'OUT_FOR_DELIVERY';

  return (
    <div className={`rounded-xl border bg-white shadow-sm ${order.status === 'DELIVERED' ? 'opacity-60' : ''}`}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <p className="text-xs text-brand-ink/50">
            #{order.dailyNumber} · {formatTime(order.createdAt)}
            {isPlatformOrder && (
              <span className="ml-2 font-medium text-brand-ink/70">
                {CHANNEL_LABEL[order.channel]}
              </span>
            )}
          </p>
          <p className="mt-0.5 font-bold text-brand-ink">{order.customerName}</p>
          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone}`}
              className="text-sm text-brand-red underline-offset-2 hover:underline"
            >
              {formatPhone(order.customerPhone)}
            </a>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      {/* Localizador da plataforma */}
      {isPlatformOrder && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-lg bg-brand-cream px-3 py-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-ink/40">
              Localizador {CHANNEL_LABEL[order.channel]}
            </p>
            <p className="text-lg font-bold tracking-widest text-brand-ink">
              {order.externalId}
            </p>
          </div>
        </div>
      )}

      {/* Endereço */}
      <div className="border-t px-4 py-3 text-sm text-brand-ink/80">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buildAddress(order))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 hover:text-brand-red"
        >
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <span>{buildAddress(order)}</span>
        </a>
        {order.addressReference && (
          <p className="mt-1 text-brand-ink/60">Ref: {order.addressReference}</p>
        )}
        {order.notes && (
          <p className="mt-1 italic text-brand-ink/60">Obs: {order.notes}</p>
        )}
      </div>

      {/* Confirmação de plataforma — link direto (iFood e 99Food) */}
      {showPlatformConfirm && (
        <div className="border-t bg-brand-cream/40 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-brand-ink/60">
            Confirmar entrega no {CHANNEL_LABEL[order.channel]}
          </p>
          <p className="mb-2 text-xs text-brand-ink/40">
            Use o localizador <strong className="text-brand-ink/70">{order.externalId}</strong> no site da plataforma.
          </p>
          <a
            href={
              order.channel === 'IFOOD'
                ? 'https://confirmacao-entrega-propria.ifood.com.br/'
                : 'https://food-b-h5.99app.com/pt-BR/v2/confirmation-entrega'
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white active:opacity-80"
          >
            Abrir confirmação {CHANNEL_LABEL[order.channel]}
          </a>
        </div>
      )}

      {/* Rodapé com repasse e botão de status */}
      <div className="flex items-center justify-between border-t px-4 py-3">
        <span className="text-sm">
          Repasse:{' '}
          <strong className="text-brand-ink">{formatBRL(order.courierFeeCents)}</strong>
        </span>
        {nextStatus && nextLabel && !showPlatformConfirm && (
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
