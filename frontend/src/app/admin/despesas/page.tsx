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

function monthRange(offset: number): { from: string; to: string } {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + offset;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  };
}

function monthLabel(offset: number): string {
  const d = new Date();
  const month = d.getMonth() + offset;
  return new Date(d.getFullYear(), month, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
}

function reaisToCents(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

type PeriodPreset = 'all' | 'this_month' | 'last_month' | 'custom';

export default function DespesasPage() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['expenses-by-account'] });
  };

  // Filtros
  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const [customFrom, setCustomFrom] = useState(monthRange(0).from);
  const [customTo, setCustomTo] = useState(isoToday());
  const [statusFilter, setStatusFilter] = useState<'' | 'paid' | 'unpaid'>('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const { from, to } = (() => {
    if (preset === 'this_month') return monthRange(0);
    if (preset === 'last_month') return monthRange(-1);
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return { from: undefined, to: undefined };
  })();

  const expenses = useQuery({
    queryKey: ['expenses', from, to, statusFilter, categoryFilter],
    queryFn: () =>
      api.listExpenses({
        from,
        to,
        status: statusFilter || undefined,
        categoryId: categoryFilter || undefined,
      }),
  });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.listAccounts() });
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => api.listExpenseCategories() });
  const byAccount = useQuery({
    queryKey: ['expenses-by-account', from, to],
    queryFn: () => api.expensesByAccount(from, to),
  });

  const activeAccounts = (accounts.data ?? []).filter((a) => a.active);
  const activeCategories = (categories.data ?? []).filter((c) => c.active);

  // Formulário de nova despesa
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
  const paidCents = rows.filter((e) => e.paidAt).reduce((s, e) => s + e.amountCents, 0);
  const unpaidCents = totalCents - paidCents;

  const PRESETS: [PeriodPreset, string][] = [
    ['all', 'Todas'],
    ['this_month', monthLabel(0)],
    ['last_month', monthLabel(-1)],
    ['custom', 'Período'],
  ];

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
          <select className="input p-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Categoria (opcional)…</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
          >
            <option value="">Conta (opcional)…</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-4 text-sm sm:col-span-2">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              Já paga
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              Fixa/recorrente
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-success px-4 py-2" disabled={add.isPending} onClick={() => add.mutate()}>
            Adicionar
          </button>
          {error && <span className="text-sm text-brand-red">{error}</span>}
        </div>
      </section>

      <CategoriesManager
        categories={categories.data ?? []}
        onChange={() => { qc.invalidateQueries({ queryKey: ['expense-categories'] }); invalidate(); }}
      />

      <AccountsManager
        accounts={accounts.data ?? []}
        onChange={() => { qc.invalidateQueries({ queryKey: ['accounts'] }); invalidate(); }}
      />

      {/* Total por conta */}
      {(byAccount.data ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="section-title">Total por conta {from ? `· ${from.slice(0, 7)}` : ''}</h2>
          <div className="card mt-2 divide-y divide-brand-cream-dark p-3">
            {(byAccount.data ?? []).map((a) => (
              <div key={a.accountId ?? 'none'} className="flex items-center justify-between py-1.5 text-sm">
                <span>{a.accountName}</span>
                <span className="flex gap-3">
                  <span className="text-brand-red">pago {formatBRL(a.paidCents)}</span>
                  {a.totalCents > a.paidCents && (
                    <span className="text-brand-ink/50">a pagar {formatBRL(a.totalCents - a.paidCents)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filtros */}
      <div className="mt-6 space-y-3">
        {/* Período */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={
                preset === key
                  ? 'rounded-full bg-brand-red px-3 py-1 text-sm font-bold text-white'
                  : 'rounded-full border border-brand-ink/20 px-3 py-1 text-sm text-brand-ink/60 hover:border-brand-red/40'
              }
            >
              {label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              De
              <input type="date" className="input p-1" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="flex items-center gap-1.5">
              Até
              <input type="date" className="input p-1" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}

        {/* Categoria + status */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="input p-1.5 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
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
                    ? 'rounded bg-brand-gold px-2.5 py-1 text-sm font-bold text-brand-ink'
                    : 'rounded px-2.5 py-1 text-sm text-brand-ink/60 hover:bg-brand-cream-dark'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span>Total: <strong>{formatBRL(totalCents)}</strong></span>
        <span className="text-brand-green">Pago: <strong>{formatBRL(paidCents)}</strong></span>
        <span className="text-brand-red">A pagar: <strong>{formatBRL(unpaidCents)}</strong></span>
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
        {rows.length === 0 && !expenses.isLoading && (
          <li className="py-4 text-sm text-brand-ink/40">
            Nenhuma despesa encontrada.
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
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState(expense.description);
  const [editAmount, setEditAmount] = useState(centsToReais(expense.amountCents));
  const [editDue, setEditDue] = useState(expense.dueDate.slice(0, 10));

  const pay = useMutation({ mutationFn: () => api.payExpense(expense.id), onSuccess: onChange });
  const remove = useMutation({ mutationFn: () => api.deleteExpense(expense.id), onSuccess: onChange });
  const save = useMutation({
    mutationFn: () => {
      const amountCents = reaisToCents(editAmount);
      if (!editDesc.trim() || amountCents === null) throw new Error('Dados inválidos');
      return api.updateExpense(expense.id, {
        description: editDesc.trim(),
        amountCents,
        dueDate: new Date(`${editDue}T12:00:00`).toISOString(),
      });
    },
    onSuccess: () => { setEditing(false); onChange(); },
  });
  const setAccount = useMutation({
    mutationFn: (id: string | null) => api.updateExpense(expense.id, { accountId: id }),
    onSuccess: onChange,
  });
  const setCategory = useMutation({
    mutationFn: (id: string | null) => api.updateExpense(expense.id, { categoryId: id }),
    onSuccess: onChange,
  });

  if (editing) {
    return (
      <li className="space-y-2 py-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_120px_140px]">
          <input
            className="input p-2 text-sm"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="Descrição"
            autoFocus
          />
          <input
            className="input p-2 text-sm"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            placeholder="Valor (R$)"
          />
          <input
            type="date"
            className="input p-2 text-sm"
            value={editDue}
            onChange={(e) => setEditDue(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            className="btn-outline px-3 py-1.5 text-xs"
            onClick={() => {
              setEditing(false);
              setEditDesc(expense.description);
              setEditAmount(centsToReais(expense.amountCents));
              setEditDue(expense.dueDate.slice(0, 10));
            }}
          >
            Cancelar
          </button>
          {save.isError && <span className="text-xs text-brand-red">Dados inválidos</span>}
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="min-w-40 flex-1">
        <p className="font-semibold">
          {expense.description}
          {expense.recurring && <span className="ml-1 text-xs text-brand-ink/40">(fixa)</span>}
        </p>
        <p className="text-xs text-brand-ink/50">venc. {expense.dueDate.slice(0, 10)}</p>
      </div>
      <select
        className="input p-1 text-xs"
        title="Tipo de despesa"
        value={expense.categoryId ?? ''}
        onChange={(e) => setCategory.mutate(e.target.value || null)}
        disabled={setCategory.isPending}
      >
        <option value="">Sem categoria</option>
        {expense.category && !categories.some((c) => c.id === expense.category?.id) && (
          <option value={expense.category.id}>{expense.category.name}</option>
        )}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        className="input p-1 text-xs"
        title="Conta"
        value={expense.accountId ?? ''}
        onChange={(e) => setAccount.mutate(e.target.value || null)}
        disabled={setAccount.isPending}
      >
        <option value="">Sem conta</option>
        {expense.account && !accounts.some((a) => a.id === expense.account?.id) && (
          <option value={expense.account.id}>{expense.account.name}</option>
        )}
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <span className="font-semibold text-brand-red">{formatBRL(expense.amountCents)}</span>
      {expense.paidAt ? (
        <span className="rounded bg-brand-green/15 px-2 py-0.5 text-xs font-medium text-brand-green">Paga</span>
      ) : (
        <button className="btn-success px-2 py-0.5 text-xs" disabled={pay.isPending} onClick={() => pay.mutate()}>
          Marcar paga
        </button>
      )}
      <button
        className="btn-outline px-2 py-0.5 text-xs"
        onClick={() => setEditing(true)}
      >
        Editar
      </button>
      <button
        className="btn-danger px-2 py-0.5 text-xs"
        disabled={remove.isPending}
        onClick={() => { if (confirm(`Excluir "${expense.description}"?`)) remove.mutate(); }}
      >
        Excluir
      </button>
    </li>
  );
}

function CategoriesManager({ categories, onChange }: { categories: ExpenseCategory[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const add = useMutation({ mutationFn: () => api.createExpenseCategory(name.trim()), onSuccess: () => { setName(''); onChange(); } });
  const rename = useMutation({
    mutationFn: ({ id, newName }: { id: string; newName: string }) => api.updateExpenseCategory(id, { name: newName.trim() }),
    onSuccess: () => { setEditingId(null); onChange(); },
  });
  const toggle = useMutation({
    mutationFn: (c: ExpenseCategory) => api.updateExpenseCategory(c.id, { active: !c.active }),
    onSuccess: onChange,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteExpenseCategory(id), onSuccess: onChange });

  return (
    <section className="mt-6">
      <button className="section-title flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} Tipos de despesa ({categories.filter((c) => c.active).length})
      </button>
      {open && (
        <div className="card mt-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input flex-1 p-1 text-sm" placeholder="Novo tipo…" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-success px-2 py-1 text-xs" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
              + tipo
            </button>
          </div>
          <ul className="mt-2 divide-y divide-brand-cream-dark">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                {editingId === c.id ? (
                  <>
                    <input className="input flex-1 p-1 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                    <span className="flex gap-1">
                      <button className="btn-primary px-2 py-0.5 text-xs" disabled={!editName.trim() || rename.isPending} onClick={() => rename.mutate({ id: c.id, newName: editName })}>Salvar</button>
                      <button className="btn-outline px-2 py-0.5 text-xs" onClick={() => setEditingId(null)}>Cancelar</button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className={c.active ? '' : 'text-brand-ink/40 line-through'}>{c.name}</span>
                    <span className="flex gap-1">
                      <button className="btn-outline px-2 py-0.5 text-xs" onClick={() => { setEditingId(c.id); setEditName(c.name); }}>Renomear</button>
                      <button className="btn-outline px-2 py-0.5 text-xs" onClick={() => toggle.mutate(c)}>{c.active ? 'Desativar' : 'Ativar'}</button>
                      <button className="btn-danger px-2 py-0.5 text-xs" onClick={() => { if (confirm(`Excluir "${c.name}"?`)) remove.mutate(c.id); }}>Excluir</button>
                    </span>
                  </>
                )}
              </li>
            ))}
            {categories.length === 0 && <li className="py-2 text-xs text-brand-ink/40">Nenhum tipo cadastrado.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

function AccountsManager({ accounts, onChange }: { accounts: PaymentAccount[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('BANK');

  const add = useMutation({ mutationFn: () => api.createAccount({ name: name.trim(), type }), onSuccess: () => { setName(''); onChange(); } });
  const toggle = useMutation({ mutationFn: (a: PaymentAccount) => api.updateAccount(a.id, { active: !a.active }), onSuccess: onChange });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteAccount(id), onSuccess: onChange });

  return (
    <section className="mt-6">
      <button className="section-title flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} Contas ({accounts.filter((a) => a.active).length})
      </button>
      {open && (
        <div className="card mt-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input flex-1 p-1 text-sm" placeholder="Nova conta…" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="input p-1 text-sm" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              <option value="BANK">Banco/Conta</option>
              <option value="CASH">Dinheiro</option>
            </select>
            <button className="btn-success px-2 py-1 text-xs" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
              + conta
            </button>
          </div>
          <ul className="mt-2 divide-y divide-brand-cream-dark">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className={a.active ? '' : 'text-brand-ink/40 line-through'}>
                  {a.name}
                  <span className="ml-1 text-xs text-brand-ink/40">{ACCOUNT_TYPE_LABEL[a.type]}</span>
                </span>
                <span className="flex gap-1">
                  <button className="btn-outline px-2 py-0.5 text-xs" onClick={() => toggle.mutate(a)}>{a.active ? 'Desativar' : 'Ativar'}</button>
                  <button className="btn-danger px-2 py-0.5 text-xs" onClick={() => { if (confirm(`Excluir "${a.name}"?`)) remove.mutate(a.id); }}>Excluir</button>
                </span>
              </li>
            ))}
            {accounts.length === 0 && <li className="py-2 text-xs text-brand-ink/40">Nenhuma conta cadastrada.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
