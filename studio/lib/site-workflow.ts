import {
  applyGeneration,
  type GenerationInput,
  type GenerationJob,
  type GenerationKind,
} from './generation';
import { preparedPresidio, presidioBrief, withinPresidio } from './presidio';
import {
  presidioConcepts,
  clone,
  type BuildingSpec,
  type ConceptId,
  type Site,
} from './spec';

export function workflowFingerprint(s: BuildingSpec) {
  const { revision: _r, view: _v, hour: _h, ...rest } = s;
  return JSON.stringify(rest);
}
export function freshSiteDesign(s: BuildingSpec, site: Site): BuildingSpec {
  const demo = s.demoContext === 'presidio' && withinPresidio(site);
  const next: BuildingSpec = {
    ...s,
    site,
    locks: s.locks,
    boundaryConfirmed: true,
    demoContext: demo ? 'presidio' : undefined,
    researchReady: false,
    evidence: [],
    directions: undefined,
    assets: {},
    imageReviews: {},
    siteDesignPending: true,
    brief: 'Researching this site and preparing four design directions…',
  };
  delete next.reviewedConcept;
  return demo
    ? {
        ...preparedPresidio(next),
        brief: s.brief || presidioBrief,
        directions: presidioConcepts,
        siteDesignPending: false,
      }
    : next;
}
type Step = {
  kind: GenerationKind;
  concept: ConceptId;
  job?: GenerationJob;
  submitting?: boolean;
  applied?: boolean;
};
export type SiteWorkflow = {
  id: string;
  projectId: string;
  boundary: string;
  expected: string;
  status: 'running' | 'paused' | 'failed' | 'stopped' | 'completed';
  message: string;
  provider?: GenerationJob['provider'];
  steps: Step[];
  pending?: { before: string; spec: BuildingSpec; step: number };
};
export type WorkflowDependencies = {
  current: () => BuildingSpec;
  apply: (spec: BuildingSpec) => void;
  save: (run: SiteWorkflow) => Promise<void>;
  connection: () => Promise<{
    provider?: GenerationJob['provider'];
    nonce: string;
  }>;
  call: (
    provider: GenerationJob['provider'],
    nonce: string,
    method: 'POST' | 'GET' | 'DELETE',
    id?: string,
    input?: GenerationInput,
  ) => Promise<GenerationJob>;
};
// A single serialized driver owns submissions, result application, and durable checkpoints.
export class SiteWorkflowController {
  run?: SiteWorkflow;
  private busy = false;
  private appliedReceipts = new Set<string>();
  private saves = Promise.resolve();
  constructor(private deps: WorkflowDependencies) {}
  private save(run: SiteWorkflow) {
    if (this.run !== run) return Promise.resolve();
    const snapshot = clone(run);
    this.saves = this.saves
      .catch(() => {})
      .then(() => this.deps.save(snapshot));
    return this.saves;
  }
  async start(spec: BuildingSpec, selected: ConceptId = spec.concept) {
    if (spec.demoContext && !spec.boundaryConfirmed)
      throw new Error('Draw the study boundary first.');
    if (this.run) void this.cancel(this.run);
    const run: SiteWorkflow = {
      id: crypto.randomUUID(),
      projectId: spec.id,
      boundary: JSON.stringify(spec.site.polygon.geometry),
      expected: workflowFingerprint(spec),
      status: 'running',
      message: 'Connecting…',
      steps:
        spec.demoContext === 'presidio'
          ? [{ kind: 'image', concept: selected }]
          : [
              { kind: 'research', concept: spec.concept },
              { kind: 'concepts', concept: spec.concept },
              ...(['A', 'B', 'C', 'D'] as ConceptId[]).map((concept) => ({
                kind: 'image' as const,
                concept,
              })),
            ],
    };
    this.run = run;
    await this.save(run);
  }
  private async cancel(run: SiteWorkflow) {
    run.status = 'stopped';
    try {
      const { nonce } = await this.deps.connection();
      await Promise.all(
        run.steps
          .filter((s) => s.job && ['queued', 'running'].includes(s.job.status))
          .map((s) =>
            this.deps
              .call(s.job!.provider, nonce, 'DELETE', s.job!.id)
              .catch(() => {}),
          ),
      );
    } catch {
      /* Stale results remain excluded even if cancellation is unavailable. */
    }
  }
  async stop() {
    const run = this.run;
    if (!run) return;
    run.status = 'stopped';
    run.message = 'Stopped. Edit the boundary to start a new design.';
    await this.save(run);
    await this.cancel(run);
  }
  async retry() {
    const run = this.run;
    if (!run || !['failed', 'paused'].includes(run.status)) return;
    if (run.steps.some((s) => s.submitting && !s.job)) {
      run.message =
        'Submission outcome unknown. Reconcile provider history before starting another design.';
      await this.save(run);
      return;
    }
    if (workflowFingerprint(this.deps.current()) !== run.expected) {
      run.message =
        'Design changed. Undo those changes or edit the boundary to start a fresh design.';
      await this.save(run);
      return;
    }
    for (const step of run.steps)
      if (
        !step.applied &&
        step.job &&
        ['failed', 'cancelled'].includes(step.job.status)
      )
        step.job = undefined;
    run.status = 'running';
    run.message = 'Resuming…';
    await this.save(run);
  }
  private active(run: SiteWorkflow) {
    return this.run === run && run.status === 'running';
  }
  private matches(run: SiteWorkflow) {
    if (!this.active(run)) return false;
    if (workflowFingerprint(this.deps.current()) === run.expected) return true;
    run.status = 'paused';
    run.message = 'Design changed. Automatic application paused.';
    return false;
  }
  async observe() {
    const run = this.run;
    if (!run || !this.active(run)) return;
    if (
      run.pending &&
      !this.appliedReceipts.has(`${run.id}:${run.pending.step}`)
    )
      return;
    if (!this.matches(run)) await this.save(run);
  }
  async tick() {
    const run = this.run;
    if (this.busy || !run || run.status !== 'running') return;
    this.busy = true;
    try {
      // Write-ahead application permits recovery on either side of a browser project save.
      if (run.pending) {
        const current = workflowFingerprint(this.deps.current());
        const after = workflowFingerprint(run.pending.spec);
        if (
          current === run.pending.before &&
          !this.appliedReceipts.has(`${run.id}:${run.pending.step}`)
        )
          this.deps.apply({
            ...run.pending.spec,
            view: this.deps.current().view,
            hour: this.deps.current().hour,
          });
        else if (current !== after) {
          run.status = 'paused';
          run.message =
            'Design changed while recovering. Automatic application paused.';
          await this.save(run);
          return;
        }
        run.expected = after;
        run.steps[run.pending.step].applied = true;
        run.pending = undefined;
        await this.save(run);
      }
      if (!this.matches(run)) {
        await this.save(run);
        return;
      }
      const connection = await this.deps.connection();
      if (!this.matches(run)) {
        await this.save(run);
        return;
      }
      if (!run.provider) run.provider = connection.provider;
      if (
        this.deps.current().demoContext &&
        run.provider &&
        run.provider !== 'openai'
      )
        throw new Error(
          'Sunburst requires the OpenAI API connection; no fallback was used.',
        );
      if (!run.provider)
        throw new Error(
          this.deps.current().demoContext
            ? 'Configure the OpenAI API for Sunburst at maximum quality, then Retry.'
            : 'Connect Codex or configure the OpenAI API, then Retry.',
        );
      for (let i = 0; i < run.steps.length; i++) {
        const step = run.steps[i];
        if (step.applied) continue;
        if (
          (i > 0 && !run.steps[0].applied) ||
          (i > 1 && !run.steps[1].applied)
        )
          break;
        if (!this.matches(run)) break;
        if (step.submitting && !step.job)
          throw new Error(
            'Submission outcome unknown. Reconcile provider history before starting another design.',
          );
        if (!step.job) {
          step.submitting = true;
          run.message =
            step.kind === 'research'
              ? 'Researching this place…'
              : step.kind === 'concepts'
                ? 'Creating four directions…'
                : 'Generating concept images…';
          await this.save(run); // Persist intent BEFORE any provider side effect.
          if (!this.matches(run)) break;
          const job = await this.deps.call(
            run.provider,
            connection.nonce,
            'POST',
            undefined,
            {
              kind: step.kind,
              concept: step.concept,
              spec: { ...this.deps.current(), assets: {} },
              prompt:
                step.kind === 'image'
                  ? `Create a fresh visualization of direction ${step.concept} for this site.`
                  : 'Develop the complete design package for this site.',
            },
          );
          step.job = job;
          step.submitting = false;
          if (!this.active(run)) {
            if (this.run === run) await this.save(run);
            await this.deps
              .call(job.provider, connection.nonce, 'DELETE', job.id)
              .catch(() => {});
            return;
          }
          await this.save(run);
        } else if (['queued', 'running'].includes(step.job.status)) {
          step.job = await this.deps.call(
            step.job.provider,
            connection.nonce,
            'GET',
            step.job.id,
          );
          if (!this.active(run)) return;
          await this.save(run);
        }
        if (!this.matches(run)) break;
        if (step.job.status === 'completed') {
          let next: BuildingSpec;
          try {
            if (!step.job.result)
              throw new Error('The completed job has no result.');
            next = applyGeneration(
              this.deps.current(),
              step.kind,
              step.job.result,
              step.concept,
            );
          } catch (error) {
            step.job.status = 'failed';
            step.job.message = (error as Error).message;
            throw error;
          }
          run.pending = { before: run.expected, spec: next, step: i };
          await this.save(run);
          if (!this.matches(run)) break;
          this.deps.apply({
            ...next,
            view: this.deps.current().view,
            hour: this.deps.current().hour,
          });
          this.appliedReceipts.add(`${run.id}:${i}`);
          run.expected = workflowFingerprint(next);
          step.applied = true;
          // Retain receipt until the next tick, allowing the normal project save to finish.
          await this.save(run);
          return;
        }
      }
      const failed = run.steps.find(
        (s) => s.job && ['failed', 'cancelled'].includes(s.job.status),
      );
      if (failed)
        throw new Error(
          failed.job!.message ||
            'Generation failed. Retry to continue missing outputs.',
        );
      if (run.steps.every((s) => s.applied)) {
        run.status = 'completed';
        run.message = this.deps.current().demoContext
          ? 'Your concept image is ready. Review it in Concepts before developing in 3D.'
          : 'Research, four directions, and four images are ready.';
      }
      await this.save(run);
    } catch (error) {
      if (this.active(run)) {
        run.status = 'failed';
        run.message = run.steps.some((s) => s.submitting && !s.job)
          ? 'Submission outcome unknown. Reconcile provider history before starting another design. ' +
            (error as Error).message
          : (error as Error).message;
        await this.save(run).catch(() => {
          run.message =
            'Could not save workflow progress. Keep this page open and check browser storage.';
        });
      }
    } finally {
      this.busy = false;
    }
  }
}
