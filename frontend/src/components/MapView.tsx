'use client';

import { useEffect, useRef } from 'react';
import type { Map, Marker } from 'leaflet';

const RESTAURANT = { lat: -9.660454, lon: -35.7044501 };

interface Props {
  customerCoords?: { lat: string; lon: string } | null;
}

export function MapView({ customerCoords }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const customerMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    (async () => {
      const L = (await import('leaflet')).default;
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Fix default icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current!).setView(
        [RESTAURANT.lat, RESTAURANT.lon],
        15,
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);

      const restaurantIcon = L.divIcon({
        html: '<div style="font-size:22px;line-height:1">🍽️</div>',
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });
      L.marker([RESTAURANT.lat, RESTAURANT.lon], { icon: restaurantIcon })
        .addTo(map)
        .bindPopup('<b>Bacalhau & Cia</b><br>Rua José Freire Moura, 647');

      mapRef.current = map;
    })();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      customerMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (customerMarkerRef.current) {
      map.removeLayer(customerMarkerRef.current);
      customerMarkerRef.current = null;
    }

    if (customerCoords) {
      import('leaflet').then(({ default: L }) => {
        if (!mapRef.current) return;
        const lat = parseFloat(customerCoords.lat);
        const lon = parseFloat(customerCoords.lon);
        customerMarkerRef.current = L.marker([lat, lon])
          .addTo(mapRef.current)
          .bindPopup('Seu endereço');
        mapRef.current.fitBounds(
          L.latLngBounds([RESTAURANT.lat, RESTAURANT.lon], [lat, lon]),
          { padding: [30, 30] },
        );
      });
    } else {
      map.setView([RESTAURANT.lat, RESTAURANT.lon], 15);
    }
  }, [customerCoords]);

  return (
    <div
      ref={containerRef}
      className="h-48 w-full rounded border border-gray-200"
    />
  );
}
