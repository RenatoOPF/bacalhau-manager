import { CozinhaClient } from './client';
import type { KitchenOrder } from './client';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function getOrders(): Promise<KitchenOrder[]> {
  try {
    const res = await fetch(`${API_URL}/orders/kitchen`, {
      cache: 'no-store',
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function CozinhaPage() {
  const initialOrders = await getOrders();
  return <CozinhaClient initialOrders={initialOrders} />;
}
