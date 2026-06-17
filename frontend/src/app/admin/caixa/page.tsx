'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { api, formatBRL, type PaymentMethod } from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CaixaFinanceiroPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(today());

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['cash-pending'] });
    qc.invalidateQueries({ queryKey: ['cash-summary'] });
    qc.invalidateQueries({ queryKey: ['cash-transactions'] });
  };

  const { data: pending } = useQuery({
    queryKey: ['cash-pending'],
    queryFn: api.pendingPayments,
  });
  const { data: summary } = useQuery({
    queryKey: ['cash-summary', date],
    queryFn: () => api.dailySummary(date),
  });
  const { data: transactions } = useQuery({
    queryKey: ['cash-transactions', date],
    queryFn: () => api.transactions(date, date),
  });

  // Novos pedidos / mudanças de status afetam os pendentes e o fechamento.
  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket'] });
    socket.on('order:created', refreshAll);
    socket.on('order:status', refreshAll);
    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = useMutation({
    mutationFn: ({ id, method }: { id: string; method: PaymentMethod }) =>
      api.payOrder(id, method),
    onSuccess: refreshAll,
  });

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Caixa</h1>
        <nav className="flex gap-3 text-sm text-blue-600 underline">
          <a href="/admin">Fila</a>
          <a href="/admin/cardapio">Cardápio</a>
        </nav>
      </div>

      {/* Pendentes de pagamento */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">
          Pendentes de pagamento ({pending?.length ?? 0})
        </h2>
        <div className="mt-2 space-y-2">
          {(pending ?? []).map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3"
            >
              <span className="font-mono font-bold">#{o.protocol}</span>
              <span className="flex-1">{o.customerName}</span>
              <span className="text-sm text-gray-500">
                escolheu: {METHOD_LABEL[o.paymentMethod]}
              </span>
              <span className="font-semibold">{formatBRL(o.totalCents)}</span>
              <button
                className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                disabled={pay.isPending}
                onClick={() => pay.mutate({ id: o.id, method: 'CASH' })}
              >
                Recebi em dinheiro
              </button>
              <button
                className="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                disabled={pay.isPending}
                onClick={() => pay.mutate({ id: o.id, method: 'PIX' })}
              >
                Recebi em PIX
              </button>
            </div>
          ))}
          {(pending ?? []).length === 0 && (
            <p className="text-sm text-gray-400">
              Nenhum pagamento pendente. 🎉
            </p>
          )}
        </div>
      </section>

      {/* Fechamento do dia */}
      <section className="mt-8">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Fechamento do dia</h2>
          <input
            type="date"
            className="rounded border p-1 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm text-gray-500">Total recebido</p>
            <p className="text-2xl font-bold">
              {formatBRL(summary?.totalCents ?? 0)}
            </p>
            <p className="text-sm text-gray-500">
              {summary?.count ?? 0} pedido(s)
            </p>
          </div>
          {(['CASH', 'PIX'] as const).map((m) => (
            <div key={m} className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">{METHOD_LABEL[m]}</p>
              <p className="text-2xl font-bold">
                {formatBRL(summary?.byMethod?.[m]?.totalCents ?? 0)}
              </p>
              <p className="text-sm text-gray-500">
                {summary?.byMethod?.[m]?.count ?? 0} pedido(s)
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Transações do dia */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Transações do dia</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Pedido</th>
              <th>Cliente</th>
              <th>Pagamento</th>
              <th className="text-right">Valor</th>
              <th className="text-right">Hora</th>
            </tr>
          </thead>
          <tbody>
            {(transactions ?? []).map((t) => (
              <tr key={t.id} className="border-b">
                <td className="py-2 font-mono">#{t.protocol}</td>
                <td>{t.customerName}</td>
                <td>{METHOD_LABEL[t.paymentMethod]}</td>
                <td className="text-right">{formatBRL(t.totalCents)}</td>
                <td className="text-right text-gray-500">
                  {new Date(t.paidAt).toLocaleTimeString('pt-BR')}
                </td>
              </tr>
            ))}
            {(transactions ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-gray-400">
                  Nenhuma transação nesse dia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
