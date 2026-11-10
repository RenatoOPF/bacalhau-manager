import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(/\/api$/, '');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const segments = params.path ?? [];
  if (
    segments.length === 0 ||
    segments[0] !== 'uploads' ||
    segments.some((s) => !s || s === '.' || s === '..' || s.includes('\\'))
  ) {
    return new NextResponse(null, { status: 403 });
  }

  const backendUrl = `${BACKEND_URL}/${segments.map(encodeURIComponent).join('/')}`;

  let response: Response;
  try {
    response = await fetch(backendUrl, {
      next: { revalidate: 86400 },
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  if (!response.ok) {
    return new NextResponse(null, { status: response.status });
  }

  const rawType = (response.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_MIME.has(rawType)) {
    return new NextResponse(null, { status: 415 });
  }

  return new NextResponse(response.body, {
    headers: {
      'Content-Type': rawType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
