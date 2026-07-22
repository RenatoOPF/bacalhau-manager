'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatBRL, type Expense, type ExpenseCategory } from '@/lib/api';

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  RENT: 'Aluguel',
  PAYROLL: 'Funcionários',
  PACKAGING: 'Embalagem',
  DELIVERY: 'Entrega/Motoboy',
  SUPPLIES: 'Fornecedores',
  TAXES: 'Impostos',
  OTHER: 'Outros',
};

const CATEGORIES = Object.keys(CATEGORY_LABEL) as ExpenseCategory[];

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "89,90" ou "89.90" → centavos. */
function reaisToCents(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function DespesasPage() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['expenses'] });

  const [statusFilter, setStatusFilter] = useState<'' | 'paid' | 'unpaid'>('');

  const expenses = useQuery({
    queryKey: ['expenses', statusFilter],
    queryFn: () =>
      api.listExpenses(statusFilter ? { status: statusFilter } : undefined),
  });

  // Formulário de nova despesa.
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('OTHER');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(isoToday());
  const [paid, setPaid] = useState(true);
  const [recurring, setRecurring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => {
      const amountCents = reaisToCents(amount);
      if (!description.trim() || amountCents === null) {
        throw new Error('Informe descrição e valor válidos.');
      }
      return api.createExpense({
        description: description.trim(),
        category,
        amountCents,
        dueDate: new Date(`${dueDate}T12:00:00`).toISOString(),
        paidAt: paid ? new Date().toISOString() : undefined,
        recurring,
      });
    },
    onSuccess: () => {
      setDescription('');
      setAmount('');
      setError(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows = expenses.data ?? [];
  const totalCents = rows.reduce((s, e) => s + e.amountCents, 0);
  const unpaidCents = rows
    .filter((e) => !e.paidAt)
    .reduce((s, e) => s + e.amountCents, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Despesas</h1>

      {/* Nova despesa */}
      <section className="card mt-4 p-4">
        <h2 className="section-title">Nova despesa</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            className="input p-2 sm:col-span-2"
            placeholder="Descrição (ex: Aluguel de julho)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <select
            className="input p-2"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <input
            className="input p-2"
            placeholder="Valor (R$)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            Vencimento
            <input
              type="date"
              className="input flex-1 p-2"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
              />
              Já paga
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
              />
              Fixa/recorrente
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            className="btn-success px-4 py-2"
            disabled={add.isPending}
            onClick={() => add.mutate()}
          >
            Adicionar
          </button>
          {error && <span className="text-sm text-brand-red">{error}</span>}
        </div>
      </section>

      {/* Resumo + filtro */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-sm">
          <span>
            Total:{' '}
            <strong className="text-brand-ink">{formatBRL(totalCents)}</strong>
          </span>
          <span>
            A pagar:{' '}
            <strong className="text-brand-red">{formatBRL(unpaidCents)}</strong>
          </span>
        </div>
        <div className="flex gap-1 text-sm">
          {(
            [
              ['', 'Todas'],
              ['unpaid', 'A pagar'],
              ['paid', 'Pagas'],
            ] as ['' | 'paid' | 'unpaid', string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={
                statusFilter === key
                  ? 'rounded bg-brand-gold px-2.5 py-1 font-bold text-brand-ink'
                  : 'rounded px-2.5 py-1 text-brand-ink/60 hover:bg-brand-cream-dark'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <ul className="mt-3 divide-y divide-brand-cream-dark">
        {rows.map((e) => (
          <ExpenseRow key={e.id} expense={e} onChange={invalidate} />
        ))}
        {rows.length === 0 && (
          <li className="py-4 text-sm text-brand-ink/40">
            Nenhuma despesa {statusFilter === 'unpaid' ? 'a pagar' : ''}.
          </li>
        )}
      </ul>
    </main>
  );
}

function ExpenseRow({
  expense,
  onChange,
}: {
  expense: Expense;
  onChange: () => void;
}) {
  const pay = useMutation({
    mutationFn: () => api.payExpense(expense.id),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteExpense(expense.id),
    onSuccess: onChange,
  });

  const due = expense.dueDate.slice(0, 10);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="min-w-40 flex-1">
        <p className="font-semibold">
          {expense.description}
          {expense.recurring && (
            <span className="ml-1 text-xs text-brand-ink/40">(fixa)</span>
          )}
        </p>
        <p className="text-xs text-brand-ink/50">
          {CATEGORY_LABEL[expense.category]} · venc. {due}
        </p>
      </div>
      <span className="font-semibold text-brand-red">
        {formatBRL(expense.amountCents)}
      </span>
      {expense.paidAt ? (
        <span className="rounded bg-brand-green/15 px-2 py-0.5 text-xs font-medium text-brand-green">
          Paga
        </span>
      ) : (
        <button
          className="btn-success px-2 py-0.5 text-xs"
          disabled={pay.isPending}
          onClick={() => pay.mutate()}
        >
          Marcar paga
        </button>
      )}
      <button
        className="btn-danger px-2 py-0.5 text-xs"
        disabled={remove.isPending}
        onClick={() => {
          if (confirm(`Excluir "${expense.description}"?`)) remove.mutate();
        }}
      >
        Excluir
      </button>
    </li>
  );
}
