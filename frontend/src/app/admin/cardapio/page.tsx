'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  toPrintOption,
  type MenuCategory,
  type MenuItem,
  type MenuItemOption,
  type StockLink,
} from '@/lib/api';

/** "0,5" no lugar de "0.5". */
function fmtQty(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function parseQty(value: string): number | null {
  const n = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Vínculos de estoque de um prato ou opção. Um prato pode consumir vários
 * insumos (ex.: Moqueca de Polvo com Camarão), cada um com a quantidade
 * descontada por venda (em itens com opções de tamanho, vale para a Porção
 * Inteira — a Meia desconta metade). A lista de insumos vem do cache do
 * react-query (uma busca só para a página toda).
 */
function StockLinksEditor({
  links,
  menuItemId,
  optionId,
  defaultQty,
  onChange,
}: {
  links: StockLink[];
  menuItemId?: string;
  optionId?: string;
  defaultQty?: number;
  onChange: () => void;
}) {
  const { data: stock } = useQuery({
    queryKey: ['stock'],
    queryFn: api.listStock,
  });
  const [adding, setAdding] = useState(false);
  const [stockItemId, setStockItemId] = useState('');
  const [qty, setQty] = useState(fmtQty(defaultQty ?? 1));

  const add = useMutation({
    mutationFn: () => {
      const q = parseQty(qty);
      if (!stockItemId || q === null) throw new Error('Insumo e qtd válida.');
      return api.createStockLink({
        stockItemId,
        ...(menuItemId ? { menuItemId } : { optionId }),
        qty: q,
      });
    },
    onSuccess: () => {
      setAdding(false);
      setStockItemId('');
      onChange();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteStockLink(id),
    onSuccess: onChange,
  });
  const updateQty = useMutation({
    mutationFn: ({ id, q }: { id: string; q: number }) =>
      api.updateStockLink(id, q),
    onSuccess: onChange,
  });

  const nameOf = (id: string) =>
    (stock ?? []).find((s) => s.id === id)?.name ?? '?';

  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      {links.map((l) => (
        <span
          key={l.id}
          className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-blue-800"
        >
          <button
            title="Clique para alterar a quantidade descontada por venda"
            onClick={() => {
              const input = prompt(
                `Consumo de "${nameOf(l.stockItemId)}" por venda:`,
                fmtQty(l.qtyMilli / 1000),
              );
              if (input === null) return;
              const q = parseQty(input);
              if (q !== null) updateQty.mutate({ id: l.id, q });
            }}
          >
            {nameOf(l.stockItemId)} ×{fmtQty(l.qtyMilli / 1000)}
          </button>
          <button
            className="text-blue-400 hover:text-red-600"
            title="Remover vínculo"
            disabled={remove.isPending}
            onClick={() => remove.mutate(l.id)}
          >
            ✕
          </button>
        </span>
      ))}
      {adding ? (
        <>
          <select
            className="rounded border p-0.5"
            value={stockItemId}
            onChange={(e) => setStockItemId(e.target.value)}
          >
            <option value="">insumo...</option>
            {(stock ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.unit})
              </option>
            ))}
          </select>
          <input
            className="w-12 rounded border p-0.5"
            title="Quantidade descontada por venda"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <button
            className="rounded bg-green-600 px-1.5 py-0.5 text-white disabled:opacity-50"
            disabled={add.isPending}
            onClick={() => add.mutate()}
          >
            ok
          </button>
          <button
            className="rounded border px-1.5 py-0.5"
            onClick={() => setAdding(false)}
          >
            ✕
          </button>
        </>
      ) : (
        <button
          className="rounded border border-dashed px-1.5 py-0.5 text-gray-400 hover:text-gray-700"
          title="Vincular insumo de estoque"
          onClick={() => setAdding(true)}
        >
          + estoque
        </button>
      )}
    </span>
  );
}

/** Converte texto em reais ("89,90" ou "89.90") para centavos. */
function reaisToCents(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function GestaoCardapioPage() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['menu-admin'] });

  const { data: menu, isLoading } = useQuery({
    queryKey: ['menu-admin'],
    queryFn: api.getFullMenu,
  });

  const [newCategory, setNewCategory] = useState('');
  // Categorias colapsadas (só o cabeçalho) — facilita ver todas e reordenar.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addCategory = useMutation({
    mutationFn: (name: string) => api.createCategory(name),
    onSuccess: () => {
      setNewCategory('');
      invalidate();
    },
  });

  const categories = menu ?? [];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Gestão do cardápio</h1>

      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded border p-2"
          placeholder="Nova categoria (ex: Sobremesas)"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={!newCategory.trim() || addCategory.isPending}
          onClick={() => addCategory.mutate(newCategory.trim())}
        >
          Criar categoria
        </button>
      </div>

      {categories.length > 0 && (
        <div className="mt-4 flex gap-2 text-sm">
          <button
            className="rounded border px-3 py-1"
            onClick={() => setCollapsed(new Set(categories.map((c) => c.id)))}
          >
            Minimizar todas
          </button>
          <button
            className="rounded border px-3 py-1"
            onClick={() => setCollapsed(new Set())}
          >
            Expandir todas
          </button>
        </div>
      )}

      {isLoading && <p className="mt-6">Carregando...</p>}

      <div className="mt-6 space-y-6">
        {categories.map((category, i, arr) => (
          <CategoryBlock
            key={category.id}
            category={category}
            onChange={invalidate}
            isFirst={i === 0}
            isLast={i === arr.length - 1}
            collapsed={collapsed.has(category.id)}
            onToggleCollapse={() => toggleCollapse(category.id)}
          />
        ))}
      </div>
    </main>
  );
}

function CategoryBlock({
  category,
  onChange,
  isFirst,
  isLast,
  collapsed,
  onToggleCollapse,
}: {
  category: MenuCategory;
  onChange: () => void;
  isFirst: boolean;
  isLast: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [catName, setCatName] = useState(category.name);

  const addItem = useMutation({
    mutationFn: () => {
      const priceCents = reaisToCents(price);
      if (!name.trim() || priceCents === null) {
        throw new Error('Informe nome e preço válidos.');
      }
      return api.createItem({
        categoryId: category.id,
        name: name.trim(),
        description: description.trim() || undefined,
        priceCents,
      });
    },
    onSuccess: () => {
      setName('');
      setDescription('');
      setPrice('');
      setError(null);
      onChange();
    },
    onError: (e: Error) => setError(e.message),
  });

  const removeCategory = useMutation({
    mutationFn: () => api.deleteCategory(category.id),
    onSuccess: onChange,
    onError: (e: Error) => setError(e.message),
  });

  const move = useMutation({
    mutationFn: (direction: 'up' | 'down') =>
      api.moveCategory(category.id, direction),
    onSuccess: onChange,
    onError: (e: Error) => setError(e.message),
  });

  const rename = useMutation({
    mutationFn: () => api.updateCategory(category.id, { name: catName.trim() }),
    onSuccess: () => {
      setEditingName(false);
      onChange();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <button
            className="text-gray-500"
            title={collapsed ? 'Expandir' : 'Minimizar'}
            onClick={onToggleCollapse}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          {editingName ? (
            <>
              <input
                className="flex-1 rounded border p-1"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                autoFocus
              />
              <button
                className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                disabled={!catName.trim() || rename.isPending}
                onClick={() => rename.mutate()}
              >
                Salvar
              </button>
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => {
                  setCatName(category.name);
                  setEditingName(false);
                }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <h2
                className="cursor-pointer text-lg font-semibold"
                onClick={onToggleCollapse}
              >
                {category.name}
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({category.items.length})
                </span>
              </h2>
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setEditingName(true)}
              >
                Renomear
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded border px-2 py-1 text-xs disabled:opacity-30"
            title="Mover para cima"
            disabled={isFirst || move.isPending}
            onClick={() => move.mutate('up')}
          >
            ↑
          </button>
          <button
            className="rounded border px-2 py-1 text-xs disabled:opacity-30"
            title="Mover para baixo"
            disabled={isLast || move.isPending}
            onClick={() => move.mutate('down')}
          >
            ↓
          </button>
          <button
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50"
            disabled={removeCategory.isPending}
            onClick={() => {
              if (confirm(`Excluir a categoria "${category.name}"?`)) {
                removeCategory.mutate();
              }
            }}
          >
            Excluir
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <ul className="mt-2 divide-y">
            {category.items.map((item, i, arr) => (
              <ItemRow
                key={item.id}
                item={item}
                onChange={onChange}
                isFirst={i === 0}
                isLast={i === arr.length - 1}
              />
            ))}
            {category.items.length === 0 && (
              <li className="py-2 text-sm text-gray-400">Sem itens ainda.</li>
            )}
          </ul>

          <div className="mt-3 grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className="rounded border p-2"
              placeholder="Nome do item"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="rounded border p-2"
              placeholder="Descrição (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="w-24 rounded border p-2"
                placeholder="R$"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <button
                className="rounded bg-green-600 px-3 py-2 text-white disabled:opacity-50"
                disabled={addItem.isPending}
                onClick={() => addItem.mutate()}
              >
                Adicionar
              </button>
            </div>
          </div>
        </>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function ItemRow({
  item,
  onChange,
  isFirst,
  isLast,
}: {
  item: MenuItem;
  onChange: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState((item.priceCents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (payload: Parameters<typeof api.updateItem>[1]) =>
      api.updateItem(item.id, payload),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      onChange();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteItem(item.id),
    onSuccess: onChange,
    onError: (e: Error) => setError(e.message),
  });

  const move = useMutation({
    mutationFn: (direction: 'up' | 'down') => api.moveItem(item.id, direction),
    onSuccess: onChange,
    onError: (e: Error) => setError(e.message),
  });

  const save = () => {
    const priceCents = reaisToCents(price);
    if (!name.trim() || priceCents === null) {
      setError('Nome e preço válidos são obrigatórios.');
      return;
    }
    update.mutate({ name: name.trim(), priceCents });
  };

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2">
        <input
          className="flex-1 rounded border p-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-24 rounded border p-1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          onClick={save}
        >
          Salvar
        </button>
        <button
          className="rounded border px-3 py-1 text-sm"
          onClick={() => setEditing(false)}
        >
          Cancelar
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </li>
    );
  }

  const hasOptions = (item.options ?? []).length > 0;

  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <button
            className="text-xs leading-none text-gray-500 disabled:opacity-20"
            title="Mover para cima"
            disabled={isFirst || move.isPending}
            onClick={() => move.mutate('up')}
          >
            ▲
          </button>
          <button
            className="text-xs leading-none text-gray-500 disabled:opacity-20"
            title="Mover para baixo"
            disabled={isLast || move.isPending}
            onClick={() => move.mutate('down')}
          >
            ▼
          </button>
        </div>
        <div className="flex-1">
          <p className={item.available ? 'font-medium' : 'font-medium text-gray-400 line-through'}>
            {item.name.toUpperCase()}
          </p>
          {item.description && (
            <p className="text-sm text-gray-500">{item.description}</p>
          )}
        </div>
        <span className="text-sm">
          {hasOptions ? (
            <span className="text-gray-400">preço nas opções</span>
          ) : (
            formatBRL(item.priceCents)
          )}
        </span>
        <StockLinksEditor
          links={item.stockLinks ?? []}
          menuItemId={item.id}
          onChange={onChange}
        />
        <button
          className="rounded border px-2 py-1 text-xs"
          onClick={() => setEditing(true)}
        >
          Editar
        </button>
        <button
          className={`rounded px-2 py-1 text-xs text-white ${item.available ? 'bg-gray-500' : 'bg-green-600'}`}
          disabled={update.isPending}
          onClick={() => update.mutate({ available: !item.available })}
        >
          {item.available ? 'Desativar' : 'Ativar'}
        </button>
        <button
          className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          disabled={remove.isPending}
          onClick={() => {
            if (confirm(`Excluir o item "${item.name}"?`)) remove.mutate();
          }}
        >
          Excluir
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <OptionsManager item={item} onChange={onChange} />
    </li>
  );
}

/** Lista e edição das opções (variações) de um item. */
function OptionsManager({
  item,
  onChange,
}: {
  item: MenuItem;
  onChange: () => void;
}) {
  const options = item.options ?? [];
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => {
      const priceCents = reaisToCents(price);
      if (!name.trim() || priceCents === null) {
        throw new Error('Informe nome e preço da opção.');
      }
      return api.createOption(item.id, { name: name.trim(), priceCents });
    },
    onSuccess: () => {
      setName('');
      setPrice('');
      setError(null);
      onChange();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="ml-3 mt-2 border-l-2 pl-3">
      {options.length > 0 && (
        <ul className="space-y-1">
          {options.map((opt) => (
            <OptionRow key={opt.id} option={opt} onChange={onChange} />
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          className="flex-1 rounded border p-1 text-sm"
          placeholder="Nova opção (ex: Inteira)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-20 rounded border p-1 text-sm"
          placeholder="R$"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button
          className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          + opção
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function OptionRow({
  option,
  onChange,
}: {
  option: MenuItemOption;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(option.name);
  const [price, setPrice] = useState((option.priceCents / 100).toFixed(2));

  const update = useMutation({
    mutationFn: (payload: Parameters<typeof api.updateOption>[1]) =>
      api.updateOption(option.id, payload),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteOption(option.id),
    onSuccess: onChange,
  });

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 text-sm">
        <input
          className="flex-1 rounded border p-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-20 rounded border p-1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
          onClick={() => {
            const priceCents = reaisToCents(price);
            if (name.trim() && priceCents !== null) {
              update.mutate({ name: name.trim(), priceCents });
            }
          }}
        >
          Salvar
        </button>
        <button
          className="rounded border px-2 py-1 text-xs"
          onClick={() => setEditing(false)}
        >
          Cancelar
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={
          option.available ? 'flex-1' : 'flex-1 text-gray-400 line-through'
        }
      >
        {toPrintOption(option.name).toUpperCase()}
      </span>
      <span>{formatBRL(option.priceCents)}</span>
      <StockLinksEditor
        links={option.stockLinks ?? []}
        optionId={option.id}
        defaultQty={/meia|individual/i.test(option.name) ? 0.5 : 1}
        onChange={onChange}
      />
      <button
        className="rounded border px-2 py-0.5 text-xs"
        onClick={() => setEditing(true)}
      >
        Editar
      </button>
      <button
        className={`rounded px-2 py-0.5 text-xs text-white ${option.available ? 'bg-gray-500' : 'bg-green-600'}`}
        disabled={update.isPending}
        onClick={() => update.mutate({ available: !option.available })}
      >
        {option.available ? 'Desativar' : 'Ativar'}
      </button>
      <button
        className="rounded bg-red-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
      >
        Excluir
      </button>
    </li>
  );
}
