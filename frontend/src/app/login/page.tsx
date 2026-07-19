'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, auth } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await api.login(username, password);
      auth.setToken(session.token);
      router.replace('/admin');
    } catch {
      setError('Usuário ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="card p-6">
        <div className="flex flex-col items-center text-center">
          <img
            src="/logo.jpeg"
            alt="Restaurante Bacalhau & Cia"
            className="h-24 w-24 rounded-full shadow-md"
          />
          <h1 className="page-title mt-3">Bacalhau &amp; Cia</h1>
          <p className="text-sm text-brand-ink/60">Acesso ao painel</p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            className="input w-full p-2"
            placeholder="Usuário"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="input w-full p-2"
            type="password"
            placeholder="Senha"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary w-full px-4 py-2.5"
            disabled={loading || !username || !password}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          {error && <p className="text-sm text-brand-red">{error}</p>}
        </form>
      </div>
    </main>
  );
}
