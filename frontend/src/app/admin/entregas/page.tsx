'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatBRL, type Neighborhood } from '@/lib/api';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** "8,90" | "8.90" → centavos. */
function reaisToCents(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function EntregasPage() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['neighborhoods-all'] });

  const neighborhoods = useQuery({
    queryKey: ['neighborhoods-all'],
    queryFn: () => api.listNeighborhoodsAll(),
  });

  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(0));
  const couriers = useQuery({
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Entregas</h1>

      {/* Cadastro de bairros */}
      <section className="card mt-4 p-4">
        <h2 className="section-title">Bairros e taxas</h2>
        <p className="text-sm text-brand-ink/60">
          Taxa do cliente é o que ele paga; repasse é o que você paga ao
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

      {/* Repasse por entregador */}
      <section className="mt-8">
        <h2 className="section-title">Repasse por entregador</h2>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            De
            <input
              type="date"
              className="input ml-2 p-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Até
            <input
              type="date"
              className="input ml-2 p-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b-2 border-brand-gold/60 text-left text-brand-ink/60">
                <th className="py-2">Entregador</th>
                <th className="text-right">Entregas</th>
                <th className="text-right">A pagar</th>
              </tr>
            </thead>
            <tbody>
              {(couriers.data ?? []).map((c) => (
                <tr
                  key={c.courierId}
                  className="border-b border-brand-cream-dark"
                >
                  <td className="py-2">{c.courierName}</td>
                  <td className="text-right">{c.deliveries}</td>
                  <td className="text-right font-semibold text-brand-red">
                    {formatBRL(c.totalCents)}
                  </td>
                </tr>
              ))}
              {(couriers.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-brand-ink/40">
                    Nenhuma entrega designada no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
