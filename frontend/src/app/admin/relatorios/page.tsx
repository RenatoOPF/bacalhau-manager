'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatBRL } from '@/lib/api';

const CHANNEL_LABEL: Record<string, string> = {
  OWN: 'Cardápio próprio',
  IFOOD: 'iFood',
  GAMI: 'Gami / 99Food',
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
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Relatórios</h1>

      {/* Período */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          De
          <input
            type="date"
            className="ml-2 rounded border p-1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Até
          <input
            type="date"
            className="ml-2 rounded border p-1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          onClick={() => api.downloadTransactionsCsv(from, to)}
          className="rounded border px-3 py-1 text-sm text-blue-600"
        >
          Exportar CSV
        </button>
      </div>

      {/* Faturamento */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Faturamento</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm text-gray-500">Total no período</p>
            <p className="text-2xl font-bold">
              {formatBRL(revenue.data?.totalCents ?? 0)}
            </p>
            <p className="text-sm text-gray-500">
              {revenue.data?.count ?? 0} pedido(s)
            </p>
          </div>
        </div>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Dia</th>
              <th className="text-right">Pedidos</th>
              <th className="text-right">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {(revenue.data?.byDay ?? []).map((d) => (
              <tr key={d.date} className="border-b">
                <td className="py-2">{d.date}</td>
                <td className="text-right">{d.count}</td>
                <td className="text-right">{formatBRL(d.totalCents)}</td>
              </tr>
            ))}
            {(revenue.data?.byDay ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-gray-400">
                  Sem vendas no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Por canal */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Por canal</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {(channels.data ?? []).map((c) => (
            <div key={c.channel} className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">
                {CHANNEL_LABEL[c.channel] ?? c.channel}
              </p>
              <p className="text-xl font-bold">{formatBRL(c.totalCents)}</p>
              <p className="text-sm text-gray-500">{c.count} pedido(s)</p>
            </div>
          ))}
          {(channels.data ?? []).length === 0 && (
            <p className="text-sm text-gray-400">Sem dados no período.</p>
          )}
        </div>
      </section>

      {/* Mais vendidos */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Itens mais vendidos</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Item</th>
              <th className="text-right">Qtd</th>
              <th className="text-right">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {(topItems.data ?? []).map((it) => (
              <tr key={it.name} className="border-b">
                <td className="py-2">{it.name}</td>
                <td className="text-right">{it.quantity}</td>
                <td className="text-right">{formatBRL(it.totalCents)}</td>
              </tr>
            ))}
            {(topItems.data ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-gray-400">
                  Sem vendas no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
