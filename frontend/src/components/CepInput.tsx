'use client';

import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (cep: string) => void;
  onAddressFound: (data: { street: string; neighborhood: string }) => void;
}

export function CepInput({ value, onChange, onAddressFound }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const raw = value.replace(/\D/g, '');

  useEffect(() => {
    if (raw.length !== 8) {
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    fetch(`https://viacep.com.br/ws/${raw}/json/`)
      .then((r) => r.json())
      .then((data) => {
        if (data.erro) {
          setError('CEP não encontrado');
          return;
        }
        onAddressFound({
          street: data.logradouro ?? '',
          neighborhood: data.bairro ?? '',
        });
      })
      .catch(() => setError('Erro ao buscar CEP'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    const formatted =
      digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    onChange(formatted);
  }

  return (
    <div className="relative">
      <input
        className="input w-full p-2"
        placeholder="CEP (00000-000)"
        value={value}
        onChange={handleChange}
        maxLength={9}
        inputMode="numeric"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          …
        </span>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
