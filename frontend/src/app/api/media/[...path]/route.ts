import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(/\/api$/, '');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const backendUrl = `${BACKEND_URL}/${path.join('/')}`;

  let response: Response;
  try {
    response = await fetch(backendUrl, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  if (!response.ok) {
    return new NextResponse(null, { status: response.status });
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  return new NextResponse(response.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
