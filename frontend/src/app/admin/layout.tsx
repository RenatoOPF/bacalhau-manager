'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, auth, type Employee } from '@/lib/api';
import { AdminUserProvider } from './user-context';

const NAV = [
  { href: '/admin', label: 'Fila' },
  { href: '/admin/caixa', label: 'Caixa' },
  { href: '/admin/cardapio', label: 'Cardápio' },
  { href: '/admin/relatorios', label: 'Relatórios' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<Employee | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth.getToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((u) => {
        // Apenas ADMIN/MANAGER têm telas no painel.
        if (u.role !== 'ADMIN' && u.role !== 'MANAGER') {
          auth.clear();
          router.replace('/login');
          return;
        }
        setUser(u);
        setReady(true);
      })
      .catch(() => {
        auth.clear();
        router.replace('/login');
      });
  }, [router]);

  const logout = () => {
    auth.clear();
    router.replace('/login');
  };

  if (!ready || !user) {
    return (
      <div className="p-10 text-center text-gray-400">Carregando painel...</div>
    );
  }

  return (
    <AdminUserProvider user={user}>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 p-3">
          <span className="font-bold">Bacalhau &amp; Cia</span>
          <nav className="flex flex-1 flex-wrap gap-3 text-sm">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className={
                  pathname === n.href
                    ? 'font-semibold text-blue-700'
                    : 'text-blue-600'
                }
              >
                {n.label}
              </a>
            ))}
            {user.role === 'ADMIN' && (
              <a
                href="/admin/funcionarios"
                className={
                  pathname === '/admin/funcionarios'
                    ? 'font-semibold text-blue-700'
                    : 'text-blue-600'
                }
              >
                Funcionários
              </a>
            )}
          </nav>
          <span className="text-sm text-gray-500">
            {user.name} ({user.role})
          </span>
          <button onClick={logout} className="text-sm text-red-600 underline">
            Sair
          </button>
        </div>
      </header>
      {children}
    </AdminUserProvider>
  );
}
