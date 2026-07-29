'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  type MarginRow,
  type OrderChannel,
} from '@/lib/api';
import { BarChart, Heatmap, LineChart } from '@/components/charts';

const CHANNEL_LABEL: Record<string, string> = {
  OWN: 'Cardápio próprio',
  IFOOD: 'iFood',
  NOVENTA_NOVE: '99Food',
  GAMI: 'Gami',
};

/* ----------------------------- Date helpers ----------------------------- */

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoStartOfWeek(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun,1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function monthRange(offset: number): { from: string; to: string } {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + offset; // may be negative or > 11, Date handles it
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  };
}

function shiftYear(iso: string, years: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function monthLabel(offset: number): string {
  const d = new Date();
  const month = d.getMonth() + offset;
  const target = new Date(d.getFullYear(), month, 1);
  return target.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function fmtPct(n: number | null): string {
  if (n === null) return '—';
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

/* --------------------------------- Types -------------------------------- */

type Tab = 'vendas' | 'produtos' | 'financeiro';
type Preset = 'today' | 'week' | 'month' | 'custom';

/* ============================= Page ===================================== */

export default function RelatoriosPage() {
  const [preset, setPreset] = useState<Preset>('week');
  const [monthOffset, setMonthOffset] = useState(0);
  const [customFrom, setCustomFrom] = useState(isoDaysAgo(7));
  const [customTo, setCustomTo] = useState(isoToday());
  const [compareYoY, setCompareYoY] = useState(false);
  const [tab, setTab] = useState<Tab>('vendas');

  const { from, to } = useMemo<{ from: string; to: string }>(() => {
    if (preset === 'today') return { from: isoToday(), to: isoToday() };
    if (preset === 'week') return { from: isoStartOfWeek(), to: isoToday() };
    if (preset === 'month') return monthRange(monthOffset);
    return { from: customFrom, to: customTo };
  }, [preset, monthOffset, customFrom, customTo]);

  const fromPrev = compareYoY ? shiftYear(from, -1) : undefined;
  const toPrev = compareYoY ? shiftYear(to, -1) : undefined;

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Hoje' },
    { key: 'week', label: 'Esta semana' },
    { key: 'month', label: 'Este mês' },
    { key: 'custom', label: 'Personalizado' },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Relatórios</h1>

      {/* Presets rápidos */}
      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className={
              preset === key
                ? 'rounded-full bg-brand-red px-4 py-1.5 text-sm font-bold text-white'
                : 'rounded-full border border-brand-ink/20 px-4 py-1.5 text-sm font-medium text-brand-ink/70 hover:border-brand-red/40 hover:text-brand-red'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Navegação de mês */}
      {preset === 'month' && (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => setMonthOffset((o) => o - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-ink/20 text-sm hover:bg-brand-cream-dark"
          >
            ‹
          </button>
          <span className="min-w-[140px] text-center text-sm font-semibold capitalize text-brand-ink">
            {monthLabel(monthOffset)}
          </span>
          <button
            onClick={() => setMonthOffset((o) => Math.min(o + 1, 0))}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-ink/20 text-sm hover:bg-brand-cream-dark disabled:opacity-30"
            disabled={monthOffset >= 0}
          >
            ›
          </button>
        </div>
      )}

      {/* Período personalizado */}
      {preset === 'custom' && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            De
            <input
              type="date"
              className="input ml-2 p-1"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Até
            <input
              type="date"
              className="input ml-2 p-1"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
        </div>
      )}

      {/* Período exibido + comparação */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-ink/50">
          {from === to ? from : `${from} → ${to}`}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-ink/70">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-red"
              checked={compareYoY}
              onChange={(e) => setCompareYoY(e.target.checked)}
            />
            Comparar com {new Date().getFullYear() - 1}
          </label>
          <button
            onClick={() => api.downloadTransactionsCsv(from, to)}
            className="btn-outline px-3 py-1 text-sm text-brand-red"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Abas */}
      <nav className="mt-5 flex gap-1 border-b border-brand-cream-dark text-sm">
        {(
          [
            ['vendas', 'Vendas'],
            ['produtos', 'Produtos'],
            ['financeiro', 'Financeiro'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'border-b-2 border-brand-red px-3 py-2 font-bold text-brand-red'
                : 'px-3 py-2 font-medium text-brand-ink/50 hover:text-brand-ink'
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'vendas' && (
        <VendasTab from={from} to={to} fromPrev={fromPrev} toPrev={toPrev} />
      )}
      {tab === 'produtos' && <ProdutosTab from={from} to={to} />}
      {tab === 'financeiro' && (
        <FinanceiroTab from={from} to={to} fromPrev={fromPrev} toPrev={toPrev} />
      )}
    </main>
  );
}

/* ------------------------------- Vendas -------------------------------- */

function VendasTab({
  from,
  to,
  fromPrev,
  toPrev,
}: {
  from: string;
  to: string;
  fromPrev?: string;
  toPrev?: string;
}) {
  const summary = useQuery({
    queryKey: ['rep-summary', from, to],
    queryFn: () => api.salesSummary(from, to),
  });
  const revenue = useQuery({
    queryKey: ['rep-revenue', from, to],
    queryFn: () => api.revenue(from, to),
  });
  const channels = useQuery({
    queryKey: ['rep-channels', from, to],
    queryFn: () => api.byChannel(from, to),
  });
  const peak = useQuery({
    queryKey: ['rep-peak', from, to],
    queryFn: () => api.peakHours(from, to),
  });
  const cancel = useQuery({
    queryKey: ['rep-cancel', from, to],
    queryFn: () => api.cancellations(from, to),
  });

  // Dados do ano anterior (opcionais)
  const summaryPrev = useQuery({
    queryKey: ['rep-summary', fromPrev, toPrev],
    queryFn: () => api.salesSummary(fromPrev!, toPrev!),
    enabled: !!fromPrev && !!toPrev,
  });
  const revenuePrev = useQuery({
    queryKey: ['rep-revenue', fromPrev, toPrev],
    queryFn: () => api.revenue(fromPrev!, toPrev!),
    enabled: !!fromPrev && !!toPrev,
  });

  const s = summary.data;
  const sp = summaryPrev.data;
  const comparing = !!fromPrev;

  return (
    <div className="mt-6 space-y-8">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Faturamento"
          value={formatBRL(s?.totalCents ?? 0)}
          prev={comparing ? formatBRL(sp?.totalCents ?? 0) : undefined}
          sub={
            !comparing && s?.deltaPct != null
              ? `${fmtPct(s.deltaPct)} vs. período anterior`
              : comparing
                ? yoyPct(s?.totalCents, sp?.totalCents)
                : `${s?.count ?? 0} pedido(s)`
          }
          positive={
            comparing
              ? yoyPositive(s?.totalCents, sp?.totalCents)
              : s?.deltaPct != null
                ? s.deltaPct >= 0
                : undefined
          }
        />
        <Kpi
          label="Pedidos"
          value={String(s?.count ?? 0)}
          prev={comparing ? String(sp?.count ?? 0) : undefined}
          sub={comparing ? yoyPct(s?.count, sp?.count) : undefined}
          positive={comparing ? yoyPositive(s?.count, sp?.count) : undefined}
        />
        <Kpi
          label="Ticket médio"
          value={formatBRL(s?.avgTicketCents ?? 0)}
          prev={comparing ? formatBRL(sp?.avgTicketCents ?? 0) : undefined}
          sub={comparing ? yoyPct(s?.avgTicketCents, sp?.avgTicketCents) : undefined}
          positive={comparing ? yoyPositive(s?.avgTicketCents, sp?.avgTicketCents) : undefined}
        />
      </div>

      {/* Tendência */}
      <section>
        <h2 className="section-title">Tendência de faturamento</h2>
        <div className="card mt-2 p-3">
          <LineChart
            points={(revenue.data?.byDay ?? []).map((d) => ({
              label: d.date.slice(5),
              value: d.totalCents,
            }))}
            compare={
              comparing
                ? (revenuePrev.data?.byDay ?? []).map((d) => ({
                    value: d.totalCents,
                  }))
                : undefined
            }
            formatY={(v) => formatBRL(v)}
          />
        </div>
        {comparing && (
          <div className="mt-1 flex gap-4 text-xs text-brand-ink/50">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-brand-red" />
              Período atual
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-brand-gold" />
              Ano anterior
            </span>
          </div>
        )}
      </section>

      {/* Por canal */}
      <section>
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

      {/* Horários de pico */}
      <section>
        <h2 className="section-title">Horários de pico</h2>
        <p className="text-sm text-brand-ink/60">
          Nº de pedidos por dia da semana × hora.
        </p>
        <div className="card mt-2 p-3">
          <Heatmap
            cells={(peak.data ?? []).map((p) => ({
              weekday: p.weekday,
              hour: p.hour,
              value: p.count,
            }))}
          />
        </div>
      </section>

      {/* Cancelamentos */}
      <section>
        <h2 className="section-title">Cancelamentos</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Kpi
            label="Taxa de cancelamento"
            value={`${(cancel.data?.ratePct ?? 0).toFixed(1)}%`}
            sub={`${cancel.data?.canceled ?? 0} de ${cancel.data?.total ?? 0}`}
          />
          <Kpi
            label="Valor perdido"
            value={formatBRL(cancel.data?.lostCents ?? 0)}
          />
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ Produtos ------------------------------- */

function ProdutosTab({ from, to }: { from: string; to: string }) {
  const products = useQuery({
    queryKey: ['rep-products', from, to],
    queryFn: () => api.products(from, to),
  });
  const basket = useQuery({
    queryKey: ['rep-basket', from, to],
    queryFn: () => api.basket(from, to, 10),
  });
  const margins = useQuery({
    queryKey: ['rep-margins', from, to],
    queryFn: () => api.margins(from, to),
  });

  const rows = products.data ?? [];
  const grandTotal = rows.reduce((s, r) => s + r.totalCents, 0);
  const leastSold = [...rows].sort((a, b) => a.quantity - b.quantity).slice(0, 8);

  const classColor = (cls: 'A' | 'B' | 'C') =>
    cls === 'A' ? '#1F7A3F' : cls === 'B' ? '#F2B705' : '#D9251D';

  return (
    <div className="mt-6 space-y-8">
      {/* Curva ABC */}
      <section>
        <h2 className="section-title">Curva ABC</h2>
        <p className="text-sm text-brand-ink/60">
          Classe A = 80% do faturamento; B = próximos 15%; C = últimos 5%.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b-2 border-brand-gold/60 text-left text-brand-ink/60">
                <th className="py-2">Item</th>
                <th className="text-right">Qtd</th>
                <th className="text-right">Faturamento</th>
                <th className="text-right">% do total</th>
                <th className="text-center">Classe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-brand-cream-dark">
                  <td className="py-2">{r.name}</td>
                  <td className="text-right">{r.quantity}</td>
                  <td className="text-right">{formatBRL(r.totalCents)}</td>
                  <td className="text-right tabular-nums text-brand-ink/60">
                    {grandTotal > 0
                      ? ((r.totalCents / grandTotal) * 100).toFixed(1)
                      : '0.0'}
                    %
                  </td>
                  <td className="text-center">
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: classColor(r.class) }}
                    >
                      {r.class}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-brand-ink/40">
                    Sem vendas no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Margem de contribuição */}
      <MarginsSection margins={margins.data ?? []} />

      {/* Comprados juntos */}
      <section>
        <h2 className="section-title">Comprados juntos</h2>
        <p className="text-sm text-brand-ink/60">
          Pares que mais aparecem no mesmo pedido — ideia para combos.
        </p>
        <div className="card mt-2 divide-y divide-brand-cream-dark p-3">
          {(basket.data ?? []).map((p) => (
            <div
              key={`${p.a}|${p.b}`}
              className="flex items-center justify-between py-1.5 text-sm"
            >
              <span>
                {p.a} <span className="text-brand-ink/40">+</span> {p.b}
              </span>
              <span className="font-semibold text-brand-red">
                {p.count}×
              </span>
            </div>
          ))}
          {(basket.data ?? []).length === 0 && (
            <p className="py-2 text-sm text-brand-ink/40">
              Ainda não há pares recorrentes no período.
            </p>
          )}
        </div>
      </section>

      {/* Menos vendidos */}
      <section>
        <h2 className="section-title">Menos vendidos</h2>
        <div className="card mt-2 p-3">
          <BarChart
            bars={leastSold.map((r) => ({
              label: r.name,
              value: r.quantity,
              hint: 'un',
            }))}
          />
        </div>
      </section>
    </div>
  );
}

function MarginsSection({ margins }: { margins: MarginRow[] }) {
  const missing = margins.filter((m) => !m.hasCost).length;
  return (
    <section>
      <h2 className="section-title">Margem de contribuição</h2>
      <p className="text-sm text-brand-ink/60">
        Preço − custo dos ingredientes (por unidade). Custo vem do cadastro de
        estoque.
        {missing > 0 && (
          <span className="text-brand-red">
            {' '}
            {missing} item(ns) sem custo cadastrado.
          </span>
        )}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b-2 border-brand-gold/60 text-left text-brand-ink/60">
              <th className="py-2">Item</th>
              <th className="text-right">Preço</th>
              <th className="text-right">Custo</th>
              <th className="text-right">Margem</th>
              <th className="text-right">%</th>
              <th className="text-right">Contrib. total</th>
            </tr>
          </thead>
          <tbody>
            {margins.map((m) => (
              <tr
                key={`${m.name}|${m.optionName ?? ''}`}
                className="border-b border-brand-cream-dark"
              >
                <td className="py-2">
                  {m.name}
                  {m.optionName && (
                    <span className="text-brand-ink/40"> · {m.optionName}</span>
                  )}
                </td>
                <td className="text-right">{formatBRL(m.unitPriceCents)}</td>
                <td className="text-right text-brand-ink/60">
                  {m.hasCost ? formatBRL(m.unitCostCents) : '—'}
                </td>
                <td className="text-right">{formatBRL(m.marginCents)}</td>
                <td className="text-right tabular-nums">
                  {m.marginPct.toFixed(0)}%
                </td>
                <td className="text-right font-semibold">
                  {formatBRL(m.contributionCents)}
                </td>
              </tr>
            ))}
            {margins.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-brand-ink/40">
                  Sem vendas no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ----------------------------- Financeiro ------------------------------ */

function FinanceiroTab({
  from,
  to,
  fromPrev,
  toPrev,
}: {
  from: string;
  to: string;
  fromPrev?: string;
  toPrev?: string;
}) {
  const dre = useQuery({
    queryKey: ['rep-dre', from, to],
    queryFn: () => api.dre(from, to),
  });
  const cashflow = useQuery({
    queryKey: ['rep-cashflow', from, to],
    queryFn: () => api.cashflow(from, to),
  });
  const drePrev = useQuery({
    queryKey: ['rep-dre', fromPrev, toPrev],
    queryFn: () => api.dre(fromPrev!, toPrev!),
    enabled: !!fromPrev && !!toPrev,
  });

  const d = dre.data;
  const dp = drePrev.data;
  const comparing = !!fromPrev;

  return (
    <div className="mt-6 space-y-8">
      {/* DRE */}
      <section>
        <h2 className="section-title">
          DRE
          {comparing && (
            <span className="ml-2 text-sm font-normal text-brand-ink/50">
              (atual × ano anterior)
            </span>
          )}
        </h2>
        <div className="card mt-2 space-y-1 p-4">
          <DreLine
            label="Receita Bruta"
            value={formatBRL(d?.grossCents ?? 0)}
            prev={comparing ? formatBRL(dp?.grossCents ?? 0) : undefined}
            bold
          />
          {(d?.grossByChannel ?? []).map((c) => (
            <DreLine
              key={c.channel}
              indent
              label={CHANNEL_LABEL[c.channel] ?? c.channel}
              value={formatBRL(c.grossCents)}
            />
          ))}

          <div className="pt-2" />
          <DreLine
            label="(−) Comissões marketplace"
            value={`- ${formatBRL(d?.commissionCents ?? 0)}`}
            prev={comparing ? `- ${formatBRL(dp?.commissionCents ?? 0)}` : undefined}
            bold
            danger
          />
          <DreLine
            label="(−) CMV (ingredientes)"
            value={`- ${formatBRL(d?.cmvCents ?? 0)}`}
            prev={comparing ? `- ${formatBRL(dp?.cmvCents ?? 0)}` : undefined}
            bold
            danger
          />
          <DreLine
            label="(−) Entregadores"
            value={`- ${formatBRL(d?.courierCents ?? 0)}`}
            prev={comparing ? `- ${formatBRL(dp?.courierCents ?? 0)}` : undefined}
            bold
            danger
          />
          <DreLine
            label="(−) Despesas"
            value={`- ${formatBRL(d?.expensesCents ?? 0)}`}
            prev={comparing ? `- ${formatBRL(dp?.expensesCents ?? 0)}` : undefined}
            bold
            danger
          />
          {(d?.expensesByCategory ?? []).map((e) => (
            <DreLine
              key={e.categoryId ?? 'none'}
              indent
              label={e.name}
              value={`- ${formatBRL(e.amountCents)}`}
            />
          ))}

          <div className="mt-2 border-t-2 border-brand-gold/60 pt-2">
            <DreLine
              label="= Lucro Líquido"
              value={formatBRL(d?.netCents ?? 0)}
              prev={comparing ? formatBRL(dp?.netCents ?? 0) : undefined}
              bold
              big
              danger={(d?.netCents ?? 0) < 0}
            />
          </div>

          {comparing && (
            <div className="mt-3 flex gap-4 border-t border-brand-cream-dark pt-2 text-xs text-brand-ink/50">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded bg-brand-red" />
                Atual
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded bg-brand-ink/20" />
                Ano anterior
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Config de comissão */}
      <CommissionConfig />

      {/* Fluxo de caixa */}
      <section>
        <h2 className="section-title">Fluxo de caixa</h2>
        <div className="card mt-2 p-3">
          <LineChart
            points={(cashflow.data ?? []).map((c) => ({
              label: c.date.slice(5),
              value: c.balanceCents,
            }))}
            formatY={(v) => formatBRL(v)}
          />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b-2 border-brand-gold/60 text-left text-brand-ink/60">
                <th className="py-2">Dia</th>
                <th className="text-right">Entradas</th>
                <th className="text-right">Saídas</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {(cashflow.data ?? []).map((c) => (
                <tr key={c.date} className="border-b border-brand-cream-dark">
                  <td className="py-2">{c.date}</td>
                  <td className="text-right text-brand-green">
                    {formatBRL(c.inCents)}
                  </td>
                  <td className="text-right text-brand-red">
                    {c.outCents > 0 ? `- ${formatBRL(c.outCents)}` : '—'}
                  </td>
                  <td className="text-right font-semibold">
                    {formatBRL(c.balanceCents)}
                  </td>
                </tr>
              ))}
              {(cashflow.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-brand-ink/40">
                    Sem movimentos no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CommissionConfig() {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ['channel-config'],
    queryFn: () => api.channelConfig(),
  });
  const save = useMutation({
    mutationFn: ({
      channel,
      commissionBps,
    }: {
      channel: OrderChannel;
      commissionBps: number;
    }) => api.setChannelCommission(channel, commissionBps),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-config'] });
      qc.invalidateQueries({ queryKey: ['rep-dre'] });
    },
  });

  return (
    <section>
      <h2 className="section-title">Comissão por canal</h2>
      <p className="text-sm text-brand-ink/60">
        Percentual usado no DRE. Ajuste para bater com o seu contrato.
      </p>
      <div className="card mt-2 space-y-2 p-4">
        {(config.data ?? []).map((c) => (
          <div
            key={c.channel}
            className="flex items-center justify-between text-sm"
          >
            <span>{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                defaultValue={c.commissionBps / 100}
                className="input w-16 p-0.5 text-right"
                onBlur={(e) => {
                  const pct = Number(e.target.value);
                  if (Number.isFinite(pct)) {
                    save.mutate({
                      channel: c.channel,
                      commissionBps: Math.round(pct * 100),
                    });
                  }
                }}
              />
              %
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Compartilhado -------------------------- */

function yoyPct(curr?: number, prev?: number): string {
  if (curr == null || prev == null || prev === 0) return '—';
  const pct = ((curr - prev) / prev) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs. ${new Date().getFullYear() - 1}`;
}

function yoyPositive(curr?: number, prev?: number): boolean | undefined {
  if (curr == null || prev == null || prev === 0) return undefined;
  return curr >= prev;
}

function Kpi({
  label,
  value,
  prev,
  sub,
  positive,
}: {
  label: string;
  value: string;
  prev?: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="card border-l-4 border-l-brand-gold p-4">
      <p className="text-sm text-brand-ink/60">{label}</p>
      <p className="font-display text-2xl font-bold text-brand-red">{value}</p>
      {prev !== undefined && (
        <p className="text-sm text-brand-ink/40">{prev} (ano ant.)</p>
      )}
      {sub && (
        <p
          className={
            positive === undefined
              ? 'text-sm text-brand-ink/60'
              : positive
                ? 'text-sm font-medium text-brand-green'
                : 'text-sm font-medium text-brand-red'
          }
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function DreLine({
  label,
  value,
  prev,
  bold,
  danger,
  big,
  indent,
}: {
  label: string;
  value: string;
  prev?: string;
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
        big ? 'text-lg font-bold' : '',
      ].join(' ')}
    >
      <span className={danger ? 'text-brand-red' : ''}>{label}</span>
      <span className="flex items-center gap-3">
        {prev !== undefined && (
          <span className="text-sm text-brand-ink/40">{prev}</span>
        )}
        <span className={danger ? 'text-brand-red' : ''}>{value}</span>
      </span>
    </div>
  );
}
