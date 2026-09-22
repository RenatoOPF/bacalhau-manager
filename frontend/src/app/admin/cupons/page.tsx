'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  type Coupon,
  type CouponType,
  type CreateCouponPayload,
} from '@/lib/api';

function getSiteUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.bacalhaueciamaceio.com.br';
}

function couponLabel(c: Coupon) {
  return c.type === 'PERCENT' ? `${c.value}% de desconto` : `${formatBRL(c.value)} de desconto`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="btn-outline px-2 py-1 text-xs">
      {copied ? 'Copiado!' : 'Copiar link'}
    </button>
  );
}

const EMPTY: CreateCouponPayload = {
  code: '',
  description: '',
  type: 'PERCENT',
  value: 10,
  minOrderCents: 0,
  maxUses: undefined,
  expiresAt: undefined,
};

export default function CuponsPage() {
  const qc = useQueryClient();
  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ['coupons'],
    queryFn: api.listCoupons,
  });

  const [form, setForm] = useState<CreateCouponPayload>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');

  const create = useMutation({
    mutationFn: api.createCoupon,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coupons'] });
      setForm(EMPTY);
      setShowForm(false);
      setFormError('');
    },
    onError: (e: any) => setFormError(e?.message ?? 'Erro ao criar cupom'),
  });

  const toggle = useMutation({
    mutationFn: api.toggleCoupon,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupons'] }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!code) return setFormError('Informe o código do cupom');
    if (form.value <= 0) return setFormError('Valor deve ser maior que zero');
    if (form.type === 'PERCENT' && form.value > 100) return setFormError('Percentual máximo: 100%');
    create.mutate({
      ...form,
      code,
      minOrderCents: form.minOrderCents || 0,
      maxUses: form.maxUses || undefined,
      expiresAt: form.expiresAt || undefined,
    });
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Cupons de desconto</h1>
        <button className="btn-primary px-4 py-2" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : '+ Novo cupom'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4 p-5">
          <h2 className="section-title">Novo cupom</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
                Código
              </label>
              <input
                className="input w-full p-2 uppercase"
                placeholder="EX: BEMVINDO10"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
              <p className="mt-0.5 text-xs text-brand-ink/40">Maiúsculas, sem espaços</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
                Descrição (opcional)
              </label>
              <input
                className="input w-full p-2"
                placeholder="Ex: Cupom de boas-vindas"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
                Tipo
              </label>
              <select
                className="input w-full p-2"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as CouponType })}
              >
                <option value="PERCENT">Porcentagem (%)</option>
                <option value="FIXED">Valor fixo (R$)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
                {form.type === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'}
              </label>
              <input
                className="input w-full p-2"
                type="number"
                min={1}
                max={form.type === 'PERCENT' ? 100 : undefined}
                step={form.type === 'PERCENT' ? 1 : 0.01}
                value={form.type === 'PERCENT' ? form.value : form.value / 100}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setForm({ ...form, value: form.type === 'PERCENT' ? v : Math.round(v * 100) });
                }}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
                Pedido mínimo (R$)
              </label>
              <input
                className="input w-full p-2"
                type="number"
                min={0}
                step={0.01}
                value={(form.minOrderCents ?? 0) / 100}
                onChange={(e) =>
                  setForm({ ...form, minOrderCents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
                Limite de usos
              </label>
              <input
                className="input w-full p-2"
                type="number"
                min={1}
                placeholder="Ilimitado"
                value={form.maxUses ?? ''}
                onChange={(e) =>
                  setForm({ ...form, maxUses: e.target.value ? parseInt(e.target.value) : undefined })
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
                Válido até
              </label>
              <input
                className="input w-full p-2"
                type="date"
                value={form.expiresAt ?? ''}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value || undefined })}
              />
            </div>
          </div>

          {formError && <p className="text-sm text-brand-red">{formError}</p>}

          <button type="submit" className="btn-primary px-5 py-2" disabled={create.isPending}>
            {create.isPending ? 'Criando...' : 'Criar cupom'}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-brand-ink/40">Carregando...</p>
      ) : coupons.length === 0 ? (
        <div className="card p-8 text-center text-brand-ink/40">
          Nenhum cupom criado ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((c) => {
            const link = `${getSiteUrl()}/?cupom=${c.code}`;
            return (
              <div
                key={c.id}
                className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${!c.active ? 'opacity-50' : ''}`}
              >
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-bold text-brand-red">{c.code}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-brand-ink">{couponLabel(c)}</p>
                  {c.description && <p className="text-xs text-brand-ink/60">{c.description}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-brand-ink/50">
                    {c.minOrderCents > 0 && <span>Mínimo: {formatBRL(c.minOrderCents)}</span>}
                    <span>
                      Usos: {c.usedCount}
                      {c.maxUses ? ` / ${c.maxUses}` : ' (ilimitado)'}
                    </span>
                    {c.expiresAt && (
                      <span>Expira: {new Date(c.expiresAt).toLocaleDateString('pt-BR')}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <CopyButton text={link} />
                  <button
                    className={`px-3 py-1 text-xs rounded-md border font-semibold transition-colors ${
                      c.active
                        ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        : 'border-green-300 text-green-700 hover:bg-green-50'
                    }`}
                    onClick={() => toggle.mutate(c.id)}
                    disabled={toggle.isPending}
                  >
                    {c.active ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
