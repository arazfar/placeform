export class VideoRequestError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
export async function videoJSON<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  const data = (await res.json()) as {
    error?: string;
    code?: string;
    uncertain?: boolean;
  };
  if (!res.ok)
    throw new VideoRequestError(
      data.error || 'Video request failed.',
      res.status,
      data.code,
      data.uncertain === true,
    );
  return data as T;
}
export async function imageForFilm(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error('The selected reference image could not be loaded.');
  const blob = await res.blob();
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ||
    !blob.size ||
    blob.size > 30 * 1024 * 1024
  )
    throw new Error('Choose a finished PNG, JPEG or WebP image under 30 MiB.');
  const bitmap = await createImageBitmap(blob);
  try {
    if (!bitmap.width || !bitmap.height)
      throw new Error('The selected image is empty.');
    // Contain, never crop: non-widescreen inputs receive visible black letterboxing.
    const width = 1920,
      height = 1080,
      scale = Math.min(width / bitmap.width, height / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error(
        'Reference image preparation is unavailable in this browser.',
      );
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    context.drawImage(
      bitmap,
      (width - bitmap.width * scale) / 2,
      (height - bitmap.height * scale) / 2,
      bitmap.width * scale,
      bitmap.height * scale,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error('Could not prepare the reference image.')),
        'image/png',
      ),
    );
  } finally {
    bitmap.close();
  }
}

// Share a content request between the featured player and background caching.
// Only in-flight blobs are retained in memory; durable copies live in IndexedDB.
const pendingFilms = new Map<
  string,
  Promise<{ blob: Blob; warning?: string }>
>();
export async function savedFilm(
  id: string,
): Promise<{ blob: Blob; warning?: string }> {
  const existing = pendingFilms.get(id);
  if (existing) return existing;
  const pending = (async () => {
    const { loadMedia, saveMedia } = await import('./media-store');
    try {
      const cached = await loadMedia(`video:${id}`);
      if (cached) return { blob: cached };
    } catch {
      /* stream online */
    }
    const res = await fetch(
      `/api/video?id=${encodeURIComponent(id)}&content=1`,
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        [404, 410].includes(res.status)
          ? 'This film is no longer available from AIand and has no saved copy in this browser.'
          : data.error || 'The film could not be loaded.',
      );
    }
    if (!res.headers.get('content-type')?.includes('video/'))
      throw new Error('The provider did not return a playable film.');
    const blob = await res.blob();
    if (!blob.size) throw new Error('The provider returned an empty film.');
    try {
      await saveMedia(`video:${id}`, blob);
      return { blob };
    } catch {
      return {
        blob,
        warning:
          'This browser could not save an offline copy. Download the MP4 to keep it.',
      };
    }
  })();
  pendingFilms.set(id, pending);
  try {
    return await pending;
  } finally {
    pendingFilms.delete(id);
  }
}
