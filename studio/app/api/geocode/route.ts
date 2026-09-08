import { failure, rateLimit } from '@/lib/server';
const cache = new Map<string, unknown>();
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q || q.length < 3 || q.length > 180)
    return failure('Enter a place name with 3–180 characters.');
  if (cache.has(q)) return Response.json(cache.get(q));
  if (rateLimit('geocode', 40))
    return failure(
      'Search limit reached. Enter coordinates or try again later.',
      429,
    );
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent':
            'PlaceformStudio/1.0 (https://placeform-studio.razfar.chatgpt.site)',
          'Accept-Language': 'en',
        },
      },
    );
    if (!res.ok)
      return failure(
        'Map search is temporarily unavailable. Try coordinates such as 45.5134, -122.6653.',
        502,
      );
    const data = await res.json();
    cache.set(q, data);
    return Response.json(data);
  } catch {
    return failure(
      'Map search is offline. Coordinates can still be entered.',
      502,
    );
  }
}
