'use client';

import { useEffect, useRef } from 'react';
import type { Map, Marker } from 'leaflet';

const RESTAURANT: [number, number] = [-9.660454, -35.7044501];

interface Props {
  customerCoords?: { lat: string; lon: string } | null;
}

export function MapView({ customerCoords }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const customerMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return;

      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current).setView(RESTAURANT, 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);
      const restaurantIcon = L.divIcon({
        html: '<img src="/logo.jpeg" style="width:40px;height:40px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);object-fit:cover;" />',
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -22],
      });
      L.marker(RESTAURANT, { icon: restaurantIcon }).addTo(map).bindPopup('Bacalhau & Cia');
      mapRef.current = map;
    });

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
      customerMarkerRef.current.remove();
      customerMarkerRef.current = null;
    }

    if (!customerCoords) {
      map.setView(RESTAURANT, 15);
      return;
    }

    import('leaflet').then((L) => {
      const pos: [number, number] = [
        parseFloat(customerCoords.lat),
        parseFloat(customerCoords.lon),
      ];
      customerMarkerRef.current = L.marker(pos)
        .addTo(mapRef.current!)
        .bindPopup('Seu endereço');

      mapRef.current!.fitBounds(L.latLngBounds(RESTAURANT, pos), {
        padding: [30, 30],
      });
    });
  }, [customerCoords]);

  return (
    <div
      ref={containerRef}
      className="h-48 w-full overflow-hidden rounded border border-gray-200"
    />
  );
}
