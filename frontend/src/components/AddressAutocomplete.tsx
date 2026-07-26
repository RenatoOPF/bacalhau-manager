'use client';

import { useEffect, useRef, useState } from 'react';

interface Suggestion {
  road: string;
  suburb: string;
}

interface Neighborhood {
  id: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (street: string) => void;
  neighborhoods?: Neighborhood[];
  onNeighborhoodMatch?: (id: string) => void;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function AddressAutocomplete({ value, onChange, neighborhoods, onNeighborhoodMatch }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (value.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          street: value,
          city: 'Maceió',
          state: 'Alagoas',
          countrycodes: 'br',
          format: 'json',
          limit: '7',
          addressdetails: '1',
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { 'Accept-Language': 'pt-BR' } },
        );
        const data: {
          address?: {
            road?: string;
            suburb?: string;
            neighbourhood?: string;
            quarter?: string;
          };
        }[] = await res.json();

        const seen = new Set<string>();
        const items: Suggestion[] = [];
        for (const r of data) {
          const road = r.address?.road ?? '';
          if (!road || seen.has(road)) continue;
          seen.add(road);
          const suburb =
            r.address?.suburb ??
            r.address?.neighbourhood ??
            r.address?.quarter ??
            '';
          items.push({ road, suburb });
        }
        setSuggestions(items);
        setOpen(items.length > 0);
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

  function select(s: Suggestion) {
    onChange(s.road);
    setOpen(false);
    setSuggestions([]);

    if (onNeighborhoodMatch && neighborhoods && s.suburb) {
      const sub = normalize(s.suburb);
      const match = neighborhoods.find((n) => {
        const name = normalize(n.name);
        return name.includes(sub) || sub.includes(name);
      });
      if (match) onNeighborhoodMatch(match.id);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        className="input w-full p-2"
        placeholder="Rua"
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
              key={s.road}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
              onMouseDown={() => select(s)}
            >
              <span className="font-medium">{s.road}</span>
              {s.suburb && (
                <span className="ml-1 text-gray-400">— {s.suburb}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
