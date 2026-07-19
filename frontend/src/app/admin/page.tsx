'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import {
  api,
  formatBRL,
  printLabel,
  CHANNEL_LABEL,
  PAYMENT_LABEL,
  type Order,
  type OrderStatus,
} from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

const STATUS_LABEL: Record<OrderStatus, string> = {
  RECEIVED: 'Recebido',
  IN_PREPARATION: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
};

// Próximo status do fluxo (avanço feito pelo caixa/gerente).
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  RECEIVED: 'IN_PREPARATION',
  IN_PREPARATION: 'READY',
  READY: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

export default function CaixaPage() {
  const qc = useQueryClient();

  const { data: orders } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.listOrders(),
  });

  // Tempo real: novos pedidos e mudanças de status recarregam a fila.
  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket'] });
    const refresh = () =>
      qc.invalidateQueries({ queryKey: ['orders'] });
    socket.on('order:created', refresh);
    socket.on('order:status', refresh);
    return () => {
      socket.disconnect();
    };
  }, [qc]);

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      api.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  const reprint = useMutation({
    mutationFn: (id: string) => api.reprint(id),
  });

  const removeOrder = useMutation({
    mutationFn: (id: string) => api.deleteOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Fila de pedidos</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(orders ?? []).map((order: Order) => {
          const next = NEXT_STATUS[order.status];
          return (
            <div
              key={order.id}
              className="card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold">
                    #{order.dailyNumber}
                  </span>
                  {order.channel !== 'OWN' && (
                    <span className="rounded bg-brand-red/10 px-2 py-0.5 text-xs font-semibold text-brand-red">
                      {CHANNEL_LABEL[order.channel]}
                    </span>
                  )}
                </span>
                <span className="rounded-full bg-brand-gold/25 px-2.5 py-1 text-xs font-semibold text-brand-ink">
                  {STATUS_LABEL[order.status]}
                </span>
              </div>

              <p className="mt-2 text-sm font-medium">
                {order.customerName}
              </p>
              <p className="text-sm text-brand-ink/60">
                {order.addressStreet}
                {order.addressNumber ? `, ${order.addressNumber}` : ''}
              </p>

              <ul className="mt-2 text-sm">
                {order.items.map((it) => (
                  <li key={it.id}>
                    {it.quantity}x {printLabel(it.nameSnapshot, it.optionNameSnapshot)}
                    {it.notes && (
                      <span className="text-brand-ink/60"> — {it.notes}</span>
                    )}
                  </li>
                ))}
              </ul>

              <p className="mt-2 text-sm font-semibold">
                {formatBRL(order.totalCents)} · {PAYMENT_LABEL[order.paymentMethod]}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {next && (
                  <button
                    className="btn-primary flex-1 px-3 py-2 text-sm"
                    onClick={() =>
                      advance.mutate({ id: order.id, status: next })
                    }
                  >
                    → {STATUS_LABEL[next]}
                  </button>
                )}
                <button
                  className="btn-outline px-3 py-2 text-sm"
                  onClick={() => reprint.mutate(order.id)}
                >
                  Reimprimir
                </button>
                <button
                  className="btn-danger px-3 py-2 text-sm"
                  disabled={removeOrder.isPending}
                  onClick={() => {
                    if (confirm(`Excluir o pedido #${order.dailyNumber}?`)) {
                      removeOrder.mutate(order.id);
                    }
                  }}
                >
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
