'use client';

import { useEffect, useRef } from 'react';
import { loadGoogleMaps } from '@/lib/gmaps';

const RESTAURANT = { lat: -9.660454, lng: -35.7044501 };

interface Props {
  customerCoords?: { lat: string; lon: string } | null;
}

export function MapView({ customerCoords }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const customerMarkerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    loadGoogleMaps().then((g) => {
      if (!containerRef.current) return;

      const map = new g.maps.Map(containerRef.current, {
        center: RESTAURANT,
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      const restaurantEl = document.createElement('div');
      restaurantEl.textContent = '🍽️';
      restaurantEl.style.cssText = 'font-size:22px;cursor:pointer';

      new g.maps.marker.AdvancedMarkerElement({
        position: RESTAURANT,
        map,
        title: 'Bacalhau & Cia',
        content: restaurantEl,
      });

      mapRef.current = map;
    });

    return () => {
      mapRef.current = null;
      customerMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (customerMarkerRef.current) {
      customerMarkerRef.current.setMap(null);
      customerMarkerRef.current = null;
    }

    if (!customerCoords) {
      map.panTo(RESTAURANT);
      map.setZoom(15);
      return;
    }

    loadGoogleMaps().then((g) => {
      if (!mapRef.current) return;
      const pos = {
        lat: parseFloat(customerCoords.lat),
        lng: parseFloat(customerCoords.lon),
      };
      customerMarkerRef.current = new g.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: 'Seu endereço',
      });

      const bounds = new g.maps.LatLngBounds();
      bounds.extend(RESTAURANT);
      bounds.extend(pos);
      mapRef.current.fitBounds(bounds);
    });
  }, [customerCoords]);

  return (
    <div
      ref={containerRef}
      className="h-48 w-full overflow-hidden rounded border border-gray-200"
    />
  );
}
