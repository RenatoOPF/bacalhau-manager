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
  const categories = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.listExpenseCategories(),
  });
  const byAccount = useQuery({
    queryKey: ['expenses-by-account'],
    queryFn: () => api.expensesByAccount(),
  });

  const activeAccounts = (accounts.data ?? []).filter((a) => a.active);
  const activeCategories = (categories.data ?? []).filter((c) => c.active);

  // Formulário de nova despesa.
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
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
        categoryId: categoryId || undefined,
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
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Categoria (opcional)…</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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

      {/* Categorias (tipos de despesa) */}
      <CategoriesManager
        categories={categories.data ?? []}
        onChange={() => {
          qc.invalidateQueries({ queryKey: ['expense-categories'] });
          invalidate();
        }}
      />

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
            categories={activeCategories}
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
  categories,
  onChange,
}: {
  expense: Expense;
  accounts: PaymentAccount[];
  categories: ExpenseCategory[];
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
  const setCategory = useMutation({
    mutationFn: (id: string | null) =>
      api.updateExpense(expense.id, { categoryId: id }),
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
        <p className="text-xs text-brand-ink/50">venc. {due}</p>
      </div>
      <select
        className="input p-1 text-xs"
        title="Tipo de despesa"
        value={expense.categoryId ?? ''}
        onChange={(e) => setCategory.mutate(e.target.value || null)}
        disabled={setCategory.isPending}
      >
        <option value="">Sem categoria</option>
        {/* Mantém a categoria atual mesmo se estiver inativa. */}
        {expense.category &&
          !categories.some((c) => c.id === expense.category?.id) && (
            <option value={expense.category.id}>{expense.category.name}</option>
          )}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
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

/** Cadastro/gestão dos tipos de despesa (categorias). */
function CategoriesManager({
  categories,
  onChange,
}: {
  categories: ExpenseCategory[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const add = useMutation({
    mutationFn: () => api.createExpenseCategory(name.trim()),
    onSuccess: () => {
      setName('');
      onChange();
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, newName }: { id: string; newName: string }) =>
      api.updateExpenseCategory(id, { name: newName.trim() }),
    onSuccess: () => {
      setEditingId(null);
      onChange();
    },
  });
  const toggle = useMutation({
    mutationFn: (c: ExpenseCategory) =>
      api.updateExpenseCategory(c.id, { active: !c.active }),
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteExpenseCategory(id),
    onSuccess: onChange,
  });

  return (
    <section className="mt-6">
      <button
        className="section-title flex items-center gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▾' : '▸'} Tipos de despesa (
        {categories.filter((c) => c.active).length})
      </button>
      {open && (
        <div className="card mt-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input flex-1 p-1 text-sm"
              placeholder="Novo tipo (ex: Manutenção)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="btn-success px-2 py-1 text-xs"
              disabled={!name.trim() || add.isPending}
              onClick={() => add.mutate()}
            >
              + tipo
            </button>
          </div>
          <ul className="mt-2 divide-y divide-brand-cream-dark">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 py-1.5 text-sm"
              >
                {editingId === c.id ? (
                  <>
                    <input
                      className="input flex-1 p-1 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                    />
                    <span className="flex gap-1">
                      <button
                        className="btn-primary px-2 py-0.5 text-xs"
                        disabled={!editName.trim() || rename.isPending}
                        onClick={() =>
                          rename.mutate({ id: c.id, newName: editName })
                        }
                      >
                        Salvar
                      </button>
                      <button
                        className="btn-outline px-2 py-0.5 text-xs"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className={c.active ? '' : 'text-brand-ink/40 line-through'}
                    >
                      {c.name}
                    </span>
                    <span className="flex gap-1">
                      <button
                        className="btn-outline px-2 py-0.5 text-xs"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                      >
                        Renomear
                      </button>
                      <button
                        className="btn-outline px-2 py-0.5 text-xs"
                        onClick={() => toggle.mutate(c)}
                      >
                        {c.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        className="btn-danger px-2 py-0.5 text-xs"
                        onClick={() => {
                          if (
                            confirm(
                              `Excluir o tipo "${c.name}"? As despesas vinculadas ficam sem categoria.`,
                            )
                          )
                            remove.mutate(c.id);
                        }}
                      >
                        Excluir
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
            {categories.length === 0 && (
              <li className="py-2 text-xs text-brand-ink/40">
                Nenhum tipo cadastrado ainda.
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
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
