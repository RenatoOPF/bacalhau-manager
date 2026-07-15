'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { api, type OrderStatus } from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

// Etapas exibidas ao cliente, na ordem do fluxo.
const STEPS: { status: OrderStatus; label: string; emoji: string }[] = [
  { status: 'RECEIVED', label: 'Recebido', emoji: '📝' },
  { status: 'IN_PREPARATION', label: 'Em preparo', emoji: '👨‍🍳' },
  { status: 'READY', label: 'Pronto', emoji: '✅' },
  { status: 'OUT_FOR_DELIVERY', label: 'Saiu para entrega', emoji: '🛵' },
  { status: 'DELIVERED', label: 'Entregue', emoji: '🎉' },
];

export default function AcompanhamentoPage({
  params,
}: {
  params: { protocol: string };
}) {
  const protocol = Number(params.protocol);
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['track', protocol],
    queryFn: () => api.trackOrder(protocol),
    enabled: Number.isFinite(protocol),
  });

  // Atualiza em tempo real quando o caixa muda o status deste pedido.
  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket'] });
    socket.on('order:status', (order: { protocol: number }) => {
      if (order?.protocol === protocol) {
        qc.invalidateQueries({ queryKey: ['track', protocol] });
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [protocol, qc]);

  if (!Number.isFinite(protocol)) {
    return <Centered>Protocolo inválido.</Centered>;
  }
  if (isLoading) return <Centered>Carregando seu pedido...</Centered>;
  if (isError || !data) {
    return <Centered>Pedido não encontrado. Confira o número do protocolo.</Centered>;
  }

  const canceled = data.status === 'CANCELED';
  const currentIndex = STEPS.findIndex((s) => s.status === data.status);

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-center text-2xl font-bold">
        Pedido <span className="font-mono">#{data.dailyNumber}</span>
      </h1>
      <p className="text-center text-gray-500">
        {data.items
          .map(
            (i) =>
              `${i.quantity}x ${i.nameSnapshot}` +
              (i.optionNameSnapshot ? ` (${i.optionNameSnapshot})` : ''),
          )
          .join(', ')}
      </p>

      {canceled ? (
        <p className="mt-8 rounded bg-red-50 p-4 text-center font-medium text-red-700">
          Pedido cancelado.
        </p>
      ) : (
        <ol className="mt-8 space-y-3">
          {STEPS.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <li
                key={step.status}
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  active
                    ? 'border-blue-500 bg-blue-50'
                    : done
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 opacity-60'
                }`}
              >
                <span className="text-xl">{step.emoji}</span>
                <span className="flex-1 font-medium">{step.label}</span>
                {done && <span className="text-green-600">✓</span>}
                {active && (
                  <span className="text-sm font-semibold text-blue-600">
                    agora
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-6 text-center text-xs text-gray-400">
        Esta página atualiza sozinha conforme seu pedido avança.
      </p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md p-10 text-center text-gray-600">
      {children}
    </main>
  );
}
