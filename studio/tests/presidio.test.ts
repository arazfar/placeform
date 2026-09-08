import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDemo,
  createPortlandDemo,
  applyConcept,
  effectiveConcept,
  canOpenModel,
  canReviewImage,
  reviewConcept,
  validSpec,
  conceptImage,
  clone,
  type BuildingSpec,
} from '../lib/spec';
import {
  SiteWorkflowController,
  freshSiteDesign,
  type SiteWorkflow,
} from '../lib/site-workflow';
import {
  applyGeneration,
  generationPrompt,
  type GenerationInput,
  type GenerationJob,
} from '../lib/generation';
import { encodeProjects, decodeProjects } from '../lib/persistence';
import { imageSettings } from '../lib/image-settings';
import { siteAt } from '../lib/site';
const png = 'data:image/png;base64,iVBORw0KGgo=';
function drawn() {
  const s = createDemo();
  return freshSiteDesign(s, s.site);
}
function harness() {
  let spec = drawn();
  let saved: SiteWorkflow | undefined;
  const posts: GenerationInput[] = [],
    cancelled: string[] = [];
  const jobs = new Map<string, GenerationJob>();
  const deps = {
    current: () => spec,
    apply: (next: BuildingSpec) => {
      spec = next;
    },
    save: async (run: SiteWorkflow) => {
      saved = clone(run);
    },
    connection: async () => ({ provider: 'openai' as const, nonce: '' }),
    call: async (
      _p: GenerationJob['provider'],
      _n: string,
      method: 'POST' | 'GET' | 'DELETE',
      id?: string,
      input?: GenerationInput,
    ): Promise<GenerationJob> => {
      if (method === 'GET') return clone(jobs.get(id!)!);
      if (method === 'DELETE') {
        cancelled.push(id!);
        return { ...jobs.get(id!)!, status: 'cancelled' };
      }
      posts.push(clone(input!));
      const job: GenerationJob = {
        id: `job-${posts.length}`,
        provider: 'openai',
        status: 'running',
        message: 'Generating',
      };
      jobs.set(job.id, job);
      return clone(job);
    },
  };
  return {
    controller: new SiteWorkflowController(deps),
    deps,
    posts,
    jobs,
    cancelled,
    get spec() {
      return spec;
    },
    set spec(s: BuildingSpec) {
      spec = s;
    },
    get saved() {
      return saved;
    },
    complete() {
      for (const job of jobs.values()) {
        job.status = 'completed';
        job.result = { image: png };
      }
    },
  };
}
void test('Presidio starts without a parcel or Portland assets; legacy projects remain intact', () => {
  const s = createDemo();
  assert.equal(validSpec(s), true);
  assert.equal(s.boundaryConfirmed, false);
  assert.equal(canOpenModel(s), false);
  assert.equal(s.site.location, 'San Francisco, California');
  assert.equal(s.evidence?.length, 8);
  for (const id of ['A', 'B', 'C', 'D'] as const)
    assert.equal(conceptImage(s, id), '/assets/concept-pending.svg');
  assert.ok(
    !JSON.stringify([s.evidence, s.directions, s.brief]).includes('Portland'),
  );
  const old = createPortlandDemo();
  assert.equal(validSpec(old), true);
  assert.equal(canOpenModel(old), true);
  assert.equal(conceptImage(old, 'A'), '/assets/concept-a.png');
});
void test('boundary installs prepared context and preserves dimensions and locks', () => {
  const s = createDemo();
  s.brief = 'Preserve a staffed public entrance and separate service access.';
  s.length = 97;
  s.height = 22;
  s.locks = ['massing', 'roof'];
  const next = freshSiteDesign(s, s.site);
  assert.equal(next.boundaryConfirmed, true);
  assert.equal(next.brief, s.brief);
  assert.equal(next.length, 97);
  assert.equal(next.height, 22);
  assert.deepEqual(next.locks, s.locks);
  assert.equal(next.siteDesignPending, false);
  assert.equal(next.directions?.length, 4);
  const elsewhere = freshSiteDesign(s, siteAt([0, 0], 'Elsewhere'));
  assert.equal(elsewhere.demoContext, undefined);
  assert.equal(elsewhere.researchReady, false);
  assert.deepEqual(elsewhere.evidence, []);
});
void test('concept selection preserves dimensions and same-direction mixed features', () => {
  const s = drawn();
  s.length = 99;
  s.width = 51;
  s.height = 23;
  s.roof = 'D';
  s.material = 'C';
  s.landscape = 'B';
  s.finDepth = 1.7;
  assert.deepEqual(effectiveConcept(s, 'A'), s);
  for (const id of ['A', 'B', 'C', 'D'] as const) {
    const next = applyConcept(s, id);
    assert.deepEqual([next.length, next.width, next.height], [99, 51, 23]);
  }
  s.locks = ['massing', 'roof', 'facade'];
  const next = effectiveConcept(s, 'B');
  assert.equal(next.concept, 'A');
  assert.equal(next.roof, 'D');
  assert.equal(next.material, 'C');
});
void test('image review gates 3D, persists losslessly, and supports locked massing', () => {
  let s = drawn();
  s.locks = ['massing'];
  s = applyGeneration(s, 'image', { image: png }, 'B');
  assert.equal(canOpenModel(s), false);
  assert.equal(canReviewImage(s, 'B'), true);
  const reviewed = reviewConcept(s, 'B');
  assert.equal(reviewed.concept, 'A');
  assert.equal(canOpenModel(reviewed), true);
  const restored = decodeProjects(
    encodeProjects({
      active: reviewed.id,
      projects: [{ project: reviewed, past: [s], future: [], saved: '' }],
    }),
  ).projects[0].project;
  assert.equal(validSpec(restored), true);
  assert.equal(canOpenModel(restored), true);
  assert.equal(restored.assets.B, png);
  assert.equal(
    canOpenModel(applyGeneration(restored, 'image', { image: png }, 'B')),
    false,
  );
});
void test('design drift invalidates image review while camera and daylight changes do not', () => {
  const s = applyGeneration(drawn(), 'image', { image: png }, 'A');
  assert.equal(canReviewImage({ ...s, view: 'aerial', hour: 8 }, 'A'), true);
  assert.equal(canReviewImage({ ...s, length: 100 }, 'A'), false);
  assert.throws(() => reviewConcept({ ...s, height: 20 }, 'A'));
});
void test('Sunburst max settings and prompt follow effective geometry and source precedence', () => {
  assert.deepEqual(imageSettings, {
    model: 'gpt-image-2.5-sunburst',
    quality: 'max',
    size: '1536x1024',
    output_format: 'png',
  });
  const s = drawn();
  s.roof = 'D';
  s.material = 'C';
  s.locks = ['roof'];
  const prompt = generationPrompt({
    kind: 'image',
    spec: s,
    concept: 'A',
    prompt: 'Refine the entrance.',
  });
  for (const text of [
    'facade C, roof D',
    'do not browse external links',
    'Locked features take precedence',
  ])
    assert.ok(prompt.includes(text));
  assert.ok(!prompt.includes('infrastructure-forms'));
  assert.ok(!prompt.includes('Portland'));
});
void test('workflow submits one image, no research or directions, then requires review', async () => {
  const h = harness();
  await assert.rejects(h.controller.start(createDemo()), /boundary/);
  await h.controller.start(h.spec);
  await h.controller.tick();
  assert.deepEqual(
    h.posts.map((p) => p.kind),
    ['image'],
  );
  h.complete();
  await h.controller.tick();
  await h.controller.tick();
  assert.equal(h.controller.run?.status, 'completed');
  assert.equal(h.spec.assets.A, png);
  assert.equal(canOpenModel(h.spec), false);
  assert.equal(canOpenModel(reviewConcept(h.spec, 'A')), true);
  assert.equal(h.posts.length, 1);
});
void test('reload recovers the image receipt without duplicate submission', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await h.controller.tick();
  h.complete();
  await h.controller.tick();
  const resumed = new SiteWorkflowController(h.deps);
  resumed.run = clone(h.saved!);
  await resumed.tick();
  assert.equal(resumed.run.status, 'completed');
  assert.equal(h.posts.length, 1);
  assert.equal(h.spec.assets.A, png);
});
void test('stale image pauses, cancellation excludes results, failed jobs retry', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await h.controller.tick();
  h.spec = { ...h.spec, length: 100 };
  h.complete();
  await h.controller.tick();
  assert.equal(h.controller.run?.status, 'paused');
  assert.deepEqual(h.spec.assets, {});
  await h.controller.stop();
  assert.deepEqual(h.cancelled, ['job-1']);
  const r = harness();
  await r.controller.start(r.spec);
  await r.controller.tick();
  r.jobs.get('job-1')!.status = 'failed';
  await r.controller.tick();
  assert.equal(r.controller.run?.status, 'failed');
  await r.controller.retry();
  await r.controller.tick();
  assert.equal(r.posts.length, 2);
  assert.ok(r.posts.every((p) => p.kind === 'image'));
});

void test('automatic image targets the selected direction rather than the active massing', async () => {
  const h = harness();
  await h.controller.start(h.spec, 'C');
  await h.controller.tick();
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0].concept, 'C');
  h.complete();
  await h.controller.tick();
  assert.equal(h.spec.assets.C, png);
  assert.equal(h.spec.assets.A, undefined);
});
