'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, auth, type Employee } from '@/lib/api';

export default function CourierLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
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
        if (u.role !== 'DELIVERY') {
          router.replace('/admin');
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
      <div className="p-10 text-center text-brand-ink/40">Carregando...</div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="sticky top-0 z-20 border-b-4 border-brand-gold bg-brand-red px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpeg"
            alt="Bacalhau & Cia"
            className="h-8 w-8 shrink-0 rounded-full"
          />
          <span className="font-display font-bold text-white">
            Bacalhau &amp; Cia
          </span>
          <span className="ml-auto text-sm text-brand-cream/80">{user.name}</span>
          <button
            onClick={logout}
            className="shrink-0 rounded-md border border-brand-cream/40 px-2.5 py-1 text-sm text-brand-cream hover:bg-white/10"
          >
            Sair
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
