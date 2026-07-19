'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { api, formatBRL, type PaymentMethod } from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  ONLINE: 'Online (app)',
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

  const closeCash = useMutation({
    mutationFn: () => api.closeCash(),
    onSuccess: () => {
      refreshAll();
      alert('Caixa fechado. A numeração dos pedidos foi zerada (próximo = #1).');
    },
    onError: () => {
      alert('Não foi possível fechar o caixa. Tente novamente.');
    },
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="page-title">Caixa</h1>

      {/* Pendentes de pagamento */}
      <section className="mt-6">
        <h2 className="section-title">
          Pendentes de pagamento ({pending?.length ?? 0})
        </h2>
        <div className="mt-2 space-y-2">
          {(pending ?? []).map((o) => (
            <div
              key={o.id}
              className="card flex flex-wrap items-center gap-3 p-3"
            >
              <span className="font-mono font-bold">#{o.dailyNumber}</span>
              <span className="flex-1">{o.customerName}</span>
              <span className="text-sm text-brand-ink/60">
                escolheu: {METHOD_LABEL[o.paymentMethod]}
              </span>
              <span className="font-semibold">{formatBRL(o.totalCents)}</span>
              <button
                className="btn-success px-3 py-1 text-sm"
                disabled={pay.isPending}
                onClick={() => pay.mutate({ id: o.id, method: 'CASH' })}
              >
                Recebi em dinheiro
              </button>
              <button
                className="btn-gold px-3 py-1 text-sm"
                disabled={pay.isPending}
                onClick={() => pay.mutate({ id: o.id, method: 'PIX' })}
              >
                Recebi em PIX
              </button>
            </div>
          ))}
          {(pending ?? []).length === 0 && (
            <p className="text-sm text-brand-ink/40">
              Nenhum pagamento pendente. 🎉
            </p>
          )}
        </div>
      </section>

      {/* Fechamento do dia */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="section-title">Fechamento do dia</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="input p-1 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button
              className="btn-danger px-3 py-1 text-sm"
              disabled={closeCash.isPending}
              onClick={() => {
                if (
                  confirm(
                    'Fechar o caixa agora e zerar a numeração dos pedidos? O próximo pedido volta a ser #1. (O caixa também fecha sozinho na virada do dia.)',
                  )
                ) {
                  closeCash.mutate();
                }
              }}
            >
              Fechar caixa
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-brand-ink/40">
          A numeração reinicia sozinha a cada dia. Use “Fechar caixa” só para
          zerar antes do fim do dia.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="card border-l-4 border-l-brand-gold p-4">
            <p className="text-sm text-brand-ink/60">Total recebido</p>
            <p className="font-display text-2xl font-bold text-brand-red">
              {formatBRL(summary?.totalCents ?? 0)}
            </p>
            <p className="text-sm text-brand-ink/60">
              {summary?.count ?? 0} pedido(s)
            </p>
          </div>
          {(['CASH', 'PIX', 'ONLINE'] as const).map((m) => (
            <div key={m} className="card p-4">
              <p className="text-sm text-brand-ink/60">{METHOD_LABEL[m]}</p>
              <p className="font-display text-2xl font-bold">
                {formatBRL(summary?.byMethod?.[m]?.totalCents ?? 0)}
              </p>
              <p className="text-sm text-brand-ink/60">
                {summary?.byMethod?.[m]?.count ?? 0} pedido(s)
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Transações do dia */}
      <section className="mt-8">
        <h2 className="section-title">Transações do dia</h2>
        <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b-2 border-brand-gold/60 text-left text-brand-ink/60">
              <th className="py-2">Pedido</th>
              <th>Cliente</th>
              <th>Pagamento</th>
              <th className="text-right">Valor</th>
              <th className="text-right">Hora</th>
            </tr>
          </thead>
          <tbody>
            {(transactions ?? []).map((t) => (
              <tr key={t.id} className="border-b border-brand-cream-dark">
                <td className="py-2 font-mono">#{t.dailyNumber}</td>
                <td>{t.customerName}</td>
                <td>{METHOD_LABEL[t.paymentMethod]}</td>
                <td className="text-right">{formatBRL(t.totalCents)}</td>
                <td className="text-right text-brand-ink/60">
                  {new Date(t.paidAt).toLocaleTimeString('pt-BR')}
                </td>
              </tr>
            ))}
            {(transactions ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-brand-ink/40">
                  Nenhuma transação nesse dia.
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
