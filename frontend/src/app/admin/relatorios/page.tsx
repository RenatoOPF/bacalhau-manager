'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  formatBRL,
  type ExpenseCategory,
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

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  RENT: 'Aluguel',
  PAYROLL: 'Funcionários',
  PACKAGING: 'Embalagem',
  DELIVERY: 'Entrega/Motoboy',
  SUPPLIES: 'Fornecedores',
  TAXES: 'Impostos',
  OTHER: 'Outros',
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtPct(n: number | null): string {
  if (n === null) return '—';
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

type Tab = 'vendas' | 'produtos' | 'financeiro';

export default function RelatoriosPage() {
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [tab, setTab] = useState<Tab>('vendas');

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Relatórios</h1>

      {/* Período (compartilhado por todas as abas) */}
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

      {tab === 'vendas' && <VendasTab from={from} to={to} />}
      {tab === 'produtos' && <ProdutosTab from={from} to={to} />}
      {tab === 'financeiro' && <FinanceiroTab from={from} to={to} />}
    </main>
  );
}

/* ------------------------------- Vendas -------------------------------- */

function VendasTab({ from, to }: { from: string; to: string }) {
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

  const s = summary.data;

  return (
    <div className="mt-6 space-y-8">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Faturamento"
          value={formatBRL(s?.totalCents ?? 0)}
          sub={
            s?.deltaPct != null
              ? `${fmtPct(s.deltaPct)} vs. período anterior`
              : `${s?.count ?? 0} pedido(s)`
          }
          positive={s?.deltaPct != null ? s.deltaPct >= 0 : undefined}
        />
        <Kpi label="Pedidos" value={String(s?.count ?? 0)} />
        <Kpi
          label="Ticket médio"
          value={formatBRL(s?.avgTicketCents ?? 0)}
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
            formatY={(v) => formatBRL(v)}
          />
        </div>
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
                <th className="text-right">% acum.</th>
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
                    {r.cumulativePct.toFixed(1)}%
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

function FinanceiroTab({ from, to }: { from: string; to: string }) {
  const dre = useQuery({
    queryKey: ['rep-dre', from, to],
    queryFn: () => api.dre(from, to),
  });
  const cashflow = useQuery({
    queryKey: ['rep-cashflow', from, to],
    queryFn: () => api.cashflow(from, to),
  });

  const d = dre.data;

  return (
    <div className="mt-6 space-y-8">
      {/* DRE */}
      <section>
        <h2 className="section-title">DRE</h2>
        <div className="card mt-2 space-y-1 p-4">
          <Line label="Receita Bruta" value={formatBRL(d?.grossCents ?? 0)} bold />
          {(d?.grossByChannel ?? []).map((c) => (
            <Line
              key={c.channel}
              indent
              label={CHANNEL_LABEL[c.channel] ?? c.channel}
              value={formatBRL(c.grossCents)}
            />
          ))}

          <div className="pt-2" />
          <Line
            label="(−) Comissões marketplace"
            value={`- ${formatBRL(d?.commissionCents ?? 0)}`}
            bold
            danger
          />
          <Line
            label="(−) CMV (ingredientes)"
            value={`- ${formatBRL(d?.cmvCents ?? 0)}`}
            bold
            danger
          />
          <Line
            label="(−) Despesas"
            value={`- ${formatBRL(d?.expensesCents ?? 0)}`}
            bold
            danger
          />
          {(d?.expensesByCategory ?? []).map((e) => (
            <Line
              key={e.category}
              indent
              label={CATEGORY_LABEL[e.category] ?? e.category}
              value={`- ${formatBRL(e.amountCents)}`}
            />
          ))}

          <div className="mt-2 border-t-2 border-brand-gold/60 pt-2">
            <Line
              label="= Lucro Líquido"
              value={formatBRL(d?.netCents ?? 0)}
              bold
              big
              danger={(d?.netCents ?? 0) < 0}
            />
          </div>
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

function Kpi({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="card border-l-4 border-l-brand-gold p-4">
      <p className="text-sm text-brand-ink/60">{label}</p>
      <p className="font-display text-2xl font-bold text-brand-red">{value}</p>
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
