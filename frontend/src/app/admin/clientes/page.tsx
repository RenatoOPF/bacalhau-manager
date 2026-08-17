'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { UnifiedAddressInput, type AddressValue } from '@/components/UnifiedAddressInput';

const MapView = dynamic(
  () => import('@/components/MapView').then((m) => m.MapView),
  { ssr: false },
);
import {
  api,
  formatBRL,
  type Customer,
  type CustomerAddress,
  type CustomerDetail,
  type CreateCustomerPayload,
  type CreateAddressPayload,
  type Neighborhood,
  CHANNEL_LABEL,
} from '@/lib/api';

// ---- Helpers ----

function formatAddress(a: CustomerAddress): string {
  return [
    a.street,
    a.number,
    a.complement,
    a.neighborhood,
    a.reference,
  ]
    .filter(Boolean)
    .join(', ');
}

// ---- Formulário de edição de cliente (só dados básicos) ----

function CustomerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<CreateCustomerPayload>;
  onSave: (data: CreateCustomerPayload) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), phone: phone.trim() || undefined, notes: notes.trim() || undefined });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className="input w-full p-2 text-sm"
        placeholder="Nome *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="input w-full p-2 text-sm"
        placeholder="Telefone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <textarea
        className="input w-full p-2 text-sm"
        placeholder="Observações internas"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && <p className="text-sm text-brand-red">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary px-4 py-1.5 text-sm" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="btn-outline px-4 py-1.5 text-sm" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---- Hook: geocodifica endereço via Nominatim ----

function useGeocode(street: string, number: string) {
  const [coords, setCoords] = useState<{ lat: string; lon: string } | null>(null);
  useEffect(() => {
    if (!street || !number) { setCoords(null); return; }
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          format: 'json', limit: '1',
          street: `${number} ${street}`,
          city: 'Maceió', state: 'Alagoas', country: 'Brasil',
        });
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          headers: { 'Accept-Language': 'pt-BR,pt' },
        });
        const data: { lat: string; lon: string }[] = await res.json();
        setCoords(data[0] ?? null);
      } catch { setCoords(null); }
    }, 1000);
    return () => clearTimeout(t);
  }, [street, number]);
  return coords;
}

// ---- Bloco de endereço reutilizável (autocomplete + mapa) ----

function AddressBlock({
  addr,
  complement,
  reference,
  neighborhoodId,
  onChange,
  onComplementChange,
  onReferenceChange,
  onNeighborhoodIdChange,
}: {
  addr: AddressValue;
  complement: string;
  reference: string;
  neighborhoodId: string;
  onChange: (v: AddressValue) => void;
  onComplementChange: (v: string) => void;
  onReferenceChange: (v: string) => void;
  onNeighborhoodIdChange: (id: string) => void;
}) {
  const coords = useGeocode(addr.street, addr.number);
  const { data: neighborhoods = [] } = useQuery<Neighborhood[]>({
    queryKey: ['neighborhoods'],
    queryFn: () => api.listNeighborhoods(),
  });
  return (
    <div className="space-y-2">
      <UnifiedAddressInput value={addr} onChange={onChange} />
      <select
        className="input w-full p-2 text-sm"
        value={neighborhoodId}
        onChange={(e) => onNeighborhoodIdChange(e.target.value)}
      >
        <option value="">Bairro (taxa de entrega)…</option>
        {neighborhoods.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
      <input
        className="input w-full p-2 text-sm"
        placeholder="Complemento (apto, bloco…)"
        value={complement}
        onChange={(e) => onComplementChange(e.target.value)}
      />
      <input
        className="input w-full p-2 text-sm"
        placeholder="Referência (perto de…)"
        value={reference}
        onChange={(e) => onReferenceChange(e.target.value)}
      />
      <MapView customerCoords={coords} />
    </div>
  );
}

// ---- Formulário completo de criação (cliente + endereço numa etapa) ----

function NewCustomerForm({
  onSave,
  onCancel,
}: {
  onSave: (customer: CreateCustomerPayload, address?: CreateAddressPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [addr, setAddr] = useState<AddressValue>({ street: '', number: '', cep: '', neighborhood: '' });
  const [complement, setComplement] = useState('');
  const [reference, setReference] = useState('');
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const coords = useGeocode(addr.street, addr.number);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const address: CreateAddressPayload | undefined = addr.street.trim()
        ? {
            street: addr.street.trim(),
            number: addr.number.trim() || undefined,
            complement: complement.trim() || undefined,
            neighborhood: addr.neighborhood.trim() || undefined,
            neighborhoodId: neighborhoodId || undefined,
            reference: reference.trim() || undefined,
            lat: coords ? parseFloat(coords.lat) : undefined,
            lng: coords ? parseFloat(coords.lon) : undefined,
            isDefault: true,
          }
        : undefined;
      await onSave(
        { name: name.trim(), phone: phone.trim() || undefined, notes: notes.trim() || undefined },
        address,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/40">Dados do cliente</p>
      <input
        className="input w-full p-2 text-sm"
        placeholder="Nome *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="input w-full p-2 text-sm"
        placeholder="Telefone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <textarea
        className="input w-full p-2 text-sm"
        placeholder="Observações internas"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/40">Endereço</p>
      <AddressBlock
        addr={addr}
        complement={complement}
        reference={reference}
        neighborhoodId={neighborhoodId}
        onChange={setAddr}
        onComplementChange={setComplement}
        onReferenceChange={setReference}
        onNeighborhoodIdChange={setNeighborhoodId}
      />
      {error && <p className="text-sm text-brand-red">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary px-4 py-1.5 text-sm" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="btn-outline px-4 py-1.5 text-sm" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---- Formulário de endereço (adicionar / editar no painel de detalhe) ----

function AddressForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<CreateAddressPayload>;
  onSave: (data: CreateAddressPayload) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [addr, setAddr] = useState<AddressValue>({
    street: initial?.street ?? '',
    number: initial?.number ?? '',
    cep: '',
    neighborhood: initial?.neighborhood ?? '',
  });
  const [complement, setComplement] = useState(initial?.complement ?? '');
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [neighborhoodId, setNeighborhoodId] = useState(initial?.neighborhoodId ?? '');
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const coords = useGeocode(addr.street, addr.number);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!addr.street.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        label: label.trim() || undefined,
        street: addr.street.trim(),
        number: addr.number.trim() || undefined,
        complement: complement.trim() || undefined,
        neighborhood: addr.neighborhood.trim() || undefined,
        neighborhoodId: neighborhoodId || undefined,
        reference: reference.trim() || undefined,
        lat: coords ? parseFloat(coords.lat) : undefined,
        lng: coords ? parseFloat(coords.lon) : undefined,
        isDefault,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-brand-cream-dark bg-brand-cream p-3">
      <input
        className="input w-full p-2 text-sm"
        placeholder="Rótulo (ex.: Casa, Trabalho)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <AddressBlock
        addr={addr}
        complement={complement}
        reference={reference}
        neighborhoodId={neighborhoodId}
        onChange={setAddr}
        onComplementChange={setComplement}
        onReferenceChange={setReference}
        onNeighborhoodIdChange={setNeighborhoodId}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Endereço padrão
      </label>
      {error && <p className="text-sm text-brand-red">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-1.5 text-sm" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="btn-outline px-3 py-1.5 text-sm" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---- Painel de detalhe do cliente ----

function CustomerPanel({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api.getCustomer(customerId),
  });

  const [editing, setEditing] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  // Abre o formulário automaticamente quando o cliente ainda não tem endereço.
  const [addingAddress, setAddingAddress] = useState(false);
  const hasAddresses = (customer?.addresses.length ?? 1) > 0;
  const showAddressForm = addingAddress || (!hasAddresses && !isLoading);

  const updateCustomer = useMutation({
    mutationFn: (payload: Partial<CreateCustomerPayload>) =>
      api.updateCustomer(customerId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setEditing(false);
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: () => api.deleteCustomer(customerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
  });

  const addAddress = useMutation({
    mutationFn: (payload: CreateAddressPayload) =>
      api.addCustomerAddress(customerId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      setAddingAddress(false);
    },
  });

  const updateAddress = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateAddressPayload> }) =>
      api.updateCustomerAddress(customerId, id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      setEditingAddressId(null);
    },
  });

  const deleteAddress = useMutation({
    mutationFn: (addressId: string) =>
      api.deleteCustomerAddress(customerId, addressId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customer', customerId] }),
  });

  if (isLoading) {
    return <div className="p-6 text-brand-ink/40">Carregando…</div>;
  }
  if (!customer) return null;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-ink">{customer.name}</h2>
          {customer.phone && (
            <p className="text-sm text-brand-ink/60">{customer.phone}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn-outline px-3 py-1 text-sm" onClick={() => setEditing(!editing)}>
            Editar
          </button>
          <button
            className="btn-outline px-3 py-1 text-sm text-brand-red border-brand-red/40"
            onClick={() => {
              if (confirm('Excluir cliente?')) deleteCustomer.mutate();
            }}
          >
            Excluir
          </button>
          <button className="btn-outline px-3 py-1 text-sm" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {/* Formulário de edição */}
      {editing && (
        <CustomerForm
          initial={{ name: customer.name, phone: customer.phone ?? '', notes: customer.notes ?? '' }}
          onSave={(data) => updateCustomer.mutateAsync(data)}
          onCancel={() => setEditing(false)}
        />
      )}

      {customer.notes && !editing && (
        <p className="rounded-lg bg-brand-cream-dark px-3 py-2 text-sm text-brand-ink/70">
          {customer.notes}
        </p>
      )}

      {/* Endereços */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="section-title">Endereços</h3>
          <button
            className="btn-outline px-3 py-1 text-sm"
            onClick={() => { setAddingAddress(true); setEditingAddressId(null); }}
          >
            + Adicionar
          </button>
        </div>

        {showAddressForm && (
          <div className="mt-2">
            <AddressForm
              onSave={(data) => addAddress.mutateAsync(data)}
              onCancel={() => setAddingAddress(false)}
            />
          </div>
        )}

        <ul className="mt-2 space-y-2">
          {customer.addresses.map((addr) => (
            <li key={addr.id} className="rounded-lg border border-brand-cream-dark p-3">
              {editingAddressId === addr.id ? (
                <AddressForm
                  initial={{
                    label: addr.label ?? '',
                    street: addr.street,
                    number: addr.number ?? '',
                    complement: addr.complement ?? '',
                    neighborhood: addr.neighborhood ?? '',
                    neighborhoodId: addr.neighborhoodId ?? '',
                    reference: addr.reference ?? '',
                    isDefault: addr.isDefault,
                  }}
                  onSave={(data) => updateAddress.mutateAsync({ id: addr.id, payload: data })}
                  onCancel={() => setEditingAddressId(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {(addr.label || addr.isDefault) && (
                      <p className="mb-0.5 text-xs font-semibold text-brand-ink/50 uppercase tracking-wide">
                        {addr.label ?? ''}
                        {addr.isDefault && (
                          <span className="ml-2 rounded-full bg-brand-gold/20 px-2 py-0.5 text-brand-ink">
                            padrão
                          </span>
                        )}
                      </p>
                    )}
                    <p className="text-sm">{formatAddress(addr)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="text-xs text-brand-ink/40 hover:text-brand-ink"
                      onClick={() => setEditingAddressId(addr.id)}
                    >
                      Editar
                    </button>
                    <span className="text-brand-ink/20">·</span>
                    <button
                      className="text-xs text-brand-red/60 hover:text-brand-red"
                      onClick={() => deleteAddress.mutate(addr.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Últimos pedidos */}
      {customer.orders.length > 0 && (
        <div>
          <h3 className="section-title">Últimos pedidos</h3>
          <ul className="mt-2 divide-y divide-brand-cream-dark">
            {customer.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-semibold">#{o.dailyNumber}</span>
                  <span className="ml-2 text-brand-ink/50">{CHANNEL_LABEL[o.channel]}</span>
                  <span className="ml-2 text-brand-ink/50">
                    {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <span className="font-semibold text-brand-red">{formatBRL(o.totalCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Página principal ----

export default function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', search],
    queryFn: () => api.listCustomers(search || undefined),
  });

  async function handleCreate(customerData: CreateCustomerPayload, address?: CreateAddressPayload) {
    const c = await api.createCustomer(customerData);
    if (address) await api.addCustomerAddress(c.id, address);
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['customer', c.id] });
    setCreating(false);
    setSelectedId(c.id);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="page-title">Clientes</h1>

      <div className="mt-4 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Lista */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="input flex-1 p-2 text-sm"
              placeholder="Buscar por nome ou telefone…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }}
            />
            <button
              className="btn-primary px-3 py-2 text-sm"
              onClick={() => { setCreating(true); setSelectedId(null); }}
            >
              + Novo
            </button>
          </div>

          {creating && (
            <div className="card p-4">
              <h2 className="section-title mb-3">Novo cliente</h2>
              <NewCustomerForm
                onSave={handleCreate}
                onCancel={() => setCreating(false)}
              />
            </div>
          )}

          {isLoading && (
            <p className="text-sm text-brand-ink/40">Carregando…</p>
          )}

          {!isLoading && customers.length === 0 && (
            <p className="text-sm text-brand-ink/40">
              {search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
            </p>
          )}

          <ul className="space-y-1">
            {customers.map((c) => (
              <li key={c.id}>
                <button
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selectedId === c.id
                      ? 'border-brand-gold bg-brand-gold/10'
                      : 'border-brand-cream-dark bg-white hover:bg-brand-cream'
                  }`}
                  onClick={() => { setSelectedId(c.id); setCreating(false); }}
                >
                  <p className="font-semibold leading-tight">{c.name}</p>
                  {c.phone && (
                    <p className="text-xs text-brand-ink/50">{c.phone}</p>
                  )}
                  {c.addresses.length > 0 && (
                    <p className="mt-0.5 text-xs text-brand-ink/40 truncate">
                      {formatAddress(c.addresses.find((a) => a.isDefault) ?? c.addresses[0])}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Painel de detalhe */}
        <div className="card p-5 min-h-[200px]">
          {selectedId ? (
            <CustomerPanel
              key={selectedId}
              customerId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <p className="text-sm text-brand-ink/40">Selecione um cliente para ver os detalhes.</p>
          )}
        </div>
      </div>
    </main>
  );
}
