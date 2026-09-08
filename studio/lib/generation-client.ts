import type { GenerationInput, GenerationJob } from './generation';
export type Connection = {
  available: boolean;
  message: string;
  nonce?: string;
};
export async function generationJSON<T = GenerationJob>(
  response: Response,
): Promise<T> {
  const data = (await response.json()) as { error?: string };
  if (!response.ok)
    throw new Error(data.error || 'The generation service is unavailable.');
  return data as T;
}
export async function generationConnection() {
  const [local, api] = await Promise.all([
    fetch('/api/codex')
      .then((r) => generationJSON<Connection>(r))
      .catch(
        () =>
          ({ available: false, message: 'Codex unavailable.' }) as Connection,
      ),
    fetch('/api/status')
      .then((r) => generationJSON<{ generation: boolean }>(r))
      .catch(() => ({ generation: false })),
  ]);
  return { local, api: api.generation };
}
export async function generationCall(
  provider: GenerationJob['provider'],
  nonce: string,
  method: 'POST' | 'GET' | 'DELETE',
  id?: string,
  input?: GenerationInput,
) {
  return fetch(
    `${provider === 'codex' ? '/api/codex' : '/api/generation'}${id ? `?id=${encodeURIComponent(id)}` : ''}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-placeform-token': nonce,
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    },
  ).then((r) => generationJSON(r));
}
