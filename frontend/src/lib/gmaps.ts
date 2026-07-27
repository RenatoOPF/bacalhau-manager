const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!;
let promise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (promise) return promise;
  promise = new Promise((resolve, reject) => {
    if (window.google?.maps) { resolve(window.google); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places&language=pt-BR&region=BR`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return promise;
}
