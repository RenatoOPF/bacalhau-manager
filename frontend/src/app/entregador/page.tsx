'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type CourierOrder } from '@/lib/api';
import { formatBRL } from '@/lib/api';

type DeliveryStatus = 'OUT_FOR_DELIVERY' | 'DELIVERED';

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

function buildAddress(order: CourierOrder): string {
  const parts = [
    order.addressStreet + (order.addressNumber ? ', ' + order.addressNumber : ''),
    order.addressComplement,
    order.addressNeighborhood ?? order.neighborhood?.name,
  ].filter(Boolean);
  return parts.join(' — ');
}

function OrderCard({ order }: { order: CourierOrder }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (status: DeliveryStatus) =>
      api.updateCourierStatus(order.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courier-orders'] }),
  });

  const nextStatus: DeliveryStatus | null =
    order.status === 'READY' || order.status === 'IN_PREPARATION' || order.status === 'RECEIVED'
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

  const isDelivered = order.status === 'DELIVERED';

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm ${isDelivered ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <p className="text-xs text-brand-ink/50">Pedido #{order.dailyNumber}</p>
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
          <p className="mt-1 text-brand-ink/60">
            Ref: {order.addressReference}
          </p>
        )}
        {order.notes && (
          <p className="mt-1 italic text-brand-ink/60">Obs: {order.notes}</p>
        )}
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <span className="text-sm">
          Repasse:{' '}
          <strong className="text-brand-ink">
            {formatBRL(order.courierFeeCents)}
          </strong>
        </span>
        {nextStatus && nextLabel && (
          <button
            onClick={() => update.mutate(nextStatus)}
            disabled={update.isPending}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 ${
              nextStatus === 'DELIVERED' ? 'bg-green-600 hover:bg-green-700' : 'bg-brand-red hover:bg-brand-red/90'
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
  const [showDone, setShowDone] = useState(false);
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['courier-orders'],
    queryFn: () => api.getCourierOrders(),
    refetchInterval: 30_000,
  });

  const active = orders.filter((o) => !DONE.has(o.status));
  const done = orders.filter((o) => o.status === 'DELIVERED');
  const totalRepasse = done.reduce((s, o) => s + o.courierFeeCents, 0);

  if (isLoading) {
    return (
      <main className="p-6 text-center text-brand-ink/40">
        Carregando pedidos...
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      {active.length === 0 && (
        <p className="mt-6 text-center text-sm text-brand-ink/50">
          Nenhum pedido ativo no momento.
        </p>
      )}

      <div className="space-y-4">
        {active.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>

      {done.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowDone((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm font-medium text-brand-ink shadow-sm"
          >
            <span>
              Entregues hoje ({done.length}) — total{' '}
              <strong>{formatBRL(totalRepasse)}</strong>
            </span>
            <span className="text-brand-ink/40">{showDone ? '▲' : '▼'}</span>
          </button>

          {showDone && (
            <div className="mt-3 space-y-3">
              {done.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
