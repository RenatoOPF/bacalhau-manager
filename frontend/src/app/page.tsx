'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  type CreateOrderPayload,
  type MenuItem,
} from '@/lib/api';
import { SiteFooter } from '@/components/site-footer';

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
    neighborhoodId: '',
    paymentMethod: 'PIX' as 'CASH' | 'PIX',
  });

  const { data: neighborhoods } = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: api.listNeighborhoods,
  });

  // Duas telas: cardápio e fechamento do pedido.
  const [view, setView] = useState<'menu' | 'checkout'>('menu');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const totalCents = useMemo(
    () =>
      Object.values(cart).reduce(
        (sum, line) => sum + line.priceCents * line.quantity,
        0,
      ),
    [cart],
  );

  // Taxa de entrega do bairro escolhido; total = itens + entrega.
  const deliveryFeeCents =
    (neighborhoods ?? []).find((n) => n.id === form.neighborhoodId)
      ?.customerFeeCents ?? 0;
  const grandTotalCents = totalCents + deliveryFeeCents;

  const createOrder = useMutation({
    mutationFn: (payload: CreateOrderPayload) => api.createOrder(payload),
  });

  // Barra de categorias fixa: qual seção está visível e rolagem até ela.
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (view !== 'menu') return;
    const onScroll = () => {
      // Ativa a última categoria cujo topo já passou da barra fixa.
      const entries = Object.entries(sectionRefs.current);
      let current: string | null = entries[0]?.[0] ?? null;
      for (const [id, el] of entries) {
        if (el && el.getBoundingClientRect().top <= 120) current = id;
      }
      setActiveCat(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [menu, view]);

  // Mantém o chip ativo à vista na barra (rolagem horizontal).
  useEffect(() => {
    if (activeCat) {
      chipRefs.current[activeCat]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeCat]);

  const goTo = (id: string) =>
    sectionRefs.current[id]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
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
    createOrder.mutate({
      ...form,
      neighborhoodId: form.neighborhoodId || undefined,
      items,
    });
  };

  if (createOrder.data) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <img
          src="/logo.jpeg"
          alt="Restaurante Bacalhau & Cia"
          className="mx-auto mt-4 h-28 w-28 rounded-full shadow-md"
        />
        <h1 className="page-title mt-6">Pedido confirmado! 🎉</h1>
        <p className="mt-4 text-lg">
          Seu pedido é{' '}
          <span className="font-mono font-bold">
            #{createOrder.data.dailyNumber}
          </span>
        </p>
        <p className="mt-2 text-brand-ink/60">
          Acompanhe o status pelo número acima.
        </p>
        <a
          href={`/pedido/${createOrder.data.protocol}`}
          className="btn-primary mt-6 inline-block px-6 py-2.5"
        >
          Acompanhar pedido
        </a>
      </main>
    );
  }

  if (view === 'checkout') {
    const lines = Object.values(cart);
    return (
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">
        <header className="flex items-center gap-3">
          <button
            className="btn-outline px-3 py-1.5 text-sm"
            onClick={() => setView('menu')}
          >
            ← Cardápio
          </button>
          <h1 className="page-title">Fechar pedido</h1>
        </header>

        {lines.length === 0 ? (
          <div className="card mt-6 p-6 text-center text-brand-ink/60">
            <p>Seu carrinho está vazio.</p>
            <button
              className="btn-primary mt-4 px-5 py-2"
              onClick={() => setView('menu')}
            >
              Voltar ao cardápio
            </button>
          </div>
        ) : (
          <>
            <section className="card mt-4 p-4">
              <h2 className="section-title">Seu pedido</h2>
              <ul className="mt-1 divide-y divide-brand-cream-dark">
                {lines.map((line) => {
                  const { quantity, ...rest } = line;
                  const key = line.optionId ?? line.menuItemId;
                  return (
                    <li key={key} className="flex items-center gap-3 py-3">
                      <div className="flex-1">
                        <p className="font-semibold">{line.label}</p>
                        <p className="text-sm font-bold text-brand-red">
                          {formatBRL(line.priceCents * line.quantity)}
                        </p>
                      </div>
                      <Stepper
                        qty={quantity}
                        onDec={() => setQty(rest, -1)}
                        onInc={() => setQty(rest, 1)}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="card mt-4 space-y-3 p-4">
              <h2 className="section-title">Seus dados</h2>
              <input
                className="input w-full p-2"
                placeholder="Nome"
                value={form.customerName}
                onChange={(e) =>
                  setForm({ ...form, customerName: e.target.value })
                }
              />
              <input
                className="input w-full p-2"
                placeholder="Telefone"
                value={form.customerPhone}
                onChange={(e) =>
                  setForm({ ...form, customerPhone: e.target.value })
                }
              />
              <input
                className="input w-full p-2"
                placeholder="Rua"
                value={form.addressStreet}
                onChange={(e) =>
                  setForm({ ...form, addressStreet: e.target.value })
                }
              />
              <input
                className="input w-full p-2"
                placeholder="Número"
                value={form.addressNumber}
                onChange={(e) =>
                  setForm({ ...form, addressNumber: e.target.value })
                }
              />
              {(neighborhoods ?? []).length > 0 && (
                <select
                  className="input w-full p-2"
                  value={form.neighborhoodId}
                  onChange={(e) =>
                    setForm({ ...form, neighborhoodId: e.target.value })
                  }
                >
                  <option value="">Bairro (taxa de entrega)…</option>
                  {(neighborhoods ?? []).map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                      {n.customerFeeCents > 0
                        ? ` — ${formatBRL(n.customerFeeCents)}`
                        : ' — grátis'}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="input w-full p-2"
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
              {createOrder.isError && (
                <p className="text-sm text-brand-red">
                  Erro ao enviar. Tente novamente.
                </p>
              )}
            </section>

            {/* Resumo de valores. */}
            <section className="card mt-4 space-y-1 p-4 text-sm">
              <div className="flex justify-between text-brand-ink/70">
                <span>Itens</span>
                <span>{formatBRL(totalCents)}</span>
              </div>
              <div className="flex justify-between text-brand-ink/70">
                <span>Entrega</span>
                <span>
                  {deliveryFeeCents > 0 ? formatBRL(deliveryFeeCents) : 'grátis'}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span className="text-brand-red">
                  {formatBRL(grandTotalCents)}
                </span>
              </div>
            </section>

            {/* Confirmação fixa no rodapé. */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-brand-gold bg-brand-red p-3 shadow-lg">
              <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
                <span className="font-display text-lg font-bold text-white">
                  {formatBRL(grandTotalCents)}
                </span>
                <button
                  className="btn-gold px-5 py-2"
                  disabled={totalCents === 0 || createOrder.isPending}
                  onClick={submit}
                >
                  {createOrder.isPending ? 'Enviando...' : 'Confirmar pedido'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 pt-5">
        <header className="flex flex-col items-center text-center">
          <img
            src="/logo.jpeg"
            alt="Restaurante Bacalhau & Cia"
            className="h-24 w-24 rounded-full shadow-md"
          />
          <h1 className="font-display text-2xl font-extrabold text-brand-red">
            Bacalhau &amp; Cia
          </h1>
          <p className="text-sm text-brand-ink/60">Monte seu pedido</p>
        </header>

        {/* Categorias sempre visíveis, fixas no topo. */}
        <nav className="sticky top-0 z-20 -mx-4 mt-4 border-b border-brand-cream-dark bg-brand-cream shadow-sm">
          <div className="flex gap-1.5 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(menu ?? []).map((c) => (
              <button
                key={c.id}
                ref={(el) => {
                  chipRefs.current[c.id] = el;
                }}
                onClick={() => goTo(c.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  activeCat === c.id
                    ? 'bg-brand-red text-white'
                    : 'text-brand-ink/70 hover:bg-brand-cream-dark'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </nav>

        {isLoading && (
          <p className="mt-6 text-center text-brand-ink/60">
            Carregando cardápio...
          </p>
        )}

        <div className="mt-5 space-y-5">
          {(menu ?? []).map((category) => (
            <section
              key={category.id}
              ref={(el) => {
                sectionRefs.current[category.id] = el;
              }}
              className="card scroll-mt-16 p-4"
            >
              <h2 className="font-display text-xl font-bold text-brand-red">
                {category.name}
              </h2>
              <ul className="mt-1 divide-y divide-brand-cream-dark">
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
      </main>

      <SiteFooter className={totalCents > 0 ? 'pb-24' : ''} />

      {/* Atalho fixo no rodapé: total do carrinho → tela de fechamento. */}
      {totalCents > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-brand-gold bg-brand-red p-3 shadow-lg">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <span className="font-display text-lg font-bold text-white">
              {formatBRL(totalCents)}
            </span>
            <button
              className="btn-gold px-5 py-2"
              onClick={() => setView('checkout')}
            >
              Fechar pedido
            </button>
          </div>
        </div>
      )}
    </>
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
      <button
        className="h-8 w-8 rounded-full border border-brand-ink/20 bg-white font-bold text-brand-ink transition-colors hover:bg-brand-cream"
        onClick={onDec}
      >
        −
      </button>
      <span className="w-6 text-center font-semibold">{qty}</span>
      <button
        className="h-8 w-8 rounded-full bg-brand-gold font-bold text-brand-ink transition-colors hover:bg-brand-gold-dark"
        onClick={onInc}
      >
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
        <p className="font-semibold">{item.name}</p>
        {item.description && (
          <p className="text-sm text-brand-ink/60">{item.description}</p>
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
                className="flex items-center gap-3 rounded-lg bg-brand-cream px-3 py-2"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold">{opt.name}</p>
                  <p className="text-sm font-bold text-brand-red">
                    {formatBRL(opt.priceCents)}
                  </p>
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
        <p className="font-semibold">{item.name}</p>
        {item.description && (
          <p className="text-sm text-brand-ink/60">{item.description}</p>
        )}
        <p className="text-sm font-bold text-brand-red">
          {formatBRL(item.priceCents)}
        </p>
      </div>
      <Stepper
        qty={qtyOf(item.id)}
        onDec={() => setQty(line, -1)}
        onInc={() => setQty(line, 1)}
      />
    </li>
  );
}
