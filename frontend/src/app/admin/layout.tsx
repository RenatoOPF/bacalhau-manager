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
  { href: '/admin/despesas', label: 'Despesas' },
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
      ? 'whitespace-nowrap rounded-md bg-brand-gold px-2.5 py-1 font-bold text-brand-ink'
      : 'whitespace-nowrap rounded-md px-2.5 py-1 font-medium text-brand-cream hover:bg-white/10';

  return (
    <AdminUserProvider user={user}>
      <header className="sticky top-0 z-20 border-b-4 border-brand-gold bg-brand-red">
        <div className="mx-auto max-w-5xl px-3 pt-3">
          <div className="flex items-center gap-3">
            <a href="/admin" className="flex min-w-0 items-center gap-2">
              <img
                src="/logo.jpeg"
                alt="Restaurante Bacalhau & Cia"
                className="h-9 w-9 shrink-0 rounded-full"
              />
              <span className="truncate font-display text-lg font-bold text-white">
                Bacalhau &amp; Cia
              </span>
            </a>
            <span className="ml-auto hidden text-sm text-brand-cream/80 sm:inline">
              {user.name} ({user.role})
            </span>
            <button
              onClick={logout}
              className="ml-auto shrink-0 rounded-md border border-brand-cream/40 px-2.5 py-1 text-sm text-brand-cream hover:bg-white/10 sm:ml-0"
            >
              Sair
            </button>
          </div>
          {/* Navegação rolável no celular, igual à barra de categorias. */}
          <nav className="-mx-3 mt-2 flex gap-1 overflow-x-auto px-3 pb-2 text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={navClass(n.href)}>
                {n.label}
              </a>
            ))}
            {user.role === 'ADMIN' && (
              <a
                href="/admin/funcionarios"
                className={navClass('/admin/funcionarios')}
              >
                Funcionários
              </a>
            )}
          </nav>
        </div>
      </header>
      {children}
    </AdminUserProvider>
  );
}
