import { AIandError } from './aiand-video';

export const MAX_VIDEO_REFERENCE_BYTES = 30 * 1024 * 1024;

// Read incrementally: Content-Length may be missing or inaccurate.
export async function readVideoReference(req: Request): Promise<File> {
  const type = (req.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const extension = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  }[type];
  if (!extension)
    throw new AIandError(
      'Upload a PNG, JPEG or WebP reference.',
      415,
      'invalid_reference',
    );
  const tooLarge = () =>
    new AIandError(
      'Reference image is too large. Limit: 30 MiB.',
      413,
      'reference_too_large',
    );
  if (Number(req.headers.get('content-length')) > MAX_VIDEO_REFERENCE_BYTES) {
    await req.body?.cancel();
    throw tooLarge();
  }
  const reader = req.body?.getReader();
  if (!reader)
    throw new AIandError('Choose a reference image.', 400, 'invalid_reference');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_VIDEO_REFERENCE_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  return new File(chunks, `reference.${extension}`, { type });
}
