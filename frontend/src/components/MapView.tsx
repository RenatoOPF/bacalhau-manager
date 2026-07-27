'use client';

import { useEffect, useRef } from 'react';

const RESTAURANT = { lat: -9.660454, lng: -35.7044501 };
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

interface Props {
  customerCoords?: { lat: string; lon: string } | null;
}

export function MapView({ customerCoords }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      if (!document.getElementById('mapbox-css')) {
        const link = document.createElement('link');
        link.id = 'mapbox-css';
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css';
        document.head.appendChild(link);
      }

      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [RESTAURANT.lng, RESTAURANT.lat],
        zoom: 15,
        language: 'pt-BR',
      });

      const el = document.createElement('div');
      el.textContent = '🍽️';
      el.style.cssText = 'font-size:24px;cursor:pointer';

      new mapboxgl.Marker({ element: el })
        .setLngLat([RESTAURANT.lng, RESTAURANT.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(
            '<b>Bacalhau & Cia</b><br>Rua José Freire Moura, 647',
          ),
        )
        .addTo(map);

      mapRef.current = map;
    })();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      customerMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    if (customerMarkerRef.current) {
      customerMarkerRef.current.remove();
      customerMarkerRef.current = null;
    }

    if (!customerCoords) {
      mapRef.current.flyTo({ center: [RESTAURANT.lng, RESTAURANT.lat], zoom: 15 });
      return;
    }

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (!mapRef.current) return;
      const lng = parseFloat(customerCoords.lon);
      const lat = parseFloat(customerCoords.lat);

      customerMarkerRef.current = new mapboxgl.Marker({ color: '#dc2626' })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText('Seu endereço'))
        .addTo(mapRef.current);

      const bounds = new mapboxgl.LngLatBounds()
        .extend([RESTAURANT.lng, RESTAURANT.lat])
        .extend([lng, lat]);
      mapRef.current.fitBounds(bounds, { padding: 60 });
    });
  }, [customerCoords]);

  return (
    <div
      ref={containerRef}
      className="h-48 w-full overflow-hidden rounded border border-gray-200"
    />
  );
}
