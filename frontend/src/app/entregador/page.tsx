'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatBRL, type CourierOrder, type OrderChannel, CHANNEL_LABEL } from '@/lib/api';
import { isoToday, isoDaysAgo } from '@/lib/date';
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

function isoWeekStart(): string {
  return isoDaysAgo(6);
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

function LocalizadorBadge({ channel, externalId }: { channel: OrderChannel; externalId: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(externalId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-lg bg-brand-cream px-3 py-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-ink/40">
          Localizador {CHANNEL_LABEL[channel]}
        </p>
        <p className="text-lg font-bold tracking-widest text-brand-ink">
          {externalId}
        </p>
      </div>
      <button
        onClick={copy}
        className="flex items-center gap-1.5 rounded-lg border border-brand-ink/20 bg-white px-3 py-1.5 text-xs font-medium text-brand-ink transition-colors active:bg-brand-cream"
      >
        {copied ? (
          <>
            <svg className="h-3.5 w-3.5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-600">Copiado</span>
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            Copiar
          </>
        )}
      </button>
    </div>
  );
}

function OrderCard({ order }: { order: CourierOrder }) {
  const [showItems, setShowItems] = useState(false);
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
        <LocalizadorBadge channel={order.channel} externalId={order.externalId!} />
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

      {/* Itens do pedido (expandível) */}
      {order.items.length > 0 && (
        <div className="border-t">
          <button
            onClick={() => setShowItems((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-brand-ink/60 hover:text-brand-ink"
          >
            <span>{order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</span>
            <svg
              className={`h-4 w-4 transition-transform ${showItems ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showItems && (
            <ul className="border-t bg-brand-cream/30 px-4 py-2 text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-2 py-1">
                  <span className="font-semibold text-brand-ink">{item.quantity}×</span>
                  <span className="text-brand-ink">
                    {item.nameSnapshot}
                    {item.optionNameSnapshot && <span className="text-brand-ink/50"> · {item.optionNameSnapshot}</span>}
                    {item.notes && <span className="block text-xs italic text-brand-ink/40">{item.notes}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
