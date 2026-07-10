'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  type CreateOrderPayload,
  type MenuItem,
} from '@/lib/api';

// Uma linha do carrinho: um item (ou uma opção específica dele).
interface CartLine {
  menuItemId: string;
  optionId?: string;
  label: string; // "Filé Mignon Grelhado" ou "Filé Mignon Grelhado — Inteira"
  priceCents: number;
  quantity: number;
}

export default function CardapioPage() {
  const { data: menu, isLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: api.getMenu,
  });

  // Carrinho: chave (optionId ou menuItemId) -> linha.
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    addressStreet: '',
    addressNumber: '',
    paymentMethod: 'PIX' as 'CASH' | 'PIX',
  });

  const totalCents = useMemo(
    () =>
      Object.values(cart).reduce(
        (sum, line) => sum + line.priceCents * line.quantity,
        0,
      ),
    [cart],
  );

  const createOrder = useMutation({
    mutationFn: (payload: CreateOrderPayload) => api.createOrder(payload),
  });

  const setQty = (line: Omit<CartLine, 'quantity'>, delta: number) =>
    setCart((prev) => {
      const key = line.optionId ?? line.menuItemId;
      const current = prev[key]?.quantity ?? 0;
      const next = Math.max(0, current + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[key];
      else copy[key] = { ...line, quantity: next };
      return copy;
    });

  const qtyOf = (key: string) => cart[key]?.quantity ?? 0;

  const submit = () => {
    const items = Object.values(cart).map((line) => ({
      menuItemId: line.menuItemId,
      optionId: line.optionId,
      quantity: line.quantity,
    }));
    if (items.length === 0) return;
    createOrder.mutate({ ...form, items });
  };

  if (createOrder.data) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-2xl font-bold">Pedido confirmado! 🎉</h1>
        <p className="mt-4 text-lg">
          Seu protocolo é{' '}
          <span className="font-mono font-bold">
            #{createOrder.data.protocol}
          </span>
        </p>
        <p className="mt-2 text-gray-600">
          Acompanhe o status pelo número acima.
        </p>
        <a
          href={`/pedido/${createOrder.data.protocol}`}
          className="mt-6 inline-block rounded bg-blue-600 px-4 py-2 font-medium text-white"
        >
          Acompanhar pedido
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Bacalhau &amp; Cia</h1>
      <p className="text-gray-600">Monte seu pedido</p>

      {isLoading && <p className="mt-6">Carregando cardápio...</p>}

      <div className="mt-6 space-y-8">
        {(menu ?? []).map((category) => (
          <section key={category.id}>
            <h2 className="text-xl font-semibold">{category.name}</h2>
            <ul className="mt-2 divide-y">
              {category.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  qtyOf={qtyOf}
                  setQty={setQty}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-8 space-y-3 rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold">Seus dados</h2>
        <input
          className="w-full rounded border p-2"
          placeholder="Nome"
          value={form.customerName}
          onChange={(e) => setForm({ ...form, customerName: e.target.value })}
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Telefone"
          value={form.customerPhone}
          onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Rua"
          value={form.addressStreet}
          onChange={(e) => setForm({ ...form, addressStreet: e.target.value })}
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Número"
          value={form.addressNumber}
          onChange={(e) => setForm({ ...form, addressNumber: e.target.value })}
        />
        <select
          className="w-full rounded border p-2"
          value={form.paymentMethod}
          onChange={(e) =>
            setForm({
              ...form,
              paymentMethod: e.target.value as 'CASH' | 'PIX',
            })
          }
        >
          <option value="PIX">PIX</option>
          <option value="CASH">Dinheiro</option>
        </select>

        <div className="flex items-center justify-between pt-2">
          <span className="text-lg font-bold">
            Total: {formatBRL(totalCents)}
          </span>
          <button
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
            disabled={totalCents === 0 || createOrder.isPending}
            onClick={submit}
          >
            {createOrder.isPending ? 'Enviando...' : 'Confirmar pedido'}
          </button>
        </div>
        {createOrder.isError && (
          <p className="text-sm text-red-600">
            Erro ao enviar. Tente novamente.
          </p>
        )}
      </section>
    </main>
  );
}

function Stepper({
  qty,
  onDec,
  onInc,
}: {
  qty: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button className="h-8 w-8 rounded bg-gray-200" onClick={onDec}>
        −
      </button>
      <span className="w-6 text-center">{qty}</span>
      <button className="h-8 w-8 rounded bg-gray-200" onClick={onInc}>
        +
      </button>
    </div>
  );
}

function ItemRow({
  item,
  qtyOf,
  setQty,
}: {
  item: MenuItem;
  qtyOf: (key: string) => number;
  setQty: (line: Omit<CartLine, 'quantity'>, delta: number) => void;
}) {
  const options = item.options ?? [];

  // Item com opções: uma linha por opção (cada uma com seu preço).
  if (options.length > 0) {
    return (
      <li className="py-3">
        <p className="font-medium">{item.name}</p>
        {item.description && (
          <p className="text-sm text-gray-500">{item.description}</p>
        )}
        <ul className="mt-2 space-y-2">
          {options.map((opt) => {
            const line = {
              menuItemId: item.id,
              optionId: opt.id,
              label: `${item.name} — ${opt.name}`,
              priceCents: opt.priceCents,
            };
            return (
              <li
                key={opt.id}
                className="flex items-center gap-3 rounded bg-gray-50 px-3 py-2"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{opt.name}</p>
                  <p className="text-sm">{formatBRL(opt.priceCents)}</p>
                </div>
                <Stepper
                  qty={qtyOf(opt.id)}
                  onDec={() => setQty(line, -1)}
                  onInc={() => setQty(line, 1)}
                />
              </li>
            );
          })}
        </ul>
      </li>
    );
  }

  // Item simples.
  const line = {
    menuItemId: item.id,
    label: item.name,
    priceCents: item.priceCents,
  };
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex-1">
        <p className="font-medium">{item.name}</p>
        {item.description && (
          <p className="text-sm text-gray-500">{item.description}</p>
        )}
        <p className="text-sm">{formatBRL(item.priceCents)}</p>
      </div>
      <Stepper
        qty={qtyOf(item.id)}
        onDec={() => setQty(line, -1)}
        onInc={() => setQty(line, 1)}
      />
    </li>
  );
}
