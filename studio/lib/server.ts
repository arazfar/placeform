import { env } from 'cloudflare:workers';
export function secret(name: string) {
  return (
    (env as unknown as Record<string, string>)[name] || process.env[name] || ''
  );
}
export function failure(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}
const limits = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string, max = 20) {
  const now = Date.now();
  const item = limits.get(key);
  if (!item || now - item.start > 3600000) {
    limits.set(key, { start: now, count: 1 });
    return false;
  }
  item.count++;
  return item.count > max;
}
export async function providerError(res: Response) {
  try {
    const v = (await res.json()) as { error?: { message?: string } | string };
    return typeof v.error === 'string'
      ? v.error
      : v.error?.message || `Provider returned ${res.status}.`;
  } catch {
    return `Provider returned ${res.status}.`;
  }
}
