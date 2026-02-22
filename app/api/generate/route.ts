import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let novelaiResponse: Response;
  try {
    novelaiResponse = await fetch('https://image.novelai.net/ai/generate-image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach NovelAI: ${err instanceof Error ? err.message : 'Network error'}` },
      { status: 502 }
    );
  }

  if (!novelaiResponse.ok) {
    const text = await novelaiResponse.text().catch(() => novelaiResponse.statusText);
    return NextResponse.json({ error: text }, { status: novelaiResponse.status });
  }

  const buffer = await novelaiResponse.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: { 'Content-Type': 'application/zip' },
  });
}
