'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/gmaps';

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
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);

  useEffect(() => {
    loadGoogleMaps().then((g) => {
      serviceRef.current = new g.maps.places.AutocompleteService();
    });
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (value.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      if (!serviceRef.current) return;
      setLoading(true);
      try {
        const results = await new Promise<google.maps.places.AutocompletePrediction[]>(
          (resolve) => {
            serviceRef.current!.getPlacePredictions(
              {
                input: `${value}, Maceió, AL`,
                componentRestrictions: { country: 'br' },
                location: new google.maps.LatLng(-9.660454, -35.7044501),
                radius: 30000,
                types: ['address'],
              },
              (predictions, status) => {
                if (
                  status === google.maps.places.PlacesServiceStatus.OK &&
                  predictions
                ) {
                  resolve(predictions);
                } else {
                  resolve([]);
                }
              },
            );
          },
        );

        const seen = new Set<string>();
        const items: Suggestion[] = [];
        for (const p of results) {
          const road = p.structured_formatting.main_text;
          if (!road || seen.has(road)) continue;
          seen.add(road);
          const suburb = p.terms[1]?.value ?? '';
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
