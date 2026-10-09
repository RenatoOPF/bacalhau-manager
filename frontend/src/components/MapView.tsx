'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

const RESTAURANT: [number, number] = [-35.7044501, -9.660454]; // [lng, lat]
const STYLE = 'https://tiles.openfreemap.org/styles/positron';

interface Props {
  customerCoords?: { lat: string; lon: string } | null;
}

function makeRestaurantEl(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'width:44px;height:44px;border-radius:12px;background:#c8a45a;box-shadow:0 3px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid #fff;overflow:hidden';
  const img = document.createElement('img');
  img.src = '/logo.jpeg';
  img.style.cssText = 'width:100%;height:100%;object-fit:cover';
  wrapper.appendChild(img);
  return wrapper;
}

function makeCustomerEl(): HTMLElement {
  const outer = document.createElement('div');
  outer.style.cssText =
    'width:16px;height:16px;border-radius:50%;background:#e53e3e;box-shadow:0 0 0 4px rgba(229,62,62,0.25);border:2px solid #fff';
  return outer;
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

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    restaurantMarkerRef.current = new maplibregl.Marker({ element: makeRestaurantEl() })
      .setLngLat(RESTAURANT)
      .setPopup(new maplibregl.Popup({ offset: 24, closeButton: false })
        .setText('Bacalhau & Cia'))
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

    customerMarkerRef.current = new maplibregl.Marker({ element: makeCustomerEl() })
      .setLngLat(pos)
      .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false })
        .setText('Endereço do cliente'))
      .addTo(map);

    map.fitBounds([RESTAURANT, pos], { padding: 60, maxZoom: 16 });
  }, [customerCoords]);

  return (
    <div
      ref={containerRef}
      className="isolate h-64 w-full rounded-xl border border-gray-200 shadow-sm"
    />
  );
}
