'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import {
  api,
  formatBRL,
  printLabel,
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
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold">Fila de pedidos</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(orders ?? []).map((order: Order) => {
          const next = NEXT_STATUS[order.status];
          return (
            <div
              key={order.id}
              className="rounded-lg border bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold">
                  #{order.protocol}
                </span>
                <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                  {STATUS_LABEL[order.status]}
                </span>
              </div>

              <p className="mt-2 text-sm font-medium">
                {order.customerName}
              </p>
              <p className="text-sm text-gray-500">
                {order.addressStreet}
                {order.addressNumber ? `, ${order.addressNumber}` : ''}
              </p>

              <ul className="mt-2 text-sm">
                {order.items.map((it) => (
                  <li key={it.id}>
                    {it.quantity}x {printLabel(it.nameSnapshot, it.optionNameSnapshot)}
                    {it.notes && (
                      <span className="text-gray-500"> — {it.notes}</span>
                    )}
                  </li>
                ))}
              </ul>

              <p className="mt-2 text-sm font-semibold">
                {formatBRL(order.totalCents)} ·{' '}
                {order.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro'}
              </p>

              <div className="mt-3 flex gap-2">
                {next && (
                  <button
                    className="flex-1 rounded bg-blue-600 px-3 py-2 text-sm text-white"
                    onClick={() =>
                      advance.mutate({ id: order.id, status: next })
                    }
                  >
                    → {STATUS_LABEL[next]}
                  </button>
                )}
                <button
                  className="rounded border px-3 py-2 text-sm"
                  onClick={() => reprint.mutate(order.id)}
                >
                  Reimprimir
                </button>
                <button
                  className="rounded border border-red-300 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
                  disabled={removeOrder.isPending}
                  onClick={() => {
                    if (confirm(`Excluir o pedido #${order.protocol}?`)) {
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
