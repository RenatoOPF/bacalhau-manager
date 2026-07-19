'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, auth, type Employee } from '@/lib/api';
import { AdminUserProvider } from './user-context';

const NAV = [
  { href: '/admin', label: 'Fila' },
  { href: '/admin/caixa', label: 'Caixa' },
  { href: '/admin/cardapio', label: 'Cardápio' },
  { href: '/admin/estoque', label: 'Estoque' },
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
      <div className="p-10 text-center text-brand-ink/40">
        Carregando painel...
      </div>
    );
  }

  const navClass = (href: string) =>
    pathname === href
      ? 'rounded-md bg-brand-gold px-2.5 py-1 font-bold text-brand-ink'
      : 'rounded-md px-2.5 py-1 font-medium text-brand-cream hover:bg-white/10';

  return (
    <AdminUserProvider user={user}>
      <header className="border-b-4 border-brand-gold bg-brand-red">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 p-3">
          <a href="/admin" className="flex items-center gap-2">
            <img
              src="/logo.jpeg"
              alt="Restaurante Bacalhau & Cia"
              className="h-9 w-9 rounded-full"
            />
            <span className="font-display text-lg font-bold text-white">
              Bacalhau &amp; Cia
            </span>
          </a>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={navClass(n.href)}>
                {n.label}
              </a>
            ))}
            {user.role === 'ADMIN' && (
              <a href="/admin/funcionarios" className={navClass('/admin/funcionarios')}>
                Funcionários
              </a>
            )}
          </nav>
          <span className="text-sm text-brand-cream/80">
            {user.name} ({user.role})
          </span>
          <button
            onClick={logout}
            className="rounded-md border border-brand-cream/40 px-2.5 py-1 text-sm text-brand-cream hover:bg-white/10"
          >
            Sair
          </button>
        </div>
      </header>
      {children}
    </AdminUserProvider>
  );
}
