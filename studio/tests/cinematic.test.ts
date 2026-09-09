import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cinematicPrompt,
  filmReference,
  referenceIssue,
  reconcileJobs,
  mergeProviderJob,
  isRunning,
  readSavedJobs,
  type VideoJob,
  type ProviderJob,
} from '../lib/cinematic';
import { createPortlandDemo } from '../lib/spec';
import {
  AIandVideo,
  AIandError,
  parseVideoInput,
  parseProviderJob,
} from '../lib/aiand-video';

const now = 1800000000;
const providerJob = (id = 'video_one'): ProviderJob => ({
  id,
  model: 'minimaxai/minimax-h3',
  prompt: 'A cinematic prompt',
  seconds: 10,
  created_at: now,
  status: 'queued',
  cost: '0.80',
  currency: 'usd',
});
const intent = (id = 'intent-one'): VideoJob => ({
  id,
  projectId: 'project',
  revision: 3,
  shot: 'push-in',
  status: 'submission-unknown',
  prompt: 'A cinematic prompt',
  seconds: 10,
  createdAt: new Date(now * 1000).toISOString(),
  concept: 'B',
  referenceLabel: 'Selected building',
  firstKey: `${id}:first`,
});
const catalog = {
  data: [
    {
      id: 'minimaxai/minimax-h3',
      pricing: [
        { resolution: '768p', per_second: '0.080000', currency: 'usd' },
      ],
    },
  ],
};
const request = {
  prompt: cinematicPrompt(10, 'push-in'),
  seconds: 10,
  firstFrame: 'file-start',
  expectedRate: '0.080000',
};
function fake(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  return ((url: string | URL | Request, init: RequestInit = {}) =>
    Promise.resolve(
      handler(
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
        init,
      ),
    )) as typeof fetch;
}
const json = (value: unknown, status = 200) => Response.json(value, { status });
const okPreflight = (url: string) =>
  url.endsWith('/models')
    ? json(catalog)
    : json({ accepted: true, version: '1' });

void test('selected concept and imported image determine the film reference independently of model', () => {
  const spec = createPortlandDemo();
  spec.concept = 'A';
  spec.assets.B = 'data:image/png;base64,custom';
  const snapshot = filmReference(spec, 'B', 'Chosen image');
  assert.equal(snapshot.image, spec.assets.B);
  assert.equal(snapshot.concept, 'B');
  spec.assets.B = 'data:image/png;base64,replaced';
  spec.concept = 'C';
  assert.equal(snapshot.image, 'data:image/png;base64,custom');
  assert.match(referenceIssue('/assets/concept-pending.svg')!, /finished/);
  assert.equal(referenceIssue(snapshot.image), null);
});
void test('default cinematic uses a single anchored shot, gentle camera and ambience without music', () => {
  const prompt = cinematicPrompt(10, 'push-in');
  assert.ok(prompt.startsWith('For the target video, at 0.00 seconds'));
  assert.match(prompt, /integrated_multimodal_description: \[Shot 1\]/);
  assert.match(prompt, /small amplitude at slow speed/);
  assert.match(prompt, /10-second/);
  assert.match(prompt, /overall_soundscape:/);
  assert.match(prompt, /non_diegetic_music: N\/A/);
  assert.doesNotMatch(prompt, /\[Shot 2\]|roof equipment|sandstone|canopy/);
  assert.match(cinematicPrompt(10, 'truck-right'), /trucks right/);
  assert.match(cinematicPrompt(8, 'push-in', true), /Picture 2.*8\.00-second/);
});
void test('provider updates retain immutable prompt, source keys and local revision', () => {
  const saved = intent();
  const next = mergeProviderJob(saved, {
    ...providerJob(),
    prompt: 'rewritten upstream',
    seconds: 8,
  });
  assert.equal(next.prompt, saved.prompt);
  assert.equal(next.seconds, 10);
  assert.equal(next.firstKey, saved.firstKey);
  assert.equal(next.revision, 3);
  assert.equal(next.concept, 'B');
  assert.equal(next.id, 'video_one');
});
void test('reconciliation refuses ambiguous intents, duplicate jobs and already assigned IDs', () => {
  const a = intent(),
    b = intent('intent-two'),
    remote = providerJob();
  assert.equal(reconcileJobs([a], [remote])[0].id, remote.id);
  assert.deepEqual(reconcileJobs([a, b], [remote]), [a, b]);
  assert.deepEqual(reconcileJobs([a], [remote, providerJob('video_two')]), [a]);
  const assigned = mergeProviderJob(b, remote);
  assert.deepEqual(reconcileJobs([a, assigned], [remote]), [a, assigned]);
});
void test('saved history retains active and unknown statuses; corrupt history is not silently discarded', () => {
  const job = { ...intent(), id: 'video_one', status: 'new_provider_stage' };
  assert.equal(isRunning(readSavedJobs(JSON.stringify([job]))[0]), true);
  assert.equal(isRunning({ ...job, status: 'completed' }), false);
  assert.throws(() => readSavedJobs('{}'));
  assert.throws(() => readSavedJobs('[{"id":42}]'));
});
void test('validated request uses only documented AIand video fields', async () => {
  let submitted: Record<string, unknown> | undefined;
  const api = new AIandVideo(
    'test',
    fake((url, init) => {
      if (init.method === 'POST') {
        submitted = JSON.parse(init.body as string);
        return json(providerJob());
      }
      return okPreflight(url);
    }),
  );
  await api.submit(request);
  assert.deepEqual(Object.keys(submitted!).sort(), [
    'aspect_ratio',
    'image_reference',
    'model',
    'prompt',
    'seconds',
  ]);
  assert.deepEqual(submitted!.image_reference, [
    { file_id: 'file-start', role: 'first_frame' },
  ]);
  assert.equal(submitted!.aspect_ratio, '16:9');
});
void test('invalid input and a changed quote never reach paid generation', async () => {
  let posts = 0;
  const api = new AIandVideo(
    'test',
    fake((url, init) => {
      if (init.method === 'POST') posts++;
      return okPreflight(url);
    }),
  );
  for (const seconds of [3, 16, 4.5])
    assert.throws(() => parseVideoInput({ ...request, seconds }));
  assert.throws(() =>
    parseVideoInput({ ...request, firstFrame: '/tmp/image' }),
  );
  assert.throws(() => parseVideoInput({ ...request, expectedRate: 'NaN' }));
  await assert.rejects(
    api.submit({ ...request, expectedRate: '0.01' }),
    (e: AIandError) => e.code === 'price_changed' && !e.uncertain,
  );
  assert.equal(posts, 0);
});
void test('upload verifies image signature and uses purpose=vision', async () => {
  let calls = 0;
  const api = new AIandVideo(
    'test',
    fake((_url, init) => {
      calls++;
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get('purpose'), 'vision');
      return json({ id: 'file-image' });
    }),
  );
  await assert.rejects(
    api.upload(new File(['invalid'], 'bad.png', { type: 'image/png' })),
    /bytes/,
  );
  await api.upload(
    new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'image.png', {
      type: 'image/png',
    }),
  );
  assert.equal(calls, 1);
});
void test('safe reads retry transient failures with bounded backoff', async () => {
  let calls = 0;
  const delays: number[] = [];
  const api = new AIandVideo(
    'test',
    fake(() =>
      ++calls < 3 ? json({ error: 'temporary' }, 503) : json(providerJob()),
    ),
    async (ms) => {
      delays.push(ms);
    },
  );
  assert.equal((await api.job('video_one')).id, 'video_one');
  assert.deepEqual(delays, [500, 1000]);
});
void test('submission transport failures and malformed success are uncertain and never retried', async () => {
  for (const mode of ['transport', 'malformed', 'server']) {
    let posts = 0;
    const api = new AIandVideo(
      'test',
      fake((url, init) => {
        if (init.method !== 'POST') return okPreflight(url);
        posts++;
        if (mode === 'transport') throw new Error('lost response');
        return mode === 'server'
          ? json({ error: 'upstream failed' }, 503)
          : json({ id: 'invalid' });
      }),
    );
    await assert.rejects(api.submit(request), (e: AIandError) => e.uncertain);
    assert.equal(posts, 1);
  }
});
void test('upload and preflight failures are certain; actionable provider errors survive', async () => {
  const api = new AIandVideo(
    'test',
    fake(() =>
      json(
        { error: { message: 'Accept terms', code: 'agreement_required' } },
        403,
      ),
    ),
  );
  await assert.rejects(
    api.submit(request),
    (e: AIandError) => e.code === 'agreement_required' && !e.uncertain,
  );
  const broken = new AIandVideo(
    'test',
    fake(() => {
      throw new Error('offline');
    }),
  );
  await assert.rejects(
    broken.upload(
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        'image.png',
        { type: 'image/png' },
      ),
    ),
    (e: AIandError) => !e.uncertain,
  );
});
void test('content proxy preserves range playback and separates inline and download disposition', async () => {
  const api = new AIandVideo(
    'test',
    fake((_url, init) => {
      assert.equal(new Headers(init.headers).get('range'), 'bytes=0-3');
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-range': 'bytes 0-3/100',
          'accept-ranges': 'bytes',
        },
      });
    }),
  );
  const response = await api.content('video_one', 'bytes=0-3', false);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/100');
  assert.match(response.headers.get('content-disposition')!, /^inline/);
  assert.match(
    (await api.content('video_one', 'bytes=0-3', true)).headers.get(
      'content-disposition',
    )!,
    /^attachment/,
  );
});
void test('malformed provider jobs and invalid content fail clearly', async () => {
  assert.throws(() => parseProviderJob({ ...providerJob(), id: 'other' }));
  assert.throws(() =>
    parseProviderJob({ ...providerJob(), error: { unexpected: true } }),
  );
  const api = new AIandVideo(
    'test',
    fake(() => json({ fake: 'video' })),
  );
  await assert.rejects(api.content('video_one', null, false), /playable video/);
});
