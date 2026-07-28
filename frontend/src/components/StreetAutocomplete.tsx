'use client';

import { useEffect, useRef, useState } from 'react';

interface ViaCepResult {
  cep: string;
  logradouro: string;
  bairro: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (data: { cep: string; street: string; neighborhood: string }) => void;
}

export function StreetAutocomplete({ value, onChange, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<ViaCepResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 5) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://viacep.com.br/ws/AL/Maceio/${encodeURIComponent(value.trim())}/json/`,
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
  }, [value]);

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
    const display = s.bairro ? `${s.logradouro} — ${s.bairro}` : s.logradouro;
    onChange(display);
    onSelect({ cep: s.cep, street: s.logradouro, neighborhood: s.bairro });
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        className="input w-full p-2"
        placeholder="Endereço"
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          …
        </span>
      )}
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
