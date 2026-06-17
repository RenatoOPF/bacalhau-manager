'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, formatBRL, type CreateOrderPayload } from '@/lib/api';

export default function CardapioPage() {
  const { data: menu, isLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: api.getMenu,
  });

  // Carrinho simples: menuItemId -> quantidade.
  const [cart, setCart] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    addressStreet: '',
    addressNumber: '',
    paymentMethod: 'PIX' as 'CASH' | 'PIX',
  });

  const allItems = useMemo(
    () => (menu ?? []).flatMap((c) => c.items),
    [menu],
  );

  const totalCents = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [id, qty]) => {
        const item = allItems.find((i) => i.id === id);
        return sum + (item ? item.priceCents * qty : 0);
      }, 0),
    [cart, allItems],
  );

  const createOrder = useMutation({
    mutationFn: (payload: CreateOrderPayload) => api.createOrder(payload),
  });

  const setQty = (id: string, delta: number) =>
    setCart((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  const submit = () => {
    const items = Object.entries(cart).map(([menuItemId, quantity]) => ({
      menuItemId,
      quantity,
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
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    {item.description && (
                      <p className="text-sm text-gray-500">
                        {item.description}
                      </p>
                    )}
                    <p className="text-sm">{formatBRL(item.priceCents)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="h-8 w-8 rounded bg-gray-200"
                      onClick={() => setQty(item.id, -1)}
                    >
                      −
                    </button>
                    <span className="w-6 text-center">
                      {cart[item.id] ?? 0}
                    </span>
                    <button
                      className="h-8 w-8 rounded bg-gray-200"
                      onClick={() => setQty(item.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
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
          onChange={(e) =>
            setForm({ ...form, customerName: e.target.value })
          }
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Telefone"
          value={form.customerPhone}
          onChange={(e) =>
            setForm({ ...form, customerPhone: e.target.value })
          }
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Rua"
          value={form.addressStreet}
          onChange={(e) =>
            setForm({ ...form, addressStreet: e.target.value })
          }
        />
        <input
          className="w-full rounded border p-2"
          placeholder="Número"
          value={form.addressNumber}
          onChange={(e) =>
            setForm({ ...form, addressNumber: e.target.value })
          }
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
