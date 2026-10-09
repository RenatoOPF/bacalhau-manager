'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// worker.mjs has a relative import to shared.mjs that webpack can't bundle;
// both files are served statically (public/) and kept in sync via postinstall.
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

const RESTAURANT: [number, number] = [-35.7044501, -9.660454]; // [lng, lat]
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

interface Props {
  customerCoords?: { lat: string; lon: string } | null;
}

export function MapView({ customerCoords }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const customerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const restaurantMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: RESTAURANT,
      zoom: 15,
    });

    const logoEl = document.createElement('img');
    logoEl.src = '/logo.jpeg';
    logoEl.style.cssText =
      'width:36px;height:36px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);object-fit:cover;cursor:pointer';

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    restaurantMarkerRef.current = new maplibregl.Marker({ element: logoEl })
      .setLngLat(RESTAURANT)
      .setPopup(new maplibregl.Popup({ offset: 20 }).setText('Bacalhau & Cia'))
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      customerMarkerRef.current = null;
      restaurantMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    customerMarkerRef.current?.remove();
    customerMarkerRef.current = null;

    if (!customerCoords) {
      map.flyTo({ center: RESTAURANT, zoom: 15 });
      return;
    }

    const pos: [number, number] = [
      parseFloat(customerCoords.lon),
      parseFloat(customerCoords.lat),
    ];

    customerMarkerRef.current = new maplibregl.Marker({ color: '#e53e3e' })
      .setLngLat(pos)
      .setPopup(new maplibregl.Popup({ offset: 20 }).setText('Endereço do cliente'))
      .addTo(map);

    map.fitBounds([RESTAURANT, pos], { padding: 50, maxZoom: 16 });
  }, [customerCoords]);

  return (
    <div
      ref={containerRef}
      className="isolate h-48 w-full rounded border border-gray-200"
    />
  );
}
