'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type StockItem } from '@/lib/api';

/** "12,5" no lugar de "12.5" (e sem casa decimal quando inteiro). */
function fmtPortions(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** Converte texto ("12,5" ou "12.5") em número de porções. */
function parsePortions(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function EstoquePage() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['stock'] });

  const { data: stock, isLoading } = useQuery({
    queryKey: ['stock'],
    queryFn: api.listStock,
  });

  const [newName, setNewName] = useState('');
  const [newPortions, setNewPortions] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.createStock({
        name: newName.trim(),
        portions: parsePortions(newPortions) ?? 0,
      }),
    onSuccess: () => {
      setNewName('');
      setNewPortions('');
      invalidate();
    },
  });

  const items = stock ?? [];
  const low = items.filter((s) => s.active && s.portions <= s.alertPortions);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Estoque</h1>
      <p className="mt-1 text-sm text-gray-500">
        Saldo em porções (meia porção desconta 0,5). Zerado não bloqueia a
        venda — só alerta aqui. Vincule os pratos aos insumos na aba Cardápio.
      </p>

      {low.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Estoque baixo:</strong>{' '}
          {low
            .map((s) => `${s.name} (${fmtPortions(s.portions)})`)
            .join(' · ')}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <input
          className="flex-1 rounded border p-2"
          placeholder="Novo insumo (ex: Bacalhau em Posta)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          className="w-28 rounded border p-2"
          placeholder="Porções"
          value={newPortions}
          onChange={(e) => setNewPortions(e.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={!newName.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          Criar
        </button>
      </div>

      {isLoading && <p className="mt-6">Carregando...</p>}

      <div className="mt-6 space-y-2">
        {items.map((s) => (
          <StockRow key={s.id} item={s} onChange={invalidate} />
        ))}
        {!isLoading && items.length === 0 && (
          <p className="text-sm text-gray-400">
            Nenhum insumo cadastrado ainda.
          </p>
        )}
      </div>
    </main>
  );
}

function StockRow({
  item,
  onChange,
}: {
  item: StockItem;
  onChange: () => void;
}) {
  const [setValue, setSetValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (payload: Parameters<typeof api.updateStock>[1]) =>
      api.updateStock(item.id, payload),
    onSuccess: () => {
      setSetValue('');
      setError(null);
      onChange();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteStock(item.id),
    onSuccess: onChange,
    onError: (e: Error) => setError(e.message),
  });

  const { data: movements } = useQuery({
    queryKey: ['stock-movements', item.id],
    queryFn: () => api.stockMovements(item.id),
    enabled: showHistory,
  });

  const zero = item.portions <= 0;
  const lowStock = !zero && item.portions <= item.alertPortions;

  return (
    <div
      className={`rounded-lg border bg-white p-3 ${
        zero
          ? 'border-red-300 bg-red-50'
          : lowStock
            ? 'border-amber-300 bg-amber-50'
            : ''
      } ${item.active ? '' : 'opacity-50'}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-32 flex-1">
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-gray-500">
            {item.linkedCount} prato(s) vinculado(s) · alerta em{' '}
            {fmtPortions(item.alertPortions)}
          </p>
        </div>
        <span
          className={`text-xl font-bold ${
            zero ? 'text-red-600' : lowStock ? 'text-amber-600' : ''
          }`}
        >
          {fmtPortions(item.portions)}
          <span className="ml-1 text-xs font-normal text-gray-500">porções</span>
        </span>
        <div className="flex items-center gap-1">
          {[-1, -0.5, 0.5, 1, 5].map((d) => (
            <button
              key={d}
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
              disabled={update.isPending}
              onClick={() => update.mutate({ deltaPortions: d })}
            >
              {d > 0 ? `+${fmtPortions(d)}` : fmtPortions(d)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <input
            className="w-20 rounded border p-1 text-sm"
            placeholder="Contagem"
            value={setValue}
            onChange={(e) => setSetValue(e.target.value)}
          />
          <button
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
            disabled={update.isPending || parsePortions(setValue) === null}
            onClick={() => {
              const portions = parsePortions(setValue);
              if (portions !== null) update.mutate({ setPortions: portions });
            }}
          >
            Definir
          </button>
        </div>
        <button
          className="rounded border px-2 py-1 text-xs"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? 'Fechar' : 'Histórico'}
        </button>
        <button
          className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50"
          disabled={remove.isPending}
          onClick={() => {
            if (
              confirm(
                `Excluir o insumo "${item.name}"? Os pratos vinculados deixam de descontar estoque.`,
              )
            ) {
              remove.mutate();
            }
          }}
        >
          Excluir
        </button>
      </div>

      {showHistory && (
        <ul className="mt-2 border-t pt-2 text-xs text-gray-600">
          {(movements ?? []).map((m) => (
            <li key={m.id} className="flex justify-between py-0.5">
              <span>
                {m.deltaPortions > 0 ? '+' : ''}
                {fmtPortions(m.deltaPortions)} — {m.reason}
              </span>
              <span className="text-gray-400">
                {new Date(m.createdAt).toLocaleString('pt-BR')}
              </span>
            </li>
          ))}
          {(movements ?? []).length === 0 && (
            <li className="py-0.5 text-gray-400">Sem movimentações.</li>
          )}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
