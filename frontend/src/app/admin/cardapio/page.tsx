'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  type MenuCategory,
  type MenuItem,
} from '@/lib/api';

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

  const addCategory = useMutation({
    mutationFn: (name: string) => api.createCategory(name),
    onSuccess: () => {
      setNewCategory('');
      invalidate();
    },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestão do cardápio</h1>
        <nav className="flex gap-3 text-sm text-blue-600 underline">
          <a href="/admin">Fila</a>
          <a href="/admin/caixa">Caixa</a>
        </nav>
      </div>

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

      {isLoading && <p className="mt-6">Carregando...</p>}

      <div className="mt-6 space-y-6">
        {(menu ?? []).map((category) => (
          <CategoryBlock
            key={category.id}
            category={category}
            onChange={invalidate}
          />
        ))}
      </div>
    </main>
  );
}

function CategoryBlock({
  category,
  onChange,
}: {
  category: MenuCategory;
  onChange: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-lg font-semibold">{category.name}</h2>

      <ul className="mt-2 divide-y">
        {category.items.map((item) => (
          <ItemRow key={item.id} item={item} onChange={onChange} />
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
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function ItemRow({
  item,
  onChange,
}: {
  item: MenuItem;
  onChange: () => void;
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

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="flex-1">
        <p className={item.available ? 'font-medium' : 'font-medium text-gray-400 line-through'}>
          {item.name}
        </p>
        {item.description && (
          <p className="text-sm text-gray-500">{item.description}</p>
        )}
      </div>
      <span className="text-sm">{formatBRL(item.priceCents)}</span>
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
    </li>
  );
}
