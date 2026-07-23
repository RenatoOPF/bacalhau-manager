'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import {
  api,
  formatBRL,
  printLabel,
  CHANNEL_LABEL,
  PAYMENT_LABEL,
  type Courier,
  type Neighborhood,
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

/** minúsculas, sem acento, espaços únicos — para casar bairro por texto. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export default function CaixaPage() {
  const qc = useQueryClient();

  const { data: orders } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.listOrders(),
  });
  const { data: couriers } = useQuery({
    queryKey: ['couriers'],
    queryFn: () => api.listCouriers(),
  });
  const { data: neighborhoods } = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.listNeighborhoods(),
  });

  // Tempo real: novos pedidos e mudanças de status recarregam a fila.
  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket'] });
    const refresh = () => qc.invalidateQueries({ queryKey: ['orders'] });
    socket.on('order:created', refresh);
    socket.on('order:status', refresh);
    return () => {
      socket.disconnect();
    };
  }, [qc]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['orders'] });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Fila de pedidos</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(orders ?? []).map((order: Order) => (
          <OrderCard
            key={order.id}
            order={order}
            couriers={couriers ?? []}
            neighborhoods={neighborhoods ?? []}
            onChange={refresh}
          />
        ))}
      </div>
    </main>
  );
}

function OrderCard({
  order,
  couriers,
  neighborhoods,
  onChange,
}: {
  order: Order;
  couriers: Courier[];
  neighborhoods: Neighborhood[];
  onChange: () => void;
}) {
  const next = NEXT_STATUS[order.status];
  const goingToDelivery = next === 'OUT_FOR_DELIVERY';

  // Sugere o bairro pelo texto do endereço do pedido.
  const suggested = order.addressNeighborhood
    ? neighborhoods.find(
        (n) => normalize(n.name) === normalize(order.addressNeighborhood ?? ''),
      )
    : undefined;

  const [picking, setPicking] = useState(false);
  const [courierId, setCourierId] = useState('');
  const [neighborhoodId, setNeighborhoodId] = useState(
    order.neighborhoodId ?? suggested?.id ?? '',
  );

  const advance = useMutation({
    mutationFn: (status: OrderStatus) => api.updateStatus(order.id, status),
    onSuccess: onChange,
  });
  const reprint = useMutation({ mutationFn: () => api.reprint(order.id) });
  const remove = useMutation({
    mutationFn: () => api.deleteOrder(order.id),
    onSuccess: onChange,
  });
  const dispatch = useMutation({
    mutationFn: async () => {
      await api.assignDelivery(order.id, {
        courierId: courierId || null,
        neighborhoodId: neighborhoodId || null,
      });
      await api.updateStatus(order.id, 'OUT_FOR_DELIVERY');
    },
    onSuccess: () => {
      setPicking(false);
      onChange();
    },
  });

  const onNext = () => {
    if (!next) return;
    if (goingToDelivery) setPicking(true);
    else advance.mutate(next);
  };

  return (
    <div className="card p-4">
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

      <p className="mt-2 text-sm font-medium">{order.customerName}</p>
      <p className="text-sm text-brand-ink/60">
        {order.addressStreet}
        {order.addressNumber ? `, ${order.addressNumber}` : ''}
        {order.addressNeighborhood ? ` — ${order.addressNeighborhood}` : ''}
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
      {order.courier && (
        <p className="text-sm text-brand-ink/60">
          Entregador: <strong>{order.courier.name}</strong>
          {order.courierFeeCents ? ` · repasse ${formatBRL(order.courierFeeCents)}` : ''}
        </p>
      )}

      {picking ? (
        <div className="mt-3 space-y-2 border-t border-brand-cream-dark pt-3">
          <select
            className="input w-full p-2 text-sm"
            value={courierId}
            onChange={(e) => setCourierId(e.target.value)}
          >
            <option value="">Escolha o entregador…</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="input w-full p-2 text-sm"
            value={neighborhoodId}
            onChange={(e) => setNeighborhoodId(e.target.value)}
          >
            <option value="">Bairro (define o repasse)…</option>
            {neighborhoods.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} — repasse {formatBRL(n.courierFeeCents)}
              </option>
            ))}
          </select>
          {couriers.length === 0 && (
            <p className="text-xs text-brand-red">
              Cadastre entregadores (funcionários com perfil Entregador).
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1 px-3 py-2 text-sm"
              disabled={!courierId || dispatch.isPending}
              onClick={() => dispatch.mutate()}
            >
              Confirmar saída
            </button>
            <button
              className="btn-outline px-3 py-2 text-sm"
              onClick={() => setPicking(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {next && (
            <button
              className="btn-primary flex-1 px-3 py-2 text-sm"
              onClick={onNext}
            >
              → {STATUS_LABEL[next]}
            </button>
          )}
          <button
            className="btn-outline px-3 py-2 text-sm"
            onClick={() => reprint.mutate()}
          >
            Reimprimir
          </button>
          <button
            className="btn-danger px-3 py-2 text-sm"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm(`Excluir o pedido #${order.dailyNumber}?`))
                remove.mutate();
            }}
          >
            Excluir
          </button>
        </div>
      )}
    </div>
  );
}
