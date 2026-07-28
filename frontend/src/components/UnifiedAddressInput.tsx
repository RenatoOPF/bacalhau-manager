'use client';

import { useEffect, useRef, useState } from 'react';

interface ViaCepResult {
  cep: string;
  logradouro: string;
  bairro: string;
}

export interface AddressValue {
  street: string;
  number: string;
  cep: string;
  neighborhood: string;
}

interface Props {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
}

export function UnifiedAddressInput({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ViaCepResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  // Sync query display when street is set externally (e.g. from CEP field)
  useEffect(() => {
    const display = value.street
      ? value.neighborhood
        ? `${value.street} — ${value.neighborhood}`
        : value.street
      : '';
    setQuery(display);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.street]);

  // Search ViaCEP by street name
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const raw = query.trim();
    const cepDigits = raw.replace(/\D/g, '');

    // CEP detection: 8 digits
    if (cepDigits.length === 8 && raw.replace(/[^0-9-]/g, '') === raw) {
      setLoading(true);
      fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.erro) {
            const street = data.logradouro ?? '';
            const neighborhood = data.bairro ?? '';
            const cep = data.cep ?? raw;
            onChange({ ...value, street, neighborhood, cep });
            setQuery(street && neighborhood ? `${street} — ${neighborhood}` : street);
            setOpen(false);
            setSuggestions([]);
            setTimeout(() => numberRef.current?.focus(), 50);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }

    if (raw.length < 5) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://viacep.com.br/ws/AL/Maceio/${encodeURIComponent(raw)}/json/`,
        );
        const data: ViaCepResult[] = await res.json();
        if (Array.isArray(data)) {
          setSuggestions(data.slice(0, 6));
          setOpen(data.length > 0);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(s: ViaCepResult) {
    setOpen(false);
    setSuggestions([]);
    setQuery(s.bairro ? `${s.logradouro} — ${s.bairro}` : s.logradouro);
    onChange({ ...value, street: s.logradouro, neighborhood: s.bairro, cep: s.cep });
    setTimeout(() => numberRef.current?.focus(), 50);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="input flex items-center gap-1 px-2">
        <input
          className="min-w-0 flex-1 bg-transparent py-2 outline-none"
          placeholder="Endereço ou CEP"
          value={query}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            // Clear street data when user edits manually
            if (!e.target.value) onChange({ street: '', number: value.number, cep: '', neighborhood: '' });
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
        {loading && (
          <span className="shrink-0 text-xs text-gray-400">…</span>
        )}
        <span className="shrink-0 select-none text-gray-300">|</span>
        <input
          ref={numberRef}
          className="w-14 shrink-0 bg-transparent py-2 text-center outline-none"
          placeholder="Nº"
          value={value.number}
          onChange={(e) => onChange({ ...value, number: e.target.value })}
        />
        {value.cep && (
          <>
            <span className="shrink-0 select-none text-gray-300">|</span>
            <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">
              {value.cep}
            </span>
          </>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded border border-gray-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li
              key={s.cep}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
              onMouseDown={() => select(s)}
            >
              <span className="font-medium">{s.logradouro}</span>
              {s.bairro && (
                <span className="ml-1 text-gray-400">— {s.bairro}</span>
              )}
              <span className="ml-2 text-xs text-gray-400">{s.cep}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
