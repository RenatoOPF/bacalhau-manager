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
  /** true when user confirmed via suggestion click (not free-typed) */
  confirmed: boolean;
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
  const [activeIdx, setActiveIdx] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const display = value.street
      ? value.neighborhood
        ? `${value.street}, ${value.neighborhood}`
        : value.street
      : '';
    setQuery(display);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.street]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const raw = query.trim();
    const cepDigits = raw.replace(/\D/g, '');

    if (cepDigits.length === 8 && raw.replace(/[^0-9-]/g, '') === raw) {
      setLoading(true);
      fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.erro) {
            const street = data.logradouro ?? '';
            const neighborhood = data.bairro ?? '';
            const cep = data.cep ?? raw;
            onChange({ ...value, street, neighborhood, cep, confirmed: true });
            setQuery(street && neighborhood ? `${street}, ${neighborhood}` : street);
            setOpen(false);
            setSuggestions([]);
            setTimeout(() => numberRef.current?.focus(), 50);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }

    if (raw.length < 4) {
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
          const list = data.slice(0, 8);
          setSuggestions(list);
          setOpen(list.length > 0);
          setActiveIdx(-1);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400);
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
    setActiveIdx(-1);
    const display = s.bairro ? `${s.logradouro}, ${s.bairro}` : s.logradouro;
    setQuery(display);
    onChange({ ...value, street: s.logradouro, neighborhood: s.bairro, cep: s.cep, confirmed: true });
    setTimeout(() => numberRef.current?.focus(), 50);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      select(suggestions[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const isConfirmed = value.confirmed && !!value.street;
  const isDirty = query !== '' && !isConfirmed;

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <div className={`input flex items-center gap-1 px-2 transition-colors ${isConfirmed ? 'border-green-400 bg-green-50' : ''}`}>
        {isConfirmed && (
          <span className="shrink-0 text-green-500" title="Endereço confirmado">✓</span>
        )}
        <input
          className="min-w-0 flex-1 bg-transparent py-2 outline-none"
          placeholder="Digite a rua ou o CEP"
          value={query}
          autoComplete="off"
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (!val) {
              onChange({ street: '', number: value.number, cep: '', neighborhood: '', confirmed: false });
            } else if (val !== query) {
              // user is editing → clear confirmed state
              onChange({ ...value, street: '', neighborhood: '', cep: '', confirmed: false });
            }
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {loading && (
          <span className="shrink-0 animate-pulse text-xs text-gray-400">buscando…</span>
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
            <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">{value.cep}</span>
          </>
        )}
      </div>

      {isDirty && !loading && suggestions.length === 0 && query.length >= 4 && (
        <p className="text-xs text-amber-600">
          Selecione uma sugestão da lista para confirmar o endereço.
        </p>
      )}

      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
        >
          <li className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Sugestões de endereço
          </li>
          {suggestions.map((s, i) => (
            <li
              key={s.cep}
              className={`cursor-pointer px-3 py-2.5 text-sm transition-colors ${
                i === activeIdx ? 'bg-brand-gold/10' : 'hover:bg-gray-50'
              } ${i !== suggestions.length - 1 ? 'border-b border-gray-100' : ''}`}
              onMouseDown={() => select(s)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="font-semibold text-brand-ink">{s.logradouro}</span>
              {s.bairro && (
                <span className="ml-2 inline-block rounded-full bg-brand-gold/20 px-2 py-0.5 text-xs font-medium text-brand-ink/70">
                  {s.bairro}
                </span>
              )}
              <span className="ml-2 font-mono text-xs text-gray-400">{s.cep}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
