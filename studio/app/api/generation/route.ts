import {
  secret,
  failure,
  sameOrigin,
  providerError,
  rateLimit,
} from '@/lib/server';
import {
  generationPrompt,
  resultSchema,
  validGenerationInput,
  validateResult,
  type GenerationKind,
  type GenerationJob,
} from '@/lib/generation';

type ProviderResponse = {
  id: string;
  status: string;
  metadata?: { kind: GenerationKind };
  error?: { message?: string };
  incomplete_details?: { reason?: string };
  usage?: Record<string, unknown>;
  output?: {
    type: string;
    result?: string;
    usage?: Record<string, unknown>;
    content?: { type: string; text?: string }[];
  }[];
};
function normalize(data: ProviderResponse): GenerationJob {
  const job: GenerationJob = {
    id: data.id,
    provider: 'openai',
    status:
      data.status === 'completed'
        ? 'completed'
        : data.status === 'cancelled'
          ? 'cancelled'
          : ['failed', 'incomplete'].includes(data.status)
            ? 'failed'
            : 'running',
    message: 'OpenAI is working on your project…',
    usage: data.usage,
  };
  if (job.status === 'failed')
    job.message =
      data.error?.message ||
      `Generation ended: ${data.incomplete_details?.reason || data.status}. Review your settings before retrying.`;
  if (job.status === 'cancelled')
    job.message = 'Cancelled. No changes were applied.';
  if (job.status === 'completed') {
    const imageUsage = data.output?.find(
      (x) => x.type === 'image_generation_call',
    )?.usage;
    if (imageUsage) job.usage = { ...job.usage, image_generation: imageUsage };
    try {
      const kind = data.metadata?.kind;
      if (!kind)
        throw new Error('This response does not belong to a Placeform job.');
      const image = data.output?.find(
        (x) => x.type === 'image_generation_call',
      )?.result;
      const text =
        data.output
          ?.flatMap((x) => x.content || [])
          .filter((x) => x.type === 'output_text')
          .map((x) => x.text)
          .join('') || '';
      job.result = validateResult(
        kind,
        kind === 'image'
          ? { image: image ? `data:image/png;base64,${image}` : undefined }
          : JSON.parse(text),
      );
      job.message = 'Ready for your review.';
    } catch (error) {
      job.status = 'failed';
      job.message = (error as Error).message;
    }
  }
  return job;
}
async function call(path: string, init: RequestInit = {}) {
  const key = secret('OPENAI_API_KEY');
  if (!key)
    throw new Error('The OpenAI API key is not configured on this server.');
  const response = await fetch(`https://api.openai.com/v1/responses${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(await providerError(response));
  return (await response.json()) as ProviderResponse;
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return failure('Same-origin requests only.', 403);
  if (rateLimit('generation', 30))
    return failure('Hourly generation limit reached. Try again later.', 429);
  try {
    const text = await req.text();
    if (text.length > 9_000_000)
      return failure('The request is too large.', 413);
    const input = JSON.parse(text);
    if (!validGenerationInput(input))
      return failure('Invalid project or generation request.');
    const image = input.kind === 'image';
    const prompt = generationPrompt(input).replace(
      'Save the generated image and return its absolute imagePath as JSON.',
      'Return the generated image using the image generation tool.',
    );
    const body = {
      model: image ? 'gpt-5' : 'gpt-5-mini',
      background: true,
      store: true,
      max_output_tokens: image ? 2000 : 10000,
      reasoning: { effort: 'low' },
      metadata: { kind: input.kind, projectId: input.spec.id.slice(0, 128) },
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            ...(input.reference
              ? [{ type: 'input_image', image_url: input.reference }]
              : []),
          ],
        },
      ],
      ...(image
        ? {
            tools: [
              {
                type: 'image_generation',
                model: 'gpt-image-2',
                quality: 'medium',
                size: '1536x1024',
                output_format: 'png',
              },
            ],
            tool_choice: { type: 'image_generation' },
            max_tool_calls: 1,
          }
        : {
            text: {
              format: {
                type: 'json_schema',
                name: 'placeform_result',
                strict: true,
                schema: resultSchema(input.kind),
              },
            },
            ...(input.kind === 'research'
              ? { tools: [{ type: 'web_search' }], max_tool_calls: 8 }
              : {}),
          }),
    };
    const result = await call('', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return Response.json(normalize(result), { status: 202 });
  } catch (error) {
    return failure((error as Error).message, 502);
  }
}
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^resp_[a-zA-Z0-9_-]{10,200}$/.test(id))
    return failure('Invalid job ID.');
  try {
    return Response.json(normalize(await call(`/${id}`)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure((error as Error).message, 502);
  }
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return failure('Same-origin requests only.', 403);
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^resp_[a-zA-Z0-9_-]{10,200}$/.test(id))
    return failure('Invalid job ID.');
  try {
    return Response.json(
      normalize(await call(`/${id}/cancel`, { method: 'POST' })),
    );
  } catch (error) {
    return failure((error as Error).message, 502);
  }
}
