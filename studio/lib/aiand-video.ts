import type { ProviderJob } from './cinematic';
import { videoReferences } from './video-reference';
import { videoReadiness, type VideoCatalog } from './video-readiness';

export const VIDEO_MODEL = 'minimaxai/minimax-h3';
export class AIandError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = 'provider_error',
    public uncertain = false,
  ) {
    super(message);
  }
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function parseProviderJob(value: unknown): ProviderJob {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !/^video_[\w-]{1,180}$/.test(value.id) ||
    typeof value.status !== 'string' ||
    !value.status ||
    typeof value.model !== 'string' ||
    typeof value.prompt !== 'string' ||
    typeof value.seconds !== 'number' ||
    typeof value.created_at !== 'number'
  )
    throw new AIandError(
      'AIand returned an invalid job response.',
      502,
      'invalid_response',
    );
  if (
    value.error != null &&
    typeof value.error !== 'string' &&
    (!record(value.error) || typeof value.error.message !== 'string')
  )
    throw new AIandError(
      'AIand returned an invalid job error.',
      502,
      'invalid_response',
    );
  if (
    (value.cost != null && typeof value.cost !== 'string') ||
    (value.currency != null && typeof value.currency !== 'string')
  )
    throw new AIandError(
      'AIand returned an invalid job quote.',
      502,
      'invalid_response',
    );
  return value as ProviderJob;
}
export function parseVideoInput(body: unknown) {
  if (!record(body))
    throw new AIandError('Invalid cinematic request.', 400, 'invalid_request');
  const { prompt, seconds, firstFrame, lastFrame, expectedRate } = body;
  const references = videoReferences(firstFrame, lastFrame);
  if (
    typeof prompt !== 'string' ||
    prompt.trim().length < 8 ||
    prompt.length > 7000 ||
    typeof seconds !== 'number' ||
    !Number.isInteger(seconds) ||
    seconds < 4 ||
    seconds > 15 ||
    typeof expectedRate !== 'string' ||
    !expectedRate.trim() ||
    !Number.isFinite(Number(expectedRate)) ||
    Number(expectedRate) < 0 ||
    !references
  )
    throw new AIandError(
      'Use a prompt, 4–15 seconds, a valid reference image, and the current estimate.',
      400,
      'invalid_request',
    );
  return { prompt, seconds, references, expectedRate };
}
export class AIandVideo {
  constructor(
    private key: string,
    private fetcher: typeof fetch = fetch,
    private pause = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  private async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.key}`);
    const read = !init.method || init.method === 'GET';
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.fetcher(`https://api.aiand.com${path}`, {
          ...init,
          headers,
          cache: 'no-store',
          signal: AbortSignal.timeout(45000),
        });
        if (read && attempt < 2 && (res.status === 429 || res.status >= 500)) {
          await res.body?.cancel();
          await this.pause(500 * 2 ** attempt);
          continue;
        }
        if (!res.ok) {
          let value: unknown;
          try {
            value = await res.json();
          } catch {
            /* preserve HTTP status */
          }
          const error = record(value) ? value.error : undefined;
          const code =
            record(error) && typeof error.code === 'string'
              ? error.code
              : `http_${res.status}`;
          const message =
            typeof error === 'string'
              ? error
              : record(error) && typeof error.message === 'string'
                ? error.message
                : `AIand returned ${res.status}.`;
          throw new AIandError(
            message,
            res.status,
            code,
            !read && path === '/v1/videos' && res.status >= 500,
          );
        }
        return res;
      } catch (error) {
        if (error instanceof AIandError) throw error;
        if (read && attempt < 2) {
          await this.pause(500 * 2 ** attempt);
          continue;
        }
        throw new AIandError(
          'AIand could not be reached. Please check the connection.',
          502,
          'connection_error',
          !read && path === '/v1/videos',
        );
      }
    }
  }
  async catalog(): Promise<VideoCatalog> {
    const [models, agreement] = await Promise.all([
      this.request('/v1/videos/models').then((r) => r.json()),
      this.request('/v1/videos/acceptance').then((r) => r.json()),
    ]);
    if (!record(models) || !Array.isArray(models.data))
      throw new AIandError(
        'AIand returned an invalid model catalog.',
        502,
        'invalid_response',
      );
    const model = models.data.find((m) => record(m) && m.id === VIDEO_MODEL);
    if (
      model &&
      (!Array.isArray(model.pricing) ||
        model.pricing.some(
          (p: unknown) =>
            !record(p) ||
            typeof p.resolution !== 'string' ||
            typeof p.per_second !== 'string' ||
            typeof p.currency !== 'string',
        ))
    )
      throw new AIandError(
        'AIand returned invalid model pricing.',
        502,
        'invalid_response',
      );
    return {
      model: model || null,
      agreement:
        record(agreement) &&
        typeof agreement.accepted === 'boolean' &&
        typeof agreement.version === 'string'
          ? { accepted: agreement.accepted, version: agreement.version }
          : null,
      checkedAt: new Date().toISOString(),
    };
  }
  async upload(file: File) {
    if (
      !file.size ||
      file.size > 30 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    )
      throw new AIandError(
        'Upload a PNG, JPEG or WebP reference under 30 MiB.',
        400,
        'invalid_reference',
      );
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const signature =
      file.type === 'image/png'
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
        : file.type === 'image/jpeg'
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
            String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!signature)
      throw new AIandError(
        'The reference bytes do not match the image format.',
        400,
        'invalid_reference',
      );
    const form = new FormData();
    form.set('file', file);
    form.set('purpose', 'vision');
    const data: unknown = await (
      await this.request('/v1/files', { method: 'POST', body: form })
    ).json();
    if (
      !record(data) ||
      typeof data.id !== 'string' ||
      !/^file[-_][\w-]{1,180}$/.test(data.id)
    )
      throw new AIandError(
        'AIand did not return a valid uploaded image.',
        502,
        'invalid_response',
      );
    return { id: data.id };
  }
  async submit(body: unknown) {
    const input = parseVideoInput(body);
    const catalog = await this.catalog(),
      issue = videoReadiness(catalog);
    if (issue) throw new AIandError(issue, 409, 'not_ready');
    const price = catalog.model!.pricing.find((p) => p.resolution === '768p')!;
    if (price.per_second !== input.expectedRate)
      throw new AIandError(
        'The live price changed. Refresh the estimate and try again.',
        409,
        'price_changed',
      );
    const res = await this.request('/v1/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VIDEO_MODEL,
        prompt: input.prompt,
        seconds: input.seconds,
        aspect_ratio: '16:9',
        image_reference: input.references,
      }),
    });
    try {
      return parseProviderJob(await res.json());
    } catch {
      throw new AIandError(
        'Submission outcome is uncertain. Check job history before retrying.',
        502,
        'submission_unknown',
        true,
      );
    }
  }
  async job(id: string) {
    return parseProviderJob(
      await (await this.request(`/v1/videos/${id}`)).json(),
    );
  }
  async history(after?: string) {
    const result: unknown = await (
      await this.request(
        `/v1/videos?limit=20${after ? `&after=${encodeURIComponent(after)}` : ''}`,
      )
    ).json();
    if (!record(result) || !Array.isArray(result.data))
      throw new AIandError(
        'AIand returned invalid job history.',
        502,
        'invalid_response',
      );
    return {
      data: result.data.map(parseProviderJob),
      has_more: result.has_more === true,
    };
  }
  async content(id: string, range: string | null, download: boolean) {
    const res = await this.request(`/v1/videos/${id}/content`, {
      headers: range ? { Range: range } : undefined,
    });
    if (!res.headers.get('content-type')?.includes('video/'))
      throw new AIandError(
        'AIand did not return a playable video.',
        502,
        'invalid_content',
      );
    const headers = new Headers({
      'Content-Type': 'video/mp4',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="placeform-${id}.mp4"`,
      'Cache-Control': 'private, no-store',
    });
    for (const key of ['content-length', 'content-range', 'accept-ranges']) {
      const value = res.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new Response(res.body, { status: res.status, headers });
  }
}
