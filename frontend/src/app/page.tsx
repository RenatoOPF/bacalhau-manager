'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  mediaUrl,
  type CreateOrderPayload,
  type MenuItem,
} from '@/lib/api';
import dynamic from 'next/dynamic';
import { SiteFooter } from '@/components/site-footer';
import { UnifiedAddressInput, type AddressValue } from '@/components/UnifiedAddressInput';

const MapView = dynamic(
  () => import('@/components/MapView').then((m) => m.MapView),
  { ssr: false },
);

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
  // Item aberto no painel de detalhes.
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    address: { street: '', number: '', cep: '', neighborhood: '' } as AddressValue,
    addressComplement: '',
    paymentMethod: '' as 'CASH' | 'PIX' | '',
  });

  // Duas telas: cardápio e fechamento do pedido.
  const [view, setView] = useState<'menu' | 'checkout'>('menu');

  const [mapCoords, setMapCoords] = useState<{ lat: string; lon: string } | null>(null);

  function handleAddressChange(addr: AddressValue) {
    setForm((f) => ({ ...f, address: addr }));
  }

  useEffect(() => {
    const { street, number } = form.address;
    if (!street || !number) {
      setMapCoords(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          format: 'json',
          limit: '1',
          street: `${number} ${street}`,
          city: 'Maceió',
          state: 'Alagoas',
          country: 'Brasil',
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { 'Accept-Language': 'pt-BR,pt' } },
        );
        const data: { lat: string; lon: string }[] = await res.json();
        if (data[0]) {
          setMapCoords({ lat: data[0].lat, lon: data[0].lon });
        } else {
          setMapCoords(null);
        }
      } catch {
        setMapCoords(null);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [form.address.street, form.address.number]);

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

  const submittingRef = useRef(false);

  const submit = () => {
    if (submittingRef.current) return;
    const items = Object.values(cart).map((line) => ({
      menuItemId: line.menuItemId,
      optionId: line.optionId,
      quantity: line.quantity,
    }));
    if (items.length === 0) return;
    submittingRef.current = true;
    createOrder.mutate(
      {
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        addressStreet: form.address.street,
        addressNumber: form.address.number,
        addressComplement: form.addressComplement || undefined,
        addressNeighborhood: form.address.neighborhood || undefined,
        addressLat: mapCoords ? parseFloat(mapCoords.lat) : undefined,
        addressLng: mapCoords ? parseFloat(mapCoords.lon) : undefined,
        paymentMethod: (form.paymentMethod || 'PIX') as 'CASH' | 'PIX',
        items,
      },
      { onError: () => { submittingRef.current = false; } },
    );
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
                placeholder="Telefone (82) 99999-9999"
                value={form.customerPhone}
                inputMode="numeric"
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                  let phone = d;
                  if (d.length > 6) {
                    phone = `(${d.slice(0, 2)}) ${d.slice(2, d.length > 10 ? 7 : 6)}-${d.slice(d.length > 10 ? 7 : 6)}`;
                  } else if (d.length > 2) {
                    phone = `(${d.slice(0, 2)}) ${d.slice(2)}`;
                  } else if (d.length > 0) {
                    phone = `(${d}`;
                  }
                  setForm({ ...form, customerPhone: phone });
                }}
              />
              <UnifiedAddressInput
                value={form.address}
                onChange={handleAddressChange}
              />
              <input
                className="input w-full p-2"
                placeholder="Complemento (apto, bloco, referência…)"
                value={form.addressComplement}
                onChange={(e) =>
                  setForm({ ...form, addressComplement: e.target.value })
                }
              />
              <MapView customerCoords={mapCoords} />
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
                <option value="" disabled>Selecione a forma de pagamento</option>
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
                <span>a confirmar</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total estimado</span>
                <span className="text-brand-red">{formatBRL(totalCents)}</span>
              </div>
            </section>

            {/* Confirmação fixa no rodapé. */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-brand-gold bg-brand-red p-3 shadow-lg">
              <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
                <span className="font-display text-lg font-bold text-white">
                  {formatBRL(totalCents)}
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
                    cartQty={Object.values(cart)
                      .filter((l) => l.menuItemId === item.id)
                      .reduce((s, l) => s + l.quantity, 0)}
                    onSelect={() => setSelectedItem(item)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>

      <SiteFooter className={totalCents > 0 ? 'pb-24' : ''} />

      {/* Painel de detalhes do item */}
      {selectedItem && (
        <ItemDetailPanel
          item={selectedItem}
          qtyOf={qtyOf}
          setQty={setQty}
          onClose={() => setSelectedItem(null)}
        />
      )}

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
    <div className="flex items-center gap-3">
      <button
        className="h-9 w-9 rounded-full border border-brand-ink/20 bg-white text-lg font-bold text-brand-ink transition-colors hover:bg-brand-cream"
        onClick={onDec}
      >
        −
      </button>
      <span className="w-6 text-center font-semibold">{qty}</span>
      <button
        className="h-9 w-9 rounded-full bg-brand-gold text-lg font-bold text-brand-ink transition-colors hover:brightness-95"
        onClick={onInc}
      >
        +
      </button>
    </div>
  );
}

/** Card clicável na listagem — sem stepper, apenas info + badge de qtd. */
function ItemRow({
  item,
  cartQty,
  onSelect,
}: {
  item: MenuItem;
  cartQty: number;
  onSelect: () => void;
}) {
  const options = item.options ?? [];
  const minPrice = options.length > 0
    ? Math.min(...options.map((o) => o.priceCents))
    : item.priceCents;
  const priceLabel = options.length > 0
    ? `a partir de ${formatBRL(minPrice)}`
    : formatBRL(item.priceCents);

  return (
    <li>
      <button
        className="flex w-full items-center gap-3 py-3 text-left"
        onClick={onSelect}
      >
        <div className="flex-1">
          <p className="font-semibold">{item.name}</p>
          {item.description && (
            <p className="line-clamp-2 text-sm text-brand-ink/60">
              {item.description}
            </p>
          )}
          <p className="mt-0.5 text-sm font-bold text-brand-red">{priceLabel}</p>
        </div>
        <div className="relative shrink-0">
          {item.imageUrl ? (
            <img
              src={mediaUrl(item.imageUrl)}
              alt={item.name}
              className="h-20 w-20 rounded-lg object-cover"
            />
          ) : (
            <div className="h-20 w-20 rounded-lg bg-brand-cream-dark" />
          )}
          {cartQty > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-red text-[11px] font-bold text-white shadow">
              {cartQty}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

/** Painel deslizante que aparece ao clicar em um item do cardápio. */
function ItemDetailPanel({
  item,
  qtyOf,
  setQty,
  onClose,
}: {
  item: MenuItem;
  qtyOf: (key: string) => number;
  setQty: (line: Omit<CartLine, 'quantity'>, delta: number) => void;
  onClose: () => void;
}) {
  const options = item.options ?? [];

  // Qty local para cada chave (optionId ou menuItemId), inicializada do carrinho.
  const [localQtys, setLocalQtys] = useState<Record<string, number>>(() => {
    if (options.length > 0) {
      return Object.fromEntries(options.map((o) => [o.id, qtyOf(o.id)]));
    }
    return { [item.id]: Math.max(1, qtyOf(item.id)) };
  });

  const adj = (key: string, delta: number) =>
    setLocalQtys((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] ?? 0) + delta),
    }));

  const confirm = () => {
    if (options.length > 0) {
      options.forEach((opt) => {
        const line = {
          menuItemId: item.id,
          optionId: opt.id,
          label: `${item.name} — ${opt.name}`,
          priceCents: opt.priceCents,
        };
        const delta = (localQtys[opt.id] ?? 0) - qtyOf(opt.id);
        if (delta !== 0) setQty(line, delta);
      });
    } else {
      const line = { menuItemId: item.id, label: item.name, priceCents: item.priceCents };
      const delta = (localQtys[item.id] ?? 0) - qtyOf(item.id);
      if (delta !== 0) setQty(line, delta);
    }
    onClose();
  };

  // Total local (para exibir no botão)
  const localTotal = options.length > 0
    ? options.reduce((sum, o) => sum + (localQtys[o.id] ?? 0) * o.priceCents, 0)
    : (localQtys[item.id] ?? 0) * item.priceCents;

  const localCount = options.length > 0
    ? options.reduce((sum, o) => sum + (localQtys[o.id] ?? 0), 0)
    : (localQtys[item.id] ?? 0);

  return (
    <>
      {/* Overlay escuro */}
      <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} />

      {/* Painel */}
      <div className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl">
        {/* Botão fechar */}
        <div className="sticky top-0 flex justify-end bg-white/80 px-4 pb-1 pt-3 backdrop-blur-sm">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-ink/10 text-brand-ink/60 hover:bg-brand-ink/20"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-8">
          {/* Imagem grande */}
          {item.imageUrl && (
            <img
              src={mediaUrl(item.imageUrl)}
              alt={item.name}
              className="mx-auto mb-4 h-52 w-full max-w-sm rounded-xl object-cover"
            />
          )}

          {/* Info */}
          <h2 className="font-display text-2xl font-bold text-brand-ink">
            {item.name}
          </h2>
          {item.description && (
            <p className="mt-1 text-brand-ink/60">{item.description}</p>
          )}

          {/* Opções com stepper próprio */}
          {options.length > 0 ? (
            <ul className="mt-5 space-y-3">
              {options.map((opt) => (
                <li
                  key={opt.id}
                  className="rounded-xl border border-brand-cream-dark px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{opt.name}</p>
                      <p className="text-sm font-bold text-brand-red">
                        {formatBRL(opt.priceCents)}
                      </p>
                    </div>
                    <Stepper
                      qty={localQtys[opt.id] ?? 0}
                      onDec={() => adj(opt.id, -1)}
                      onInc={() => adj(opt.id, 1)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            /* Item simples: preço + stepper centralizado */
            <div className="mt-6 flex flex-col items-center gap-3">
              <p className="font-display text-2xl font-bold text-brand-red">
                {formatBRL(item.priceCents)}
              </p>
              <Stepper
                qty={localQtys[item.id] ?? 1}
                onDec={() => adj(item.id, -1)}
                onInc={() => adj(item.id, 1)}
              />
            </div>
          )}

          {/* Botão confirmar */}
          <button
            className="btn-primary mt-6 w-full py-3 text-base disabled:opacity-40"
            disabled={localCount === 0}
            onClick={confirm}
          >
            {localCount === 0
              ? 'Adicionar ao pedido'
              : `Adicionar ao pedido · ${formatBRL(localTotal)}`}
          </button>
        </div>
      </div>
    </>
  );
}
