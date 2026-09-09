import { AIandError, AIandVideo } from '@/lib/aiand-video';
import { secret, failure, sameOrigin, rateLimit } from '@/lib/server';
const jobId = (id: string) => /^video_[A-Za-z0-9_-]{1,180}$/.test(id);
function provider() {
  const key = secret('AIAND_API_KEY');
  if (!key)
    throw new AIandError(
      'AIand is not connected. Add AIAND_API_KEY in the server settings to generate films.',
      503,
      'not_connected',
    );
  return new AIandVideo(key);
}
function errorResponse(error: unknown) {
  const e =
    error instanceof AIandError
      ? error
      : new AIandError(
          'Video request could not be processed. Please try again.',
          502,
        );
  return Response.json(
    {
      error: e.uncertain
        ? 'Submission outcome is uncertain. Check job history before retrying.'
        : e.message,
      code: e.code,
      uncertain: e.uncertain,
    },
    { status: e.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
const json = (data: unknown) =>
  Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
export async function GET(req: Request) {
  try {
    const api = provider(),
      url = new URL(req.url),
      id = url.searchParams.get('id'),
      after = url.searchParams.get('after');
    if ((id && !jobId(id)) || (after && !jobId(after)))
      return failure('Invalid video job ID.');
    if (id)
      return url.searchParams.has('content')
        ? api
            .content(
              id,
              req.headers.get('range'),
              url.searchParams.has('download'),
            )
            .catch(errorResponse)
        : json(await api.job(id));
    if (url.searchParams.has('history'))
      return json(await api.history(after || undefined));
    return json(await api.catalog());
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return failure('Origin is not allowed.', 403);
  if (rateLimit('video', 200))
    return failure(
      'Too many requests. Wait a moment before trying again.',
      429,
    );
  try {
    const api = provider();
    if (
      (req.headers.get('content-type') || '').includes('multipart/form-data')
    ) {
      if (Number(req.headers.get('content-length') || 0) > 31 * 1024 * 1024)
        return failure('Reference image is too large. Limit: 30 MiB.', 413);
      const form = await req.formData(),
        file = form.get('file');
      if (!(file instanceof File)) return failure('Choose a reference image.');
      return json(await api.upload(file));
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return failure('Invalid cinematic request.');
    }
    return json(await api.submit(body));
  } catch (error) {
    return errorResponse(error);
  }
}
