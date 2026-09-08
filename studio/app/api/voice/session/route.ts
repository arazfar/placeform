import {
  secret,
  failure,
  sameOrigin,
  rateLimit,
  providerError,
} from '@/lib/server';
import { actionTool } from '@/lib/commands';
import { validSpec } from '@/lib/spec';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return failure('Origin is not allowed.', 403);
  const key = secret('OPENAI_API_KEY');
  if (!key)
    return failure(
      'OpenAI voice is not connected. Set OPENAI_API_KEY on the server. Typed design commands work without a key.',
      503,
    );
  if (rateLimit('voice', 20))
    return failure('Session limit reached. Please try again later.', 429);
  try {
    if (Number(req.headers.get('content-length') || 0) > 100000)
      return failure('Session request is too large.', 413);
    const { sdp, spec, selected } = (await req.json()) as {
      sdp: unknown;
      spec: unknown;
      selected?: string;
    };
    if (typeof sdp !== 'string' || sdp.length > 40000 || !validSpec(spec))
      return failure('Invalid session configuration.');
    const form = new FormData();
    form.set('sdp', sdp);
    form.set(
      'session',
      JSON.stringify({
        type: 'realtime',
        model: secret('OPENAI_REALTIME_MODEL') || 'gpt-realtime-2.1',
        instructions: `You are Placeform, a concise architectural design collaborator. Ground every request in the current building spec, selected feature and locks. Use update_design to change the model; never claim success before its result. If a reference is ambiguous ask one short question. Respect locked features. For research, new concepts, or image refinement use generate with prompt starting research:, concepts:, or image: respectively. The app opens an in-app generation job for review; never mention task exports or handoffs. Do not invent performance or site facts. Keep spoken feedback under 20 words. Current specification: ${JSON.stringify(spec)}. Selected feature: ${selected || 'none'}.`,
        tools: [actionTool],
        tool_choice: 'auto',
        audio: {
          input: {
            transcription: { model: 'gpt-4o-mini-transcribe' },
            turn_detection: { type: 'semantic_vad' },
          },
          output: { voice: 'marin' },
        },
      }),
    );
    const res = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) return failure(await providerError(res), res.status);
    return new Response(await res.text(), {
      headers: {
        'Content-Type': 'application/sdp',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return failure(
      'Voice connection failed. Check the server connection and try again.',
      502,
    );
  }
}
