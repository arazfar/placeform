import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SiteWorkflowController,
  freshSiteDesign,
  workflowFingerprint,
  type SiteWorkflow,
} from '../lib/site-workflow';
import {
  clone,
  concepts,
  createDemo,
  validSpec,
  conceptImage,
} from '../lib/spec';
import { siteAt } from '../lib/site';
import type { GenerationInput, GenerationJob } from '../lib/generation';
import { sources } from '../lib/research';
function harness() {
  let spec = freshSiteDesign(createDemo(), siteAt([-73.9, 40.7], 'New site'));
  let saved: SiteWorkflow | undefined;
  const posts: GenerationInput[] = [],
    cancelled: string[] = [],
    applied: string[] = [];
  const jobs = new Map<string, GenerationJob>();
  let available = true;
  const deps = {
    current: () => spec,
    apply: (next: typeof spec) => {
      spec = next;
      applied.push(workflowFingerprint(next));
    },
    save: async (run: SiteWorkflow) => {
      saved = clone(run);
    },
    connection: async () => ({
      provider: available ? ('codex' as const) : undefined,
      nonce: '',
    }),
    call: async (
      _provider: GenerationJob['provider'],
      _nonce: string,
      method: 'POST' | 'GET' | 'DELETE',
      id?: string,
      input?: GenerationInput,
    ): Promise<GenerationJob> => {
      if (method === 'DELETE') {
        cancelled.push(id!);
        return { ...jobs.get(id!)!, status: 'cancelled' };
      }
      if (method === 'GET') return clone(jobs.get(id!)!);
      posts.push(clone(input!));
      const job: GenerationJob = {
        id: `job-${posts.length}`,
        provider: 'codex',
        status: 'running',
        message: 'Running',
      };
      jobs.set(job.id, job);
      return clone(job);
    },
  };
  const controller = new SiteWorkflowController(deps);
  function complete() {
    for (const [id, job] of jobs) {
      const input = posts[Number(id.split('-')[1]) - 1];
      job.status = 'completed';
      job.result =
        input.kind === 'research'
          ? { brief: 'Local evidence', sources: sources.slice(0, 4) }
          : input.kind === 'concepts'
            ? { directions: clone(concepts) }
            : { image: 'data:image/png;base64,YQ==' };
    }
  }
  return {
    controller,
    deps,
    posts,
    jobs,
    cancelled,
    applied,
    complete,
    get spec() {
      return spec;
    },
    set spec(s) {
      spec = s;
    },
    get saved() {
      return saved;
    },
    set available(v: boolean) {
      available = v;
    },
  };
}
void test('fresh site preserves dimensions and selection, clears locks and demo assets, remains valid', () => {
  const original = createDemo();
  original.locks = ['facade'];
  original.concept = 'C';
  const fresh = freshSiteDesign(original, siteAt([0, 0], 'Fresh'));
  assert.equal(fresh.height, original.height);
  assert.equal(fresh.concept, 'C');
  assert.deepEqual(fresh.locks, []);
  assert.deepEqual(fresh.evidence, []);
  assert.equal(fresh.directions, undefined);
  assert.equal(validSpec(fresh), true);
  assert.equal(conceptImage(fresh, 'A'), '/assets/concept-pending.svg');
  assert.deepEqual(original.locks, ['facade']);
});
void test('research then directions then four concurrent images apply without approvals', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await h.controller.tick();
  assert.deepEqual(
    h.posts.map((p) => p.kind),
    ['research'],
  );
  h.complete();
  await h.controller.tick();
  await h.controller.tick();
  assert.equal(h.posts[1].kind, 'concepts');
  assert.equal(h.posts[1].spec.brief, 'Local evidence');
  h.complete();
  await h.controller.tick();
  await h.controller.tick();
  assert.equal(h.posts.length, 6);
  assert.deepEqual(
    h.posts.slice(2).map((p) => p.concept),
    ['A', 'B', 'C', 'D'],
  );
  for (const p of h.posts.slice(2)) {
    assert.ok(p.spec.directions);
    assert.equal(p.reference, undefined);
  }
  h.complete();
  for (let i = 0; i < 6; i++) await h.controller.tick();
  assert.equal(h.controller.run?.status, 'completed');
  assert.equal(h.applied.length, 6);
  assert.equal(Object.keys(h.spec.assets).length, 4);
});
void test('reload recovers known jobs and application receipts without duplicates', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await h.controller.tick();
  const recovered = new SiteWorkflowController(h.deps);
  recovered.run = clone(h.saved!);
  await recovered.tick();
  assert.equal(h.posts.length, 1);
  h.complete();
  await recovered.tick();
  assert.ok(h.saved?.pending);
  const afterApply = new SiteWorkflowController(h.deps);
  afterApply.run = clone(h.saved!);
  await afterApply.tick();
  assert.equal(h.applied.length, 1);
  assert.equal(h.posts.length, 2);
});
void test('receipt recovers when project persistence lagged behind workflow persistence', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await h.controller.tick();
  const before = clone(h.spec);
  h.complete();
  await h.controller.tick();
  h.spec = before;
  const recovered = new SiteWorkflowController(h.deps);
  recovered.run = clone(h.saved!);
  await recovered.tick();
  assert.equal(h.spec.brief, 'Local evidence');
  assert.equal(h.posts.length, 2);
});
void test('camera changes are allowed; manual design edits and project switching pause', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await h.controller.tick();
  h.spec = { ...h.spec, view: 'aerial', hour: 9 };
  h.complete();
  await h.controller.tick();
  assert.equal(h.spec.view, 'aerial');
  assert.equal(h.spec.hour, 9);
  await h.controller.tick();
  h.spec = { ...h.spec, height: 20 };
  h.complete();
  await h.controller.tick();
  assert.equal(h.controller.run?.status, 'paused');
  assert.equal(h.spec.directions, undefined);
  await h.controller.retry();
  assert.equal(h.controller.run?.status, 'paused');
  h.spec = { ...h.spec, id: 'different-project' };
  await h.controller.tick();
  assert.equal(h.posts.length, 2);
});
void test('superseding a run cancels old jobs and excludes stale results', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await h.controller.tick();
  h.spec = freshSiteDesign(h.spec, siteAt([1, 1], 'Next'));
  await h.controller.start(h.spec);
  await h.controller.tick();
  assert.ok(h.cancelled.includes('job-1'));
  assert.equal(h.posts.length, 2);
  assert.equal(h.posts[1].spec.site.name, 'Next');
  assert.equal(h.applied.length, 0);
});
void test('Stop prevents submission and known job results from applying', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await h.controller.tick();
  await h.controller.stop();
  h.complete();
  await h.controller.tick();
  assert.equal(h.applied.length, 0);
  assert.equal(h.posts.length, 1);
  assert.deepEqual(h.cancelled, ['job-1']);
});
void test('unknown submission cannot automatically retry; known failed jobs can', async () => {
  const h = harness();
  const c = new SiteWorkflowController({
    ...h.deps,
    call: async () => {
      throw new Error('Network lost');
    },
  });
  await c.start(h.spec);
  await c.tick();
  assert.equal(c.run?.status, 'failed');
  await c.retry();
  assert.equal(c.run?.status, 'failed');
  assert.match(c.run!.message, /unknown/);
  const good = harness();
  await good.controller.start(good.spec);
  await good.controller.tick();
  good.jobs.get('job-1')!.status = 'failed';
  await good.controller.tick();
  await good.controller.retry();
  await good.controller.tick();
  assert.equal(good.posts.length, 2);
});
void test('connection failure resumes without losing outputs', async () => {
  const h = harness();
  h.available = false;
  await h.controller.start(h.spec);
  await h.controller.tick();
  assert.equal(h.posts.length, 0);
  assert.equal(h.controller.run?.status, 'failed');
  h.available = true;
  await h.controller.retry();
  await h.controller.tick();
  assert.equal(h.posts.length, 1);
});
void test('partial image failure retries only the missing output', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await h.controller.tick();
  h.complete();
  await h.controller.tick();
  await h.controller.tick();
  h.complete();
  await h.controller.tick();
  await h.controller.tick();
  h.complete();
  h.jobs.get('job-3')!.status = 'failed';
  for (let i = 0; i < 5; i++) await h.controller.tick();
  assert.equal(Object.keys(h.spec.assets).length, 3);
  assert.equal(h.controller.run?.status, 'failed');
  await h.controller.retry();
  await h.controller.tick();
  assert.equal(h.posts.length, 7);
  assert.equal(h.posts[6].concept, 'A');
});
void test('undo immediately after auto-application pauses rather than reapplying the receipt', async () => {
  const h = harness();
  const before = clone(h.spec);
  await h.controller.start(h.spec);
  await h.controller.tick();
  h.complete();
  await h.controller.tick();
  h.spec = before;
  await h.controller.tick();
  assert.equal(h.controller.run?.status, 'paused');
  assert.equal(h.applied.length, 1);
});
void test('in-flight submission is cancelled if a newer boundary arrives', async () => {
  const h = harness();
  let release!: (job: GenerationJob) => void;
  const c = new SiteWorkflowController({
    ...h.deps,
    call: async (...args) => {
      if (args[2] === 'POST')
        return new Promise<GenerationJob>((resolve) => {
          release = resolve;
        });
      return h.deps.call(...args);
    },
  });
  await c.start(h.spec);
  const tick = c.tick();
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  const oldId = c.run!.id;
  h.spec = freshSiteDesign(h.spec, siteAt([2, 2], 'Latest'));
  await c.start(h.spec);
  release({
    id: 'late-job',
    provider: 'codex',
    status: 'running',
    message: '',
  });
  await tick;
  assert.notEqual(c.run!.id, oldId);
  assert.equal(h.saved!.id, c.run!.id);
  assert.ok(h.cancelled.includes('late-job'));
  assert.equal(h.applied.length, 0);
});
void test('serialized ticks submit only once even when multiple callers request progress', async () => {
  const h = harness();
  await h.controller.start(h.spec);
  await Promise.all([
    h.controller.tick(),
    h.controller.tick(),
    h.controller.tick(),
  ]);
  assert.equal(h.posts.length, 1);
});
