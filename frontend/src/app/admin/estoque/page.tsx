'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type StockItem, type StockUnit } from '@/lib/api';

/** "12,5" no lugar de "12.5" (sem casa decimal quando inteiro). */
function fmtQty(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/** Converte texto ("12,5" ou "12.5") em quantidade. */
function parseQty(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "porção" vira "porções" acima de 1 (kg e un não flexionam). */
function unitLabel(unit: StockUnit, qty: number): string {
  if (unit !== 'porção') return unit;
  const abs = Math.abs(qty);
  return abs > 0 && abs <= 1 ? 'porção' : 'porções';
}

const UNITS: StockUnit[] = ['porção', 'kg', 'un'];

// Botões rápidos de ajuste por unidade (kg repõe em incrementos maiores).
const QUICK: Record<StockUnit, number[]> = {
  porção: [-1, -0.5, 0.5, 1, 5],
  kg: [-1, -0.5, 0.5, 1, 5],
  un: [-6, -1, 1, 6, 12],
};

export default function EstoquePage() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['stock'] });

  const { data: stock, isLoading } = useQuery({
    queryKey: ['stock'],
    queryFn: api.listStock,
  });

  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState<StockUnit>('porção');
  const [newQty, setNewQty] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.createStock({
        name: newName.trim(),
        unit: newUnit,
        qty: parseQty(newQty) ?? 0,
      }),
    onSuccess: () => {
      setNewName('');
      setNewQty('');
      invalidate();
    },
  });

  const items = stock ?? [];
  const low = items.filter((s) => s.active && s.qty <= s.alertQty);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Estoque</h1>
      <p className="mt-1 text-sm text-brand-ink/60">
        Porções preparadas, matéria-prima (kg) e unidades. A venda desconta
        sozinha (Meia = 0,5 porção); zerado não bloqueia — só alerta aqui. Use
        “Produção” para converter kg em porções. Vínculos: aba Cardápio.
      </p>

      {low.length > 0 && (
        <div className="mt-4 rounded-lg border border-brand-gold bg-brand-gold/15 p-3 text-sm text-brand-ink">
          <strong>Estoque baixo:</strong>{' '}
          {low
            .map((s) => `${s.name} (${fmtQty(s.qty)} ${unitLabel(s.unit, s.qty)})`)
            .join(' · ')}
        </div>
      )}

      <ProduceWidget stock={items} onDone={invalidate} />

      <div className="mt-6 flex flex-wrap gap-2">
        <input
          className="input flex-1 p-2"
          placeholder="Novo insumo (ex: Bacalhau (kg))"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <select
          className="input p-2"
          value={newUnit}
          onChange={(e) => setNewUnit(e.target.value as StockUnit)}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input
          className="input w-24 p-2"
          placeholder="Qtd"
          value={newQty}
          onChange={(e) => setNewQty(e.target.value)}
        />
        <button
          className="btn-primary px-4 py-2"
          disabled={!newName.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          Criar
        </button>
      </div>

      {isLoading && <p className="mt-6">Carregando...</p>}

      <div className="mt-6 space-y-2">
        {items.map((s, i, arr) => (
          <StockRow
            key={s.id}
            item={s}
            allItems={items}
            onChange={invalidate}
            isFirst={i === 0}
            isLast={i === arr.length - 1}
          />
        ))}
        {!isLoading && items.length === 0 && (
          <p className="text-sm text-brand-ink/40">
            Nenhum insumo cadastrado ainda.
          </p>
        )}
      </div>
    </main>
  );
}

/**
 * Produção de bacalhau: "usei X kg para fazer Y porções de <destino>".
 * Só aparecem os insumos com matéria-prima definida (Desfiado, Lascas,
 * Casquinha → Bacalhau (kg)); a origem é deduzida do destino escolhido.
 */
function ProduceWidget({
  stock,
  onDone,
}: {
  stock: StockItem[];
  onDone: () => void;
}) {
  const producible = stock.filter((s) => s.source);
  const [toId, setToId] = useState('');
  const [fromQty, setFromQty] = useState('');
  const [toQty, setToQty] = useState('');
  const [error, setError] = useState<string | null>(null);

  const produce = useMutation({
    mutationFn: () => {
      const f = parseQty(fromQty);
      const t = parseQty(toQty);
      if (!toId || !f || !t) {
        throw new Error('Preencha o destino e as quantidades.');
      }
      return api.produceStock({ toId, fromQty: f, toQty: t });
    },
    onSuccess: () => {
      setFromQty('');
      setToQty('');
      setError(null);
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (producible.length === 0) return null;
  const to = producible.find((s) => s.id === toId);
  const source = to?.source ?? producible[0].source!;

  return (
    <div className="card mt-4 border-l-4 border-l-brand-gold p-3">
      <p className="section-title text-sm">Produção de bacalhau</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span>Usei</span>
        <input
          className="input w-20 p-1"
          placeholder="1"
          value={fromQty}
          onChange={(e) => setFromQty(e.target.value)}
        />
        <span>
          {source.unit} de {source.name} para fazer
        </span>
        <input
          className="input w-20 p-1"
          placeholder="3"
          value={toQty}
          onChange={(e) => setToQty(e.target.value)}
        />
        <select
          className="input p-1"
          value={toId}
          onChange={(e) => setToId(e.target.value)}
        >
          <option value="">porções de...</option>
          {producible.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          className="btn-success px-3 py-1"
          disabled={produce.isPending || !toId}
          onClick={() => produce.mutate()}
        >
          Registrar
        </button>
      </div>
      {to && fromQty && toQty && (
        <p className="mt-1 text-xs text-brand-ink/60">
          Baixa {fromQty} {source.unit} de {source.name} e credita {toQty}{' '}
          {unitLabel(to.unit, parseQty(toQty) ?? 0)} de {to.name}.
        </p>
      )}
      {error && <p className="mt-1 text-sm text-brand-red">{error}</p>}
    </div>
  );
}

function StockRow({
  item,
  allItems,
  onChange,
  isFirst,
  isLast,
}: {
  item: StockItem;
  allItems: StockItem[];
  onChange: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [setValue, setSetValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [subId, setSubId] = useState<string>(item.substituteId ?? '');
  const [subFactor, setSubFactor] = useState<string>(
    String(item.substituteFactor ?? 1),
  );
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

  const move = useMutation({
    mutationFn: (direction: 'up' | 'down') => api.moveStock(item.id, direction),
    onSuccess: onChange,
    onError: (e: Error) => setError(e.message),
  });

  const { data: movements } = useQuery({
    queryKey: ['stock-movements', item.id],
    queryFn: () => api.stockMovements(item.id),
    enabled: showHistory,
  });

  const zero = item.qty <= 0;
  const lowStock = !zero && item.qty <= item.alertQty;

  return (
    <div
      className={`card p-3 ${
        zero
          ? 'border-brand-red/40 bg-red-50'
          : lowStock
            ? 'border-brand-gold bg-brand-gold/10'
            : ''
      } ${item.active ? '' : 'opacity-50'}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <button
            className="text-xs leading-none text-brand-ink/50 disabled:opacity-20"
            title="Mover para cima"
            disabled={isFirst || move.isPending}
            onClick={() => move.mutate('up')}
          >
            ▲
          </button>
          <button
            className="text-xs leading-none text-brand-ink/50 disabled:opacity-20"
            title="Mover para baixo"
            disabled={isLast || move.isPending}
            onClick={() => move.mutate('down')}
          >
            ▼
          </button>
        </div>
        <div className="min-w-32 flex-1">
          <p className="font-semibold">{item.name}</p>
          <p className="text-xs text-brand-ink/60">
            {item.linkedCount} vínculo(s) · alerta em {fmtQty(item.alertQty)}{' '}
            {unitLabel(item.unit, item.alertQty)}
          </p>
        </div>
        <span
          className={`font-display text-xl font-bold ${
            zero ? 'text-brand-red' : lowStock ? 'text-brand-gold-dark' : ''
          }`}
        >
          {fmtQty(item.qty)}
          <span className="ml-1 font-sans text-xs font-normal text-brand-ink/60">
            {unitLabel(item.unit, item.qty)}
          </span>
        </span>
        <div className="flex items-center gap-1">
          {(QUICK[item.unit] ?? QUICK['porção']).map((d) => (
            <button
              key={d}
              className="btn-outline px-2 py-1 text-xs"
              disabled={update.isPending}
              onClick={() => update.mutate({ deltaQty: d })}
            >
              {d > 0 ? `+${fmtQty(d)}` : fmtQty(d)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <input
            className="input w-20 p-1 text-sm"
            placeholder="Contagem"
            value={setValue}
            onChange={(e) => setSetValue(e.target.value)}
          />
          <button
            className="btn-primary px-2 py-1 text-xs"
            disabled={update.isPending || parseQty(setValue) === null}
            onClick={() => {
              const qty = parseQty(setValue);
              if (qty !== null) update.mutate({ setQty: qty });
            }}
          >
            Definir
          </button>
        </div>
        <button
          className="btn-outline px-2 py-1 text-xs"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? 'Fechar' : 'Histórico'}
        </button>
        <button
          className="btn-outline px-2 py-1 text-xs"
          onClick={() => setShowConfig((v) => !v)}
        >
          {showConfig ? 'Fechar config' : 'Config'}
        </button>
        <button
          className="btn-danger px-2 py-1 text-xs"
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

      {showConfig && (
        <div className="mt-2 border-t border-brand-cream-dark pt-2">
          <p className="mb-1 text-xs font-semibold text-brand-ink/60">
            Substituto quando zerado
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              className="input flex-1 p-1 text-sm"
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {allItems
                .filter((s) => s.id !== item.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            {subId && (
              <>
                <label className="text-xs text-brand-ink/60">Fator</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.5"
                  className="input w-16 p-1 text-sm"
                  value={subFactor}
                  onChange={(e) => setSubFactor(e.target.value)}
                />
                <span className="text-xs text-brand-ink/40">
                  (ao usar este zerado, consome {subFactor}{' '}
                  {allItems.find((s) => s.id === subId)?.name ?? '—'})
                </span>
              </>
            )}
            <button
              className="btn-primary px-2 py-1 text-xs"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  substituteId: subId || null,
                  substituteFactor: subId ? (parseQty(subFactor) ?? 1) : 1,
                })
              }
            >
              Salvar
            </button>
          </div>
          {item.substituteId && (
            <p className="mt-1 text-xs text-brand-ink/50">
              Atual: ao usar <strong>{item.name}</strong> zerado → consome{' '}
              {item.substituteFactor ?? 1} de{' '}
              <strong>{item.substitute?.name ?? '—'}</strong>
            </p>
          )}
        </div>
      )}

      {showHistory && (
        <ul className="mt-2 border-t border-brand-cream-dark pt-2 text-xs text-brand-ink/70">
          {(movements ?? []).map((m) => (
            <li key={m.id} className="flex justify-between py-0.5">
              <span>
                {m.deltaQty > 0 ? '+' : ''}
                {fmtQty(m.deltaQty)} — {m.reason}
              </span>
              <span className="text-brand-ink/40">
                {new Date(m.createdAt).toLocaleString('pt-BR')}
              </span>
            </li>
          ))}
          {(movements ?? []).length === 0 && (
            <li className="py-0.5 text-brand-ink/40">Sem movimentações.</li>
          )}
        </ul>
      )}
      {error && <p className="mt-1 text-sm text-brand-red">{error}</p>}
    </div>
  );
}
