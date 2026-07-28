'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/gmaps';

export interface PlaceResult {
  street: string;
  number: string;
  neighborhood: string;
  lat: number;
  lng: number;
}

interface Suggestion {
  placeId: string;
  mainText: string;
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
  onPlaceSelect?: (result: PlaceResult) => void;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function AddressAutocomplete({
  value,
  onChange,
  neighborhoods,
  onNeighborhoodMatch,
  onPlaceSelect,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dummyRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);

  useEffect(() => {
    loadGoogleMaps().then((g) => {
      autocompleteRef.current = new g.maps.places.AutocompleteService();
      if (dummyRef.current) {
        placesRef.current = new g.maps.places.PlacesService(dummyRef.current);
      }
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
      setLoading(true);
      try {
        const g = await loadGoogleMaps();
        if (!autocompleteRef.current) {
          autocompleteRef.current = new g.maps.places.AutocompleteService();
        }
        if (!placesRef.current && dummyRef.current) {
          placesRef.current = new g.maps.places.PlacesService(dummyRef.current);
        }

        const results = await new Promise<google.maps.places.AutocompletePrediction[]>(
          (resolve) => {
            autocompleteRef.current!.getPlacePredictions(
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

        const items: Suggestion[] = results.slice(0, 5).map((p) => ({
          placeId: p.place_id,
          mainText: p.structured_formatting.main_text,
          suburb: p.terms[1]?.value ?? '',
        }));
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

  function matchNeighborhood(suburb: string) {
    if (!onNeighborhoodMatch || !neighborhoods || !suburb) return;
    const sub = normalize(suburb);
    const match = neighborhoods.find((n) => {
      const name = normalize(n.name);
      return name.includes(sub) || sub.includes(name);
    });
    if (match) onNeighborhoodMatch(match.id);
  }

  async function select(s: Suggestion) {
    setOpen(false);
    setSuggestions([]);

    const g = await loadGoogleMaps();
    if (!placesRef.current && dummyRef.current) {
      placesRef.current = new g.maps.places.PlacesService(dummyRef.current);
    }
    if (!placesRef.current) {
      const road = s.mainText.split(',')[0].trim();
      onChange(road);
      matchNeighborhood(s.suburb);
      return;
    }

    placesRef.current.getDetails(
      { placeId: s.placeId, fields: ['geometry', 'address_components'] },
      (place, status) => {
        const road = s.mainText.split(',')[0].trim();

        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          onChange(road);
          matchNeighborhood(s.suburb);
          return;
        }

        const components = place.address_components ?? [];
        const get = (type: string) =>
          components.find((c) => c.types.includes(type))?.long_name ?? '';

        const street = get('route') || road;
        const number = get('street_number');
        const neighborhood =
          get('sublocality_level_1') || get('neighborhood') || s.suburb;
        const lat = place.geometry?.location?.lat() ?? 0;
        const lng = place.geometry?.location?.lng() ?? 0;

        onChange(street);
        matchNeighborhood(neighborhood);

        if (onPlaceSelect) {
          onPlaceSelect({ street, number, neighborhood, lat, lng });
        }
      },
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div ref={dummyRef} className="hidden" />
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
              key={s.placeId}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
              onMouseDown={() => select(s)}
            >
              <span className="font-medium">{s.mainText}</span>
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
