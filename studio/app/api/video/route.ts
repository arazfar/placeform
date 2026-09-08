import {
  secret,
  failure,
  sameOrigin,
  rateLimit,
  providerError,
} from '@/lib/server';
const origin = 'https://api.aiand.com';
const modelId = 'minimaxai/minimax-h3';
async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${secret('AIAND_API_KEY')}`);
  return fetch(origin + path, {
    ...init,
    headers,
  });
}
async function pass(res: Response) {
  if (!res.ok) return failure(await providerError(res), res.status);
  return Response.json((await res.json()) as Record<string, unknown>, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function GET(req: Request) {
  if (!secret('AIAND_API_KEY'))
    return failure(
      'AIand is not connected. Set AIAND_API_KEY on the server and accept Video Service Terms in the AIand console.',
      503,
    );
  const u = new URL(req.url),
    id = u.searchParams.get('id');
  if (id && !/^video_[A-Za-z0-9_-]{1,180}$/.test(id))
    return failure('Invalid video job ID.');
  try {
    if (id) {
      const res = await request(
        `/v1/videos/${id}${u.searchParams.has('content') ? '/content' : ''}`,
      );
      if (u.searchParams.has('content')) {
        if (!res.ok) return failure(await providerError(res), res.status);
        return new Response(res.body, {
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Disposition': `attachment; filename="placeform-${id}.mp4"`,
            'Cache-Control': 'no-store',
          },
        });
      }
      return pass(res);
    }
    if (u.searchParams.has('history'))
      return pass(await request('/v1/videos?limit=20'));
    const [catalog, agreement, balance] = await Promise.all([
      request('/v1/videos/models'),
      request('/v1/videos/acceptance'),
      request('/billing/balance'),
    ]);
    if (!catalog.ok)
      return failure(await providerError(catalog), catalog.status);
    const data = (await catalog.json()) as {
      data: {
        id: string;
        pricing: { resolution: string; per_second: string; currency: string }[];
      }[];
    };
    const model = data.data?.find((m) => m.id === modelId);
    return Response.json(
      {
        model: model || null,
        agreement: agreement.ok ? await agreement.json() : null,
        balance: balance.ok ? await balance.json() : null,
        checkedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return failure(
      'AIand is unreachable. Existing jobs remain saved; refresh to check again.',
      502,
    );
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return failure('Origin is not allowed.', 403);
  if (!secret('AIAND_API_KEY'))
    return failure(
      'Set AIAND_API_KEY on the server to enable video generation.',
      503,
    );
  if (rateLimit('video', 40))
    return failure(
      'Video request limit reached. Existing jobs can still be checked.',
      429,
    );
  try {
    if (
      (req.headers.get('content-type') || '').includes('multipart/form-data')
    ) {
      if (Number(req.headers.get('content-length') || 0) > 12000000)
        return failure('Reference image is too large. Limit: 10 MB.', 413);
      const input = await req.formData(),
        file = input.get('file');
      if (
        !(file instanceof File) ||
        file.size > 10000000 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
        return failure('Upload a PNG, JPEG or WebP reference under 10 MB.');
      const form = new FormData();
      form.set('file', file);
      form.set('purpose', 'vision');
      return pass(await request('/v1/files', { method: 'POST', body: form }));
    }
    const body = (await req.json()) as Record<string, unknown>;
    const { prompt, seconds, firstFrame, lastFrame, expectedRate } = body;
    if (
      typeof prompt !== 'string' ||
      prompt.length < 8 ||
      prompt.length > 7000 ||
      typeof seconds !== 'number' ||
      !Number.isInteger(seconds) ||
      seconds < 4 ||
      seconds > 15 ||
      typeof expectedRate !== 'string'
    )
      return failure(
        'Invalid video request. Use a prompt, 4–15 seconds, reference frames, and a reviewed quote.',
      );
    if (
      ![firstFrame, lastFrame].every(
        (v) => typeof v === 'string' && /^file[-_][\w-]{1,180}$/.test(v),
      )
    )
      return failure('Upload both model reference frames before submitting.');
    const catalogRes = await request('/v1/videos/models');
    if (!catalogRes.ok)
      return failure(await providerError(catalogRes), catalogRes.status);
    const catalog = (await catalogRes.json()) as {
      data: {
        id: string;
        pricing: { resolution: string; per_second: string; currency: string }[];
      }[];
    };
    const model = catalog.data?.find((m) => m.id === modelId),
      price = model?.pricing.find((p) => p.resolution === '768p');
    if (!model || !price)
      return failure(
        'MiniMax H3 is unavailable in the current AIand video catalog.',
        409,
      );
    if (price.per_second !== expectedRate)
      return failure(
        'The live price changed. Refresh the estimate before submitting.',
        409,
      );
    const result = await request('/v1/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.id,
        prompt,
        seconds,
        aspect_ratio: '16:9',
        image_reference: [
          { file_id: firstFrame, role: 'first_frame' },
          { file_id: lastFrame, role: 'last_frame' },
        ],
      }),
    });
    return pass(result);
  } catch {
    return Response.json(
      {
        error:
          'Submission outcome is uncertain. Check AIand job history before retrying to avoid a duplicate charge.',
        uncertain: true,
      },
      { status: 502 },
    );
  }
}
