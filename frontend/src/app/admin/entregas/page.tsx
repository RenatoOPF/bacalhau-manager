'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatBRL, type Courier, type CourierOrder, type CourierReportRow, type Neighborhood } from '@/lib/api';

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type Period = 'today' | 'week' | 'custom';

/** "8,90" | "8.90" → centavos. */
function reaisToCents(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Recebido',
  IN_PREPARATION: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
};

const STATUS_COLOR: Record<string, string> = {
  RECEIVED: 'bg-gray-100 text-gray-600',
  IN_PREPARATION: 'bg-yellow-100 text-yellow-800',
  READY: 'bg-brand-gold/30 text-brand-ink',
  OUT_FOR_DELIVERY: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELED: 'bg-red-100 text-red-700',
};

function buildAddress(order: CourierOrder): string {
  const parts = [
    order.addressStreet + (order.addressNumber ? ', ' + order.addressNumber : ''),
    order.addressComplement,
    order.addressNeighborhood ?? order.neighborhood?.name,
  ].filter(Boolean);
  return parts.join(' — ');
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function CourierCard({
  courier,
  report,
  from,
  to,
}: {
  courier: Courier;
  report?: CourierReportRow;
  from: string;
  to: string;
}) {
  const [open, setOpen] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ['courier-orders-admin', courier.id, from, to],
    queryFn: () => api.courierOrdersAdmin(courier.id, from, to),
    enabled: open,
  });

  const orders = ordersQuery.data ?? [];
  const totalRepasse = orders.reduce((s, o) => s + o.courierFeeCents, 0);

  const deliveries = report?.deliveries ?? 0;
  const totalCents = report?.totalCents ?? 0;

  const initials = courier.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 p-4 text-left hover:bg-brand-cream/60 transition-colors"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-red text-sm font-bold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-brand-ink">{courier.name}</p>
          <p className="text-sm text-brand-ink/60">
            {deliveries === 0
              ? 'Nenhuma entrega no período'
              : `${deliveries} entrega${deliveries > 1 ? 's' : ''} · repasse ${formatBRL(totalCents)}`}
          </p>
        </div>
        <span className="text-brand-ink/30 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-brand-cream-dark">
          {ordersQuery.isLoading && (
            <p className="px-4 py-6 text-center text-sm text-brand-ink/40">
              Carregando...
            </p>
          )}

          {!ordersQuery.isLoading && orders.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-brand-ink/40">
              Nenhuma entrega no período selecionado.
            </p>
          )}

          {orders.length > 0 && (
            <>
              <div className="divide-y divide-brand-cream-dark">
                {orders.map((order) => (
                  <div key={order.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-brand-ink/50">
                            #{order.dailyNumber} · {formatTime(order.createdAt)}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {STATUS_LABEL[order.status] ?? order.status}
                          </span>
                        </div>
                        <p className="mt-0.5 font-medium text-brand-ink">
                          {order.customerName}
                        </p>
                        {order.customerPhone && (
                          <a
                            href={`tel:${order.customerPhone}`}
                            className="text-sm text-brand-red"
                          >
                            {order.customerPhone}
                          </a>
                        )}
                        <p className="mt-1 text-sm text-brand-ink/70">
                          {buildAddress(order)}
                        </p>
                        {order.addressReference && (
                          <p className="text-xs text-brand-ink/50">
                            Ref: {order.addressReference}
                          </p>
                        )}
                        {order.notes && (
                          <p className="mt-0.5 text-xs italic text-brand-ink/50">
                            Obs: {order.notes}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold text-brand-ink">
                        {formatBRL(order.courierFeeCents)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end border-t border-brand-cream-dark px-4 py-3">
                <span className="text-sm">
                  Total repasse:{' '}
                  <strong className="text-brand-red">
                    {formatBRL(totalRepasse)}
                  </strong>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function EntregasPage() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['neighborhoods-all'] });

  const neighborhoods = useQuery({
    queryKey: ['neighborhoods-all'],
    queryFn: () => api.listNeighborhoodsAll(),
  });

  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState(isoToday());
  const [customTo, setCustomTo] = useState(isoToday());

  const { from, to } = (() => {
    if (period === 'week') return { from: isoDaysAgo(6), to: isoToday() };
    if (period === 'custom') return { from: customFrom, to: customTo };
    return { from: isoToday(), to: isoToday() };
  })();

  const couriersQuery = useQuery({
    queryKey: ['couriers'],
    queryFn: () => api.listCouriers(),
  });
  const reportQuery = useQuery({
    queryKey: ['couriers-report', from, to],
    queryFn: () => api.couriersReport(from, to),
  });

  // Novo bairro.
  const [name, setName] = useState('');
  const [customerFee, setCustomerFee] = useState('');
  const [courierFee, setCourierFee] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error('Informe o nome do bairro.');
      return api.createNeighborhood({
        name: name.trim(),
        customerFeeCents: reaisToCents(customerFee) ?? 0,
        courierFeeCents: reaisToCents(courierFee) ?? 0,
      });
    },
    onSuccess: () => {
      setName('');
      setCustomerFee('');
      setCourierFee('');
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows = neighborhoods.data ?? [];
  const allCouriers = couriersQuery.data ?? [];
  const reportMap = new Map(
    (reportQuery.data ?? []).map((r) => [r.courierId, r]),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Entregas</h1>

      {/* Entregadores */}
      <section className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Entregadores</h2>
          <div className="flex flex-wrap gap-2">
            {(['today', 'week', 'custom'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-brand-red text-white'
                    : 'border bg-white text-brand-ink hover:bg-brand-cream'
                }`}
              >
                {p === 'today' ? 'Hoje' : p === 'week' ? 'Esta semana' : 'Personalizado'}
              </button>
            ))}
          </div>
        </div>
        {period === 'custom' && (
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <label>
              De
              <input
                type="date"
                className="input ml-2 p-1"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              Ate
              <input
                type="date"
                className="input ml-2 p-1"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        )}

        {allCouriers.length === 0 ? (
          <p className="mt-4 text-sm text-brand-ink/50">
            Nenhum entregador cadastrado. Adicione funcionarios com perfil
            Entregador.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {allCouriers.map((c) => (
              <CourierCard
                key={c.id}
                courier={c}
                report={reportMap.get(c.id)}
                from={from}
                to={to}
              />
            ))}
          </div>
        )}
      </section>

      {/* Cadastro de bairros */}
      <section className="card mt-10 p-4">
        <h2 className="section-title">Bairros e taxas</h2>
        <p className="text-sm text-brand-ink/60">
          Taxa do cliente e o que ele paga; repasse e o que voce paga ao
          entregador.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            className="input p-2"
            placeholder="Bairro (ex: Centro)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input w-28 p-2"
            placeholder="Cliente R$"
            value={customerFee}
            onChange={(e) => setCustomerFee(e.target.value)}
          />
          <input
            className="input w-28 p-2"
            placeholder="Repasse R$"
            value={courierFee}
            onChange={(e) => setCourierFee(e.target.value)}
          />
          <button
            className="btn-success px-3 py-2"
            disabled={add.isPending}
            onClick={() => add.mutate()}
          >
            Adicionar
          </button>
        </div>
        {error && <p className="mt-1 text-sm text-brand-red">{error}</p>}

        <ul className="mt-3 divide-y divide-brand-cream-dark">
          {rows.map((n) => (
            <NeighborhoodRow key={n.id} n={n} onChange={invalidate} />
          ))}
          {rows.length === 0 && (
            <li className="py-3 text-sm text-brand-ink/40">
              Nenhum bairro cadastrado ainda.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}

function NeighborhoodRow({
  n,
  onChange,
}: {
  n: Neighborhood;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(n.name);
  const [customerFee, setCustomerFee] = useState(
    (n.customerFeeCents / 100).toFixed(2),
  );
  const [courierFee, setCourierFee] = useState(
    (n.courierFeeCents / 100).toFixed(2),
  );

  const save = useMutation({
    mutationFn: () =>
      api.updateNeighborhood(n.id, {
        name: name.trim(),
        customerFeeCents: reaisToCents(customerFee) ?? 0,
        courierFeeCents: reaisToCents(courierFee) ?? 0,
      }),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
  });
  const toggle = useMutation({
    mutationFn: () => api.updateNeighborhood(n.id, { active: !n.active }),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteNeighborhood(n.id),
    onSuccess: onChange,
  });

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
        <input
          className="input flex-1 p-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input w-24 p-1"
          value={customerFee}
          onChange={(e) => setCustomerFee(e.target.value)}
          title="Taxa do cliente"
        />
        <input
          className="input w-24 p-1"
          value={courierFee}
          onChange={(e) => setCourierFee(e.target.value)}
          title="Repasse ao entregador"
        />
        <button
          className="btn-primary px-2 py-1 text-xs"
          onClick={() => save.mutate()}
        >
          Salvar
        </button>
        <button
          className="btn-outline px-2 py-1 text-xs"
          onClick={() => setEditing(false)}
        >
          Cancelar
        </button>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className={n.active ? 'flex-1' : 'flex-1 text-brand-ink/40 line-through'}>
        {n.name}
      </span>
      <span className="text-brand-ink/60">
        cliente {formatBRL(n.customerFeeCents)} · repasse{' '}
        <strong className="text-brand-red">{formatBRL(n.courierFeeCents)}</strong>
      </span>
      <button
        className="btn-outline px-2 py-0.5 text-xs"
        onClick={() => setEditing(true)}
      >
        Editar
      </button>
      <button
        className="btn-outline px-2 py-0.5 text-xs"
        onClick={() => toggle.mutate()}
      >
        {n.active ? 'Desativar' : 'Ativar'}
      </button>
      <button
        className="btn-danger px-2 py-0.5 text-xs"
        onClick={() => {
          if (confirm(`Excluir o bairro "${n.name}"?`)) remove.mutate();
        }}
      >
        Excluir
      </button>
    </li>
  );
}
