import { NextRequest } from 'next/server';

// Prevent response caching and allow long-lived SSE connections
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    return Response.json({ error: 'Missing API key' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch('https://image.novelai.net/ai/generate-image-stream', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return Response.json(
      { error: `Failed to reach NovelAI: ${err instanceof Error ? err.message : 'Network error'}` },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => upstream.statusText);
    return Response.json({ error: text }, { status: upstream.status });
  }

  // Pipe the SSE stream transparently to the browser
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Prevent nginx from buffering SSE
    },
  });
}
