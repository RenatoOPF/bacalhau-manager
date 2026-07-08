'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Employee } from '@/lib/api';

// Contexto do usuário logado no painel admin. Fica fora do layout.tsx porque
// arquivos de rota do Next (layout/page) só podem exportar membros conhecidos
// (default, metadata, etc.) — exportar o hook daqui evita quebrar o build.
const UserContext = createContext<Employee | null>(null);

export const useAdminUser = () => useContext(UserContext);

export function AdminUserProvider({
  user,
  children,
}: {
  user: Employee | null;
  children: ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
