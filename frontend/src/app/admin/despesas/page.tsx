'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  type AccountType,
  type Expense,
  type ExpenseCategory,
  type PaymentAccount,
} from '@/lib/api';

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

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CASH: 'Dinheiro',
  BANK: 'Banco/Conta',
};

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
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['expenses-by-account'] });
  };

  const [statusFilter, setStatusFilter] = useState<'' | 'paid' | 'unpaid'>('');

  const expenses = useQuery({
    queryKey: ['expenses', statusFilter],
    queryFn: () =>
      api.listExpenses(statusFilter ? { status: statusFilter } : undefined),
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.listAccounts(),
  });
  const byAccount = useQuery({
    queryKey: ['expenses-by-account'],
    queryFn: () => api.expensesByAccount(),
  });

  const activeAccounts = (accounts.data ?? []).filter((a) => a.active);

  // Formulário de nova despesa.
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('OTHER');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(isoToday());
  const [accountId, setAccountId] = useState('');
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
        accountId: accountId || undefined,
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
          <select
            className="input p-2"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            title="Conta/carteira de onde saiu o pagamento"
          >
            <option value="">Conta (opcional)…</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-4 text-sm sm:col-span-2">
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

      {/* Contas de pagamento */}
      <AccountsManager
        accounts={accounts.data ?? []}
        onChange={() => {
          qc.invalidateQueries({ queryKey: ['accounts'] });
          invalidate();
        }}
      />

      {/* Total por conta */}
      {(byAccount.data ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="section-title">Total por conta</h2>
          <div className="card mt-2 divide-y divide-brand-cream-dark p-3">
            {(byAccount.data ?? []).map((a) => (
              <div
                key={a.accountId ?? 'none'}
                className="flex items-center justify-between py-1.5 text-sm"
              >
                <span>{a.accountName}</span>
                <span className="flex gap-3">
                  <span className="text-brand-red">
                    pago {formatBRL(a.paidCents)}
                  </span>
                  {a.totalCents > a.paidCents && (
                    <span className="text-brand-ink/50">
                      a pagar {formatBRL(a.totalCents - a.paidCents)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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
          <ExpenseRow
            key={e.id}
            expense={e}
            accounts={activeAccounts}
            onChange={invalidate}
          />
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
  accounts,
  onChange,
}: {
  expense: Expense;
  accounts: PaymentAccount[];
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
  const setAccount = useMutation({
    mutationFn: (id: string | null) =>
      api.updateExpense(expense.id, { accountId: id }),
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
      <select
        className="input p-1 text-xs"
        title="Conta de onde saiu o pagamento"
        value={expense.accountId ?? ''}
        onChange={(e) => setAccount.mutate(e.target.value || null)}
        disabled={setAccount.isPending}
      >
        <option value="">Sem conta</option>
        {/* Mantém a conta atual na lista mesmo se estiver inativa. */}
        {expense.account &&
          !accounts.some((a) => a.id === expense.account?.id) && (
            <option value={expense.account.id}>{expense.account.name}</option>
          )}
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
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

/** Cadastro/gestão das contas de pagamento (Dinheiro, bancos, carteiras). */
function AccountsManager({
  accounts,
  onChange,
}: {
  accounts: PaymentAccount[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('BANK');

  const add = useMutation({
    mutationFn: () => api.createAccount({ name: name.trim(), type }),
    onSuccess: () => {
      setName('');
      onChange();
    },
  });
  const toggle = useMutation({
    mutationFn: (a: PaymentAccount) =>
      api.updateAccount(a.id, { active: !a.active }),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: onChange,
  });

  return (
    <section className="mt-6">
      <button
        className="section-title flex items-center gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▾' : '▸'} Contas ({accounts.filter((a) => a.active).length})
      </button>
      {open && (
        <div className="card mt-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input flex-1 p-1 text-sm"
              placeholder="Nova conta (ex: Nubank PJ)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="input p-1 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              <option value="BANK">Banco/Conta</option>
              <option value="CASH">Dinheiro</option>
            </select>
            <button
              className="btn-success px-2 py-1 text-xs"
              disabled={!name.trim() || add.isPending}
              onClick={() => add.mutate()}
            >
              + conta
            </button>
          </div>
          <ul className="mt-2 divide-y divide-brand-cream-dark">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between py-1.5 text-sm"
              >
                <span className={a.active ? '' : 'text-brand-ink/40 line-through'}>
                  {a.name}
                  <span className="ml-1 text-xs text-brand-ink/40">
                    {ACCOUNT_TYPE_LABEL[a.type]}
                  </span>
                </span>
                <span className="flex gap-1">
                  <button
                    className="btn-outline px-2 py-0.5 text-xs"
                    onClick={() => toggle.mutate(a)}
                  >
                    {a.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    className="btn-danger px-2 py-0.5 text-xs"
                    onClick={() => {
                      if (
                        confirm(
                          `Excluir a conta "${a.name}"? As despesas vinculadas ficam sem conta.`,
                        )
                      )
                        remove.mutate(a.id);
                    }}
                  >
                    Excluir
                  </button>
                </span>
              </li>
            ))}
            {accounts.length === 0 && (
              <li className="py-2 text-xs text-brand-ink/40">
                Nenhuma conta cadastrada ainda.
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
