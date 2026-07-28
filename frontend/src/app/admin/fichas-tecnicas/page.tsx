'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  type MenuItem,
  type RecipeIngredient,
  type RecipeSheet,
} from '@/lib/api';

const UNITS = ['g', 'kg', 'ml', 'l', 'un', 'colher (sopa)', 'colher (chá)', 'xícara', 'porção', 'fatia', 'dente', 'folha', 'pitada', 'a gosto'];

interface IngredientRow {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  notes: string;
}

function emptyRow(): IngredientRow {
  return { id: crypto.randomUUID(), name: '', quantity: '', unit: 'g', notes: '' };
}

function fromSaved(i: RecipeIngredient): IngredientRow {
  return { id: i.id, name: i.name, quantity: String(i.quantity), unit: i.unit, notes: i.notes ?? '' };
}

export default function FichasTecnicasPage() {
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: menu } = useQuery({ queryKey: ['menu-full'], queryFn: api.getFullMenu });
  const { data: sheets } = useQuery({ queryKey: ['recipe-sheets'], queryFn: api.listRecipeSheets });

  const [search, setSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Editor state
  const [ingredients, setIngredients] = useState<IngredientRow[]>([emptyRow()]);
  const [recipeYield, setRecipeYield] = useState('1');
  const [prepTime, setPrepTime] = useState('0');
  const [method, setMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState(false);

  const selectedItem = menu?.flatMap((c) => c.items).find((i) => i.id === selectedItemId);
  const savedSheet = sheets?.find((s) => s.menuItemId === selectedItemId);
  const sheetsByItemId = new Set(sheets?.map((s) => s.menuItemId) ?? []);

  // Load sheet when item is selected
  useEffect(() => {
    if (!selectedItemId) return;
    if (savedSheet) {
      setIngredients(savedSheet.ingredients.length ? savedSheet.ingredients.map(fromSaved) : [emptyRow()]);
      setRecipeYield(String(savedSheet.yield));
      setPrepTime(String(savedSheet.prepTimeMin));
      setMethod(savedSheet.method ?? '');
      setNotes(savedSheet.notes ?? '');
    } else {
      setIngredients([emptyRow()]);
      setRecipeYield('1');
      setPrepTime('0');
      setMethod('');
      setNotes('');
    }
    setDirty(false);
  }, [selectedItemId, savedSheet?.id]);

  const save = useMutation({
    mutationFn: () =>
      api.upsertRecipeSheet(selectedItemId!, {
        yield: parseInt(recipeYield) || 1,
        prepTimeMin: parseInt(prepTime) || 0,
        method: method || undefined,
        notes: notes || undefined,
        ingredients: ingredients
          .filter((r) => r.name.trim())
          .map((r, i) => ({
            name: r.name.trim(),
            quantity: parseFloat(r.quantity) || 0,
            unit: r.unit,
            notes: r.notes || undefined,
            sortOrder: i,
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-sheets'] });
      setDirty(false);
    },
  });

  const del = useMutation({
    mutationFn: () => api.deleteRecipeSheet(selectedItemId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipe-sheets'] });
      setIngredients([emptyRow()]);
      setRecipeYield('1');
      setPrepTime('0');
      setMethod('');
      setNotes('');
      setDirty(false);
    },
  });

  function updateRow(id: string, field: keyof IngredientRow, value: string) {
    setIngredients((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty(true);
  }

  function addRow() {
    setIngredients((rows) => [...rows, emptyRow()]);
    setDirty(true);
  }

  function removeRow(id: string) {
    setIngredients((rows) => (rows.length === 1 ? [emptyRow()] : rows.filter((r) => r.id !== id)));
    setDirty(true);
  }

  function handlePrint() {
    window.print();
  }

  const categoryByItemId = Object.fromEntries(
    (menu ?? []).flatMap((cat) => cat.items.map((item) => [item.id, cat.name])),
  );

  const grouped = (menu ?? []).map((cat) => ({
    ...cat,
    items: cat.items.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase())),
  })).filter((cat) => cat.items.length > 0);

  const printItem = selectedItem;
  const printDate = new Date().toLocaleDateString('pt-BR');

  return (
    <>
      {/* Print-only layout */}
      <div className="hidden print:block">
        {printItem && (
          <div className="p-8 font-sans text-sm text-black">
            <div className="mb-6 flex items-center gap-4 border-b-2 border-black pb-4">
              <img src="/logo.jpeg" alt="Logo" className="h-16 w-16 rounded-full" />
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500">Bacalhau &amp; Cia</p>
                <h1 className="text-2xl font-bold">Ficha Técnica</h1>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs text-gray-500">{categoryByItemId[printItem.id] ?? savedSheet?.menuItem.category.name}</p>
              <h2 className="text-xl font-bold">{printItem.name}</h2>
              {printItem.options?.length ? (
                <p className="text-sm text-gray-600">
                  {printItem.options.map((o) => `${o.name}: ${formatBRL(o.priceCents)}`).join(' · ')}
                </p>
              ) : (
                <p className="text-sm text-gray-600">{formatBRL(printItem.priceCents)}</p>
              )}
            </div>

            <div className="mb-4 flex gap-8 text-sm">
              <div><span className="font-semibold">Rendimento:</span> {recipeYield} porção(ões)</div>
              {parseInt(prepTime) > 0 && (
                <div><span className="font-semibold">Tempo de preparo:</span> {prepTime} min</div>
              )}
            </div>

            <h3 className="mb-2 font-semibold uppercase tracking-wide">Ingredientes</h3>
            <table className="mb-6 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black">
                  <th className="py-1 text-left">Ingrediente</th>
                  <th className="py-1 text-right">Qtd</th>
                  <th className="py-1 text-left pl-2">Und</th>
                  <th className="py-1 text-left pl-2">Obs</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.filter((r) => r.name.trim()).map((row) => (
                  <tr key={row.id} className="border-b border-gray-200">
                    <td className="py-1">{row.name}</td>
                    <td className="py-1 text-right">{row.quantity}</td>
                    <td className="py-1 pl-2">{row.unit}</td>
                    <td className="py-1 pl-2 text-gray-500">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {method && (
              <>
                <h3 className="mb-2 font-semibold uppercase tracking-wide">Modo de Preparo</h3>
                <p className="mb-6 whitespace-pre-wrap text-sm">{method}</p>
              </>
            )}
            {notes && (
              <>
                <h3 className="mb-2 font-semibold uppercase tracking-wide">Observações</h3>
                <p className="whitespace-pre-wrap text-sm">{notes}</p>
              </>
            )}
            <p className="mt-8 text-xs text-gray-400">Impresso em {printDate}</p>
          </div>
        )}
      </div>

      {/* Screen layout */}
      <main className="print:hidden mx-auto max-w-5xl px-4 py-6">
        <h1 className="page-title mb-4">Fichas Técnicas</h1>

        <div className="flex gap-4">
          {/* Sidebar: lista de itens */}
          <aside className="w-64 shrink-0">
            <input
              className="input mb-3 w-full p-2 text-sm"
              placeholder="Buscar prato…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto rounded border border-gray-200 bg-white">
              {grouped.map((cat) => (
                <div key={cat.id}>
                  <p className="sticky top-0 bg-brand-cream px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-ink/50">
                    {cat.name}
                  </p>
                  {cat.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-brand-cream ${
                        selectedItemId === item.id ? 'bg-brand-cream font-semibold text-brand-red' : ''
                      }`}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          sheetsByItemId.has(item.id) ? 'bg-green-500' : 'bg-gray-200'
                        }`}
                      />
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              ))}
              {grouped.length === 0 && (
                <p className="p-4 text-sm text-gray-400">Nenhum item encontrado.</p>
              )}
            </div>
          </aside>

          {/* Editor */}
          <div className="min-w-0 flex-1">
            {!selectedItem ? (
              <div className="flex h-64 items-center justify-center rounded border border-dashed border-gray-300 text-gray-400">
                Selecione um prato para editar a ficha técnica
              </div>
            ) : (
              <div className="card p-5">
                {/* Header */}
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-gray-400">{categoryByItemId[selectedItem?.id ?? ''] ?? savedSheet?.menuItem.category.name ?? ''}</p>
                    <h2 className="text-lg font-bold text-brand-red">{selectedItem.name}</h2>
                    {selectedItem.options?.length ? (
                      <p className="text-sm text-gray-500">
                        {selectedItem.options.map((o) => `${o.name}: ${formatBRL(o.priceCents)}`).join(' · ')}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">{formatBRL(selectedItem.priceCents)}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {savedSheet && (
                      <button
                        onClick={() => { if (confirm('Excluir ficha técnica?')) del.mutate(); }}
                        className="px-3 py-1.5 text-sm text-red-500 hover:underline"
                      >
                        Excluir
                      </button>
                    )}
                    <button
                      onClick={handlePrint}
                      className="btn-outline px-3 py-1.5 text-sm"
                    >
                      Imprimir
                    </button>
                    <button
                      onClick={() => save.mutate()}
                      disabled={save.isPending}
                      className="btn-primary px-4 py-1.5 text-sm"
                    >
                      {save.isPending ? 'Salvando…' : dirty || !savedSheet ? 'Salvar' : 'Salvo ✓'}
                    </button>
                  </div>
                </div>

                {save.isError && (
                  <p className="mb-3 text-sm text-red-500">Erro ao salvar. Tente novamente.</p>
                )}

                {/* Yield + preptime */}
                <div className="mb-4 flex gap-3">
                  <label className="flex-1">
                    <span className="mb-1 block text-xs font-semibold text-gray-600">Rendimento (porções)</span>
                    <input
                      type="number"
                      min="1"
                      className="input w-full p-2"
                      value={recipeYield}
                      onChange={(e) => { setRecipeYield(e.target.value); setDirty(true); }}
                    />
                  </label>
                  <label className="flex-1">
                    <span className="mb-1 block text-xs font-semibold text-gray-600">Tempo de preparo (min)</span>
                    <input
                      type="number"
                      min="0"
                      className="input w-full p-2"
                      value={prepTime}
                      onChange={(e) => { setPrepTime(e.target.value); setDirty(true); }}
                    />
                  </label>
                </div>

                {/* Ingredients */}
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Ingredientes</span>
                    <button onClick={addRow} className="text-xs text-brand-red hover:underline">+ Adicionar</button>
                  </div>
                  <div className="rounded border border-gray-200">
                    <div className="grid grid-cols-[1fr_80px_120px_1fr_32px] gap-2 border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500">
                      <span>Ingrediente</span>
                      <span>Qtd</span>
                      <span>Unidade</span>
                      <span>Obs</span>
                      <span />
                    </div>
                    {ingredients.map((row) => (
                      <div key={row.id} className="grid grid-cols-[1fr_80px_120px_1fr_32px] gap-2 border-b border-gray-100 px-3 py-1.5 last:border-0">
                        <input
                          className="input p-1 text-sm"
                          placeholder="Nome"
                          value={row.name}
                          onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                        />
                        <input
                          className="input p-1 text-sm"
                          placeholder="0"
                          type="number"
                          min="0"
                          step="any"
                          value={row.quantity}
                          onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                        />
                        <select
                          className="input p-1 text-sm"
                          value={row.unit}
                          onChange={(e) => updateRow(row.id, 'unit', e.target.value)}
                        >
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input
                          className="input p-1 text-sm"
                          placeholder="Opcional"
                          value={row.notes}
                          onChange={(e) => updateRow(row.id, 'notes', e.target.value)}
                        />
                        <button
                          onClick={() => removeRow(row.id)}
                          className="text-gray-300 hover:text-red-400"
                          title="Remover"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Method */}
                <label className="mb-4 block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Modo de Preparo</span>
                  <textarea
                    className="input w-full p-2 text-sm"
                    rows={5}
                    placeholder="Descreva o passo a passo do preparo…"
                    value={method}
                    onChange={(e) => { setMethod(e.target.value); setDirty(true); }}
                  />
                </label>

                {/* Notes */}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Observações</span>
                  <textarea
                    className="input w-full p-2 text-sm"
                    rows={2}
                    placeholder="Alergênicos, variações, dicas…"
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
