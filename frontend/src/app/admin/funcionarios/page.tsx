'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Role } from '@/lib/api';

const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'KITCHEN', label: 'Cozinha' },
  { value: 'DELIVERY', label: 'Entregador' },
];

const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;

export default function FuncionariosPage() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['employees'] });

  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: api.listEmployees,
  });

  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'MANAGER' as Role,
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.createEmployee(form),
    onSuccess: () => {
      setForm({ name: '', username: '', password: '', role: 'MANAGER' });
      setError(null);
      invalidate();
    },
    onError: () => setError('Não foi possível criar (usuário já existe?).'),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof api.updateEmployee>[1];
    }) => api.updateEmployee(id, payload),
    onSuccess: invalidate,
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Funcionários</h1>

      {/* Cadastro */}
      <section className="mt-4 grid grid-cols-1 gap-2 rounded-lg border bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <input
          className="rounded border p-2"
          placeholder="Nome"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="rounded border p-2"
          placeholder="Usuário"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <input
          className="rounded border p-2"
          type="password"
          placeholder="Senha (mín. 6)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          className="rounded border p-2"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          className="rounded bg-green-600 px-3 py-2 text-white disabled:opacity-50"
          disabled={
            create.isPending ||
            !form.name ||
            !form.username ||
            form.password.length < 6
          }
          onClick={() => create.mutate()}
        >
          Adicionar
        </button>
      </section>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

      {/* Lista */}
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Nome</th>
            <th>Usuário</th>
            <th>Perfil</th>
            <th>Status</th>
            <th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {(employees ?? []).map((e) => (
            <tr key={e.id} className="border-b">
              <td className="py-2">{e.name}</td>
              <td className="font-mono">{e.username}</td>
              <td>
                <select
                  className="rounded border p-1"
                  value={e.role}
                  onChange={(ev) =>
                    update.mutate({
                      id: e.id,
                      payload: { role: ev.target.value as Role },
                    })
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {roleLabel(r.value)}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {e.active ? (
                  <span className="text-green-600">ativo</span>
                ) : (
                  <span className="text-gray-400">inativo</span>
                )}
              </td>
              <td className="space-x-2 text-right">
                <button
                  className="text-xs text-blue-600 underline"
                  onClick={() => {
                    const pwd = window.prompt('Nova senha (mín. 6):');
                    if (pwd && pwd.length >= 6) {
                      update.mutate({ id: e.id, payload: { password: pwd } });
                    }
                  }}
                >
                  redefinir senha
                </button>
                <button
                  className="text-xs text-gray-600 underline"
                  onClick={() =>
                    update.mutate({
                      id: e.id,
                      payload: { active: !e.active },
                    })
                  }
                >
                  {e.active ? 'desativar' : 'ativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
