'use client';

import { useEffect, useRef, useState } from 'react';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
const PROXIMITY = '-35.7044501,-9.660454';

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
        const query = encodeURIComponent(`${value}, Maceió, Alagoas`);
        const params = new URLSearchParams({
          country: 'br',
          proximity: PROXIMITY,
          language: 'pt-BR',
          types: 'address',
          limit: '7',
          access_token: TOKEN,
        });
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?${params}`,
        );
        const data: {
          features: {
            text?: string;
            context?: { id: string; text: string }[];
          }[];
        } = await res.json();

        const seen = new Set<string>();
        const items: Suggestion[] = [];
        for (const f of data.features) {
          const road = f.text ?? '';
          if (!road || seen.has(road)) continue;
          seen.add(road);
          const suburb =
            f.context?.find(
              (c) => c.id.startsWith('neighborhood') || c.id.startsWith('district'),
            )?.text ?? '';
          items.push({ road, suburb });
        }
        setSuggestions(items);
        setOpen(items.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400);
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
