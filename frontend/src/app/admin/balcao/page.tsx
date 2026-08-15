'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatBRL, type MenuItem, type MenuCategory, type Customer, type Neighborhood } from '@/lib/api';

interface CartLine {
  menuItemId: string;
  optionId?: string;
  label: string;
  priceCents: number;
  quantity: number;
}

// ---- Busca de cliente com autocomplete ----

function CustomerSearch({
  onSelect,
}: {
  onSelect: (customer: Customer | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<Customer[]>({
    queryKey: ['customers-search', query],
    queryFn: () => api.listCustomers(query),
    enabled: query.trim().length >= 1,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function pick(c: Customer) {
    setSelected(c);
    setQuery(c.name);
    setOpen(false);
    onSelect(c);
  }

  function clear() {
    setSelected(null);
    setQuery('');
    setOpen(false);
    onSelect(null);
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-2">
        <input
          className="input flex-1 p-2 text-sm"
          placeholder="Buscar cliente (nome ou telefone)…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            onSelect(null);
            setOpen(true);
          }}
          onFocus={() => { if (query.trim()) setOpen(true); }}
        />
        {selected && (
          <button
            type="button"
            className="shrink-0 rounded-lg border border-brand-cream-dark px-2 text-xs text-brand-ink/50 hover:text-brand-red"
            onClick={clear}
          >
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && !selected && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-brand-cream-dark bg-white shadow-md">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-cream"
                onMouseDown={() => pick(c)}
              >
                <span className="font-semibold">{c.name}</span>
                {c.phone && <span className="ml-2 text-brand-ink/50">{c.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Seleção de endereço do cliente ----

function AddressSelect({
  customer,
  selectedAddressId,
  onChange,
}: {
  customer: Customer;
  selectedAddressId: string | null;
  onChange: (id: string) => void;
}) {
  if (customer.addresses.length === 0) return null;

  return (
    <select
      className="input w-full p-2 text-sm"
      value={selectedAddressId ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— Sem endereço —</option>
      {customer.addresses.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label ? `${a.label}: ` : ''}
          {[a.street, a.number, a.neighborhood].filter(Boolean).join(', ')}
          {a.isDefault ? ' (padrão)' : ''}
        </option>
      ))}
    </select>
  );
}

// ---- Página ----

export default function BalcaoPage() {
  const qc = useQueryClient();
  const { data: menu, isLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: api.getMenu,
  });
  const { data: neighborhoods = [] } = useQuery<Neighborhood[]>({
    queryKey: ['neighborhoods'],
    queryFn: () => api.listNeighborhoods(),
  });

  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'PIX'>('CASH');
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ dailyNumber: number; protocol: number } | null>(null);

  const totalCents = useMemo(
    () => Object.values(cart).reduce((s, l) => s + l.priceCents * l.quantity, 0),
    [cart],
  );

  function normalize(s: string) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function matchNeighborhood(neighborhoodName?: string | null): string | null {
    if (!neighborhoodName) return null;
    const n = normalize(neighborhoodName);
    const exact = neighborhoods.find((nb) => normalize(nb.name) === n);
    if (exact) return exact.id;
    const partial = neighborhoods.find((nb) => {
      const a = normalize(nb.name);
      return a.includes(n) || n.includes(a);
    });
    return partial?.id ?? null;
  }

  // Quando seleciona cliente, preenche nome e telefone e pré-seleciona endereço padrão.
  function handleCustomerSelect(c: Customer | null) {
    setSelectedCustomer(c);
    if (c) {
      setCustomerName(c.name);
      setCustomerPhone(c.phone ?? '');
      const def = c.addresses.find((a) => a.isDefault) ?? c.addresses[0];
      setSelectedAddressId(def?.id ?? null);
      setSelectedNeighborhoodId(matchNeighborhood(def?.neighborhood));
    } else {
      setSelectedAddressId(null);
      setSelectedNeighborhoodId(null);
    }
  }

  function handleAddressChange(addressId: string) {
    setSelectedAddressId(addressId);
    const addr = selectedCustomer?.addresses.find((a) => a.id === addressId);
    setSelectedNeighborhoodId(matchNeighborhood(addr?.neighborhood));
  }

  const addToCart = (item: MenuItem, optionId?: string) => {
    const option = (item.options ?? []).find((o) => o.id === optionId);
    const key = optionId ?? item.id;
    const label = option ? `${item.name} — ${option.name}` : item.name;
    const priceCents = option ? option.priceCents : item.priceCents;
    setCart((prev) => ({
      ...prev,
      [key]: {
        menuItemId: item.id,
        optionId,
        label,
        priceCents,
        quantity: (prev[key]?.quantity ?? 0) + 1,
      },
    }));
  };

  const setQty = (key: string, qty: number) =>
    setCart((prev) => {
      const copy = { ...prev };
      if (qty <= 0) delete copy[key];
      else copy[key] = { ...copy[key], quantity: qty };
      return copy;
    });

  const createOrder = useMutation({
    mutationFn: () => {
      const items = Object.values(cart).map((l) => ({
        menuItemId: l.menuItemId,
        optionId: l.optionId,
        quantity: l.quantity,
      }));

      const selectedAddress = selectedCustomer?.addresses.find(
        (a) => a.id === selectedAddressId,
      );

      return api.createOrder({
        customerId: selectedCustomer?.id,
        customerName: customerName.trim() || 'Balcão',
        customerPhone: customerPhone.trim() || undefined,
        addressStreet: selectedAddress?.street,
        addressNumber: selectedAddress?.number ?? undefined,
        addressNeighborhood: selectedAddress?.neighborhood ?? undefined,
        addressLat: selectedAddress?.lat ?? undefined,
        addressLng: selectedAddress?.lng ?? undefined,
        neighborhoodId: selectedNeighborhoodId ?? undefined,
        notes: notes.trim() || undefined,
        paymentMethod,
        items,
      });
    },
    onSuccess: (order) => {
      setSuccess({ dailyNumber: order.dailyNumber, protocol: order.protocol });
      setCart({});
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
      setSelectedOptions({});
      setSelectedCustomer(null);
      setSelectedAddressId(null);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-brand-ink/40">Carregando cardápio…</div>;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="page-title">Pedido no balcão</h1>

      {success && (
        <div className="mt-4 rounded-lg border-2 border-brand-gold bg-brand-gold/10 p-4">
          <p className="font-bold text-brand-ink">
            Pedido #{success.dailyNumber} criado com sucesso!
          </p>
          <div className="mt-2 flex gap-3">
            <button className="btn-primary px-4 py-1.5 text-sm" onClick={() => setSuccess(null)}>
              Novo pedido
            </button>
            <a
              href={`/pedido/${success.protocol}`}
              target="_blank"
              className="btn-outline px-4 py-1.5 text-sm"
            >
              Ver acompanhamento
            </a>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Cardápio */}
        <div className="space-y-6">
          {(menu ?? []).map((cat: MenuCategory) => (
            <section key={cat.id}>
              <h2 className="section-title border-b border-brand-cream-dark pb-1">
                {cat.name}
              </h2>
              <ul className="mt-2 divide-y divide-brand-cream-dark">
                {cat.items
                  .filter((item) => item.available)
                  .map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      selectedOption={selectedOptions[item.id]}
                      onOptionChange={(optId) =>
                        setSelectedOptions((prev) => ({ ...prev, [item.id]: optId }))
                      }
                      onAdd={() => {
                        if ((item.options ?? []).length > 0 && !selectedOptions[item.id]) return;
                        addToCart(item, selectedOptions[item.id]);
                      }}
                    />
                  ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Carrinho + dados do pedido */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="section-title">Carrinho</h2>
            {Object.keys(cart).length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/40">Nenhum item adicionado.</p>
            ) : (
              <ul className="mt-2 divide-y divide-brand-cream-dark">
                {Object.entries(cart).map(([key, line]) => (
                  <li key={key} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1 leading-tight">{line.label}</span>
                    <span className="text-brand-red font-semibold">
                      {formatBRL(line.priceCents * line.quantity)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded bg-brand-cream-dark text-xs font-bold"
                        onClick={() => setQty(key, line.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-xs">{line.quantity}</span>
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded bg-brand-cream-dark text-xs font-bold"
                        onClick={() => setQty(key, line.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {totalCents > 0 && (
              <div className="mt-3 flex justify-between border-t border-brand-cream-dark pt-2 font-bold">
                <span>Total</span>
                <span className="text-brand-red">{formatBRL(totalCents)}</span>
              </div>
            )}
          </div>

          <div className="card space-y-3 p-4">
            <h2 className="section-title">Dados do pedido</h2>

            <CustomerSearch onSelect={handleCustomerSelect} />

            {selectedCustomer && selectedCustomer.addresses.length > 0 && (
              <AddressSelect
                customer={selectedCustomer}
                selectedAddressId={selectedAddressId}
                onChange={handleAddressChange}
              />
            )}

            <input
              className="input w-full p-2 text-sm"
              placeholder="Nome do cliente (opcional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              className="input w-full p-2 text-sm"
              placeholder="Telefone (opcional)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
            <textarea
              className="input w-full p-2 text-sm"
              placeholder="Observações (opcional)"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex gap-2">
              {(['CASH', 'PIX'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors ${
                    paymentMethod === m
                      ? 'border-brand-gold bg-brand-gold/10 text-brand-ink'
                      : 'border-brand-cream-dark text-brand-ink/50'
                  }`}
                >
                  {m === 'CASH' ? 'Dinheiro' : 'PIX'}
                </button>
              ))}
            </div>

            {createOrder.isError && (
              <p className="text-sm text-brand-red">Erro ao criar pedido. Tente novamente.</p>
            )}

            <button
              className="btn-primary w-full py-2.5"
              disabled={Object.keys(cart).length === 0 || createOrder.isPending}
              onClick={() => createOrder.mutate()}
            >
              {createOrder.isPending ? 'Criando…' : 'Criar pedido'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function ItemRow({
  item,
  selectedOption,
  onOptionChange,
  onAdd,
}: {
  item: MenuItem;
  selectedOption?: string;
  onOptionChange: (optionId: string) => void;
  onAdd: () => void;
}) {
  const hasOptions = (item.options ?? []).length > 0;
  const canAdd = !hasOptions || !!selectedOption;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="font-semibold leading-tight">{item.name}</p>
        {!hasOptions && (
          <p className="text-sm font-bold text-brand-red">{formatBRL(item.priceCents)}</p>
        )}
        {hasOptions && (
          <select
            className="input mt-1 w-full p-1 text-sm"
            value={selectedOption ?? ''}
            onChange={(e) => onOptionChange(e.target.value)}
          >
            <option value="" disabled>Escolha o tamanho…</option>
            {(item.options ?? [])
              .filter((o) => o.available)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {formatBRL(o.priceCents)}
                </option>
              ))}
          </select>
        )}
      </div>
      <button
        className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
          canAdd
            ? 'bg-brand-red text-white hover:bg-brand-red/80'
            : 'cursor-not-allowed bg-brand-cream-dark text-brand-ink/30'
        }`}
        onClick={onAdd}
        disabled={!canAdd}
      >
        + Adicionar
      </button>
    </li>
  );
}
