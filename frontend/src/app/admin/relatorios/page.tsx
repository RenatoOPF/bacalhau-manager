'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatBRL, type ChannelReportItem } from '@/lib/api';

const CHANNEL_LABEL: Record<string, string> = {
  OWN: 'Cardápio próprio',
  IFOOD: 'iFood',
  NOVENTA_NOVE: '99Food',
  GAMI: 'Gami',
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function RelatoriosPage() {
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(0));

  const revenue = useQuery({
    queryKey: ['rep-revenue', from, to],
    queryFn: () => api.revenue(from, to),
  });
  const channels = useQuery({
    queryKey: ['rep-channels', from, to],
    queryFn: () => api.byChannel(from, to),
  });
  const topItems = useQuery({
    queryKey: ['rep-top', from, to],
    queryFn: () => api.topItems(from, to, 10),
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Relatórios</h1>

      {/* Período */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          De
          <input
            type="date"
            className="input ml-2 p-1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Até
          <input
            type="date"
            className="input ml-2 p-1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          onClick={() => api.downloadTransactionsCsv(from, to)}
          className="btn-outline px-3 py-1 text-sm text-brand-red"
        >
          Exportar CSV
        </button>
      </div>

      {/* Faturamento */}
      <section className="mt-6">
        <h2 className="section-title">Faturamento</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="card border-l-4 border-l-brand-gold p-4">
            <p className="text-sm text-brand-ink/60">Total no período</p>
            <p className="font-display text-2xl font-bold text-brand-red">
              {formatBRL(revenue.data?.totalCents ?? 0)}
            </p>
            <p className="text-sm text-brand-ink/60">
              {revenue.data?.count ?? 0} pedido(s)
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[400px] text-sm">
          <thead>
            <tr className="border-b-2 border-brand-gold/60 text-left text-brand-ink/60">
              <th className="py-2">Dia</th>
              <th className="text-right">Pedidos</th>
              <th className="text-right">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {(revenue.data?.byDay ?? []).map((d) => (
              <tr key={d.date} className="border-b border-brand-cream-dark">
                <td className="py-2">{d.date}</td>
                <td className="text-right">{d.count}</td>
                <td className="text-right">{formatBRL(d.totalCents)}</td>
              </tr>
            ))}
            {(revenue.data?.byDay ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-brand-ink/40">
                  Sem vendas no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>

      {/* Por canal */}
      <section className="mt-8">
        <h2 className="section-title">Por canal</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {(channels.data ?? []).map((c) => (
            <div key={c.channel} className="card p-4">
              <p className="text-sm text-brand-ink/60">
                {CHANNEL_LABEL[c.channel] ?? c.channel}
              </p>
              <p className="font-display text-xl font-bold">
                {formatBRL(c.totalCents)}
              </p>
              <p className="text-sm text-brand-ink/60">{c.count} pedido(s)</p>
            </div>
          ))}
          {(channels.data ?? []).length === 0 && (
            <p className="text-sm text-brand-ink/40">Sem dados no período.</p>
          )}
        </div>
      </section>

      {/* DRE — Receita */}
      <DreReceita channels={channels.data ?? []} />

      {/* Mais vendidos */}
      <section className="mt-8">
        <h2 className="section-title">Itens mais vendidos</h2>
        <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[400px] text-sm">
          <thead>
            <tr className="border-b-2 border-brand-gold/60 text-left text-brand-ink/60">
              <th className="py-2">Item</th>
              <th className="text-right">Qtd</th>
              <th className="text-right">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {(topItems.data ?? []).map((it) => (
              <tr key={it.name} className="border-b border-brand-cream-dark">
                <td className="py-2">{it.name}</td>
                <td className="text-right">{it.quantity}</td>
                <td className="text-right">{formatBRL(it.totalCents)}</td>
              </tr>
            ))}
            {(topItems.data ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-brand-ink/40">
                  Sem vendas no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}

// Comissão padrão por canal (%). A do marketplace é acertada no repasse (não
// vem no ticket), então é estimada e ajustável para bater com o contrato.
const DEFAULT_RATES: Record<string, number> = {
  OWN: 0,
  IFOOD: 23,
  NOVENTA_NOVE: 20,
  GAMI: 0,
};

/**
 * DRE simplificado (só receita): Receita Bruta por canal → (-) comissões do
 * marketplace (estimadas por %) → Receita Líquida. Reaproveita o faturamento
 * por canal; as taxas ficam salvas no navegador.
 */
function DreReceita({ channels }: { channels: ChannelReportItem[] }) {
  const [rates, setRates] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dre-commissions');
      if (saved) {
        try {
          return { ...DEFAULT_RATES, ...JSON.parse(saved) };
        } catch {
          /* ignora */
        }
      }
    }
    return DEFAULT_RATES;
  });

  const setRate = (channel: string, value: number) => {
    const next = { ...rates, [channel]: Number.isFinite(value) ? value : 0 };
    setRates(next);
    localStorage.setItem('dre-commissions', JSON.stringify(next));
  };

  const rows = channels.map((c) => {
    const rate = rates[c.channel] ?? 0;
    const fee = Math.round((c.totalCents * rate) / 100);
    return { channel: c.channel, gross: c.totalCents, rate, fee };
  });
  const grossTotal = rows.reduce((s, r) => s + r.gross, 0);
  const feeTotal = rows.reduce((s, r) => s + r.fee, 0);
  const netTotal = grossTotal - feeTotal;
  const feeRows = rows.filter((r) => r.gross > 0 && r.rate > 0);

  return (
    <section className="mt-8">
      <h2 className="section-title">DRE — Receita</h2>
      <p className="text-sm text-brand-ink/60">
        A comissão do marketplace é estimada por canal — ajuste o % para bater
        com o seu contrato.
      </p>

      <div className="card mt-2 space-y-1 p-4">
        <Line label="Receita Bruta" value={formatBRL(grossTotal)} bold />
        {rows.map((r) => (
          <Line
            key={r.channel}
            indent
            label={CHANNEL_LABEL[r.channel] ?? r.channel}
            value={formatBRL(r.gross)}
          />
        ))}

        <div className="pt-2" />
        <Line
          label="(-) Comissões marketplace"
          value={`- ${formatBRL(feeTotal)}`}
          bold
          danger
        />
        {feeRows.map((r) => (
          <div
            key={r.channel}
            className="flex items-center justify-between pl-4 text-sm text-brand-ink/70"
          >
            <span className="flex items-center gap-1">
              {CHANNEL_LABEL[r.channel] ?? r.channel}
              <input
                type="number"
                min={0}
                max={100}
                className="input w-14 p-0.5 text-right"
                value={r.rate}
                onChange={(e) => setRate(r.channel, Number(e.target.value))}
              />
              %
            </span>
            <span>- {formatBRL(r.fee)}</span>
          </div>
        ))}
        {feeRows.length === 0 && (
          <p className="pl-4 text-sm text-brand-ink/40">
            Sem vendas de marketplace no período.
          </p>
        )}

        <div className="mt-2 border-t-2 border-brand-gold/60 pt-2">
          <Line
            label="= Receita Líquida"
            value={formatBRL(netTotal)}
            bold
            big
          />
        </div>
      </div>
    </section>
  );
}

function Line({
  label,
  value,
  bold,
  danger,
  big,
  indent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  danger?: boolean;
  big?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={[
        'flex items-center justify-between',
        indent ? 'pl-4 text-sm text-brand-ink/70' : '',
        bold ? 'font-semibold' : '',
        danger ? 'text-brand-red' : '',
        big ? 'text-lg font-bold' : '',
      ].join(' ')}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
