import { secret } from '@/lib/server';
export async function GET() {
  return Response.json(
    {
      voice: !!secret('OPENAI_API_KEY'),
      video: !!secret('AIAND_API_KEY'),
      voiceModel: secret('OPENAI_REALTIME_MODEL') || 'gpt-realtime-2.1',
      videoModel: 'minimaxai/minimax-h3',
      generation: !!secret('OPENAI_API_KEY'),
      assetGeneration: 'openai-sunburst-max',
      research: 'codex-or-openai',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
