'use client';
import { useEffect, useRef, useState } from 'react';
import { SiteWorkflowController, type SiteWorkflow } from '@/lib/site-workflow';
import { generationCall, generationConnection } from '@/lib/generation-client';
import { loadMedia, saveMedia } from '@/lib/media-store';
import type { BuildingSpec, ConceptId } from '@/lib/spec';
export type SiteWorkflowRequest = {
  id: string;
  spec: BuildingSpec;
  concept?: ConceptId;
};
export default function SiteWorkflowStatus({
  spec,
  request,
  onApply,
  getSpec,
  ready,
}: {
  spec: BuildingSpec;
  request: SiteWorkflowRequest | null;
  ready: boolean;
  onApply: (s: BuildingSpec) => void;
  getSpec: () => BuildingSpec;
}) {
  const current = useRef({ onApply, getSpec });
  current.current = { onApply, getSpec };
  const [run, setRun] = useState<SiteWorkflow>();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const handled = useRef('');
  const [controller] = useState(
    () =>
      new SiteWorkflowController({
        current: () => current.current.getSpec(),
        apply: (next) => current.current.onApply(next),
        save: async (row) => {
          await saveMedia(
            'site-workflow-v1',
            new Blob([JSON.stringify(row)], { type: 'application/json' }),
          );
          setRun(row);
        },
        connection: async () => {
          const { local, api } = await generationConnection();
          return {
            provider: current.current.getSpec().demoContext
              ? api
                ? 'openai'
                : undefined
              : local.available
                ? 'codex'
                : api
                  ? 'openai'
                  : undefined,
            nonce: local.nonce || '',
          };
        },
        call: generationCall,
      }),
  );
  useEffect(() => {
    let live = true;
    void loadMedia('site-workflow-v1')
      .then(async (blob) => {
        if (blob) {
          const saved = JSON.parse(await blob.text()) as SiteWorkflow;
          if (
            !saved.id ||
            !Array.isArray(saved.steps) ||
            typeof saved.expected !== 'string'
          )
            throw new Error('Saved workflow is invalid.');
          if (live) {
            controller.run = saved;
            setRun(saved);
          }
        }
        if (live) setLoaded(true);
      })
      .catch(() => {
        if (live)
          setError(
            'Saved workflow could not be loaded. Check browser storage and reload.',
          );
      });
    return () => {
      live = false;
    };
  }, [controller]);
  useEffect(() => {
    if (!loaded || !ready || !request || handled.current === request.id) return;
    handled.current = request.id;
    void controller
      .start(request.spec, request.concept)
      .catch(() =>
        setError(
          'Workflow could not be saved. Check browser storage and reload.',
        ),
      );
  }, [loaded, ready, request, controller]);
  useEffect(() => {
    if (!loaded || !ready) return;
    const tick = () => {
      void controller.tick().catch((e) => setError(String(e)));
    };
    tick();
    const timer = setInterval(tick, 1500);
    return () => clearInterval(timer);
  }, [loaded, ready, controller]);
  useEffect(() => {
    if (loaded && ready)
      void controller.observe().catch((e) => setError(String(e)));
  }, [spec, loaded, ready, controller]);
  if (!error && (!run || run.projectId !== spec.id)) return null;
  const act = (fn: () => Promise<void>) => {
    void fn().catch((e) => setError(String(e)));
  };
  return (
    <section className="site-workflow" aria-label="Automatic design generation">
      <output aria-live="polite">
        <strong>
          {run?.status === 'completed'
            ? 'Design package ready'
            : 'Automatic design generation'}
        </strong>
        <span>{error || run?.message}</span>
        {run && (
          <small>
            {run.steps.filter((s) => s.applied).length}/{run.steps.length}{' '}
            outputs applied
            {run.provider
              ? ` · ${run.provider === 'codex' ? 'Codex subscription' : 'OpenAI API · paid usage'}`
              : ''}
          </small>
        )}
      </output>
      {run && !['completed', 'stopped'].includes(run.status) && (
        <button onClick={() => act(() => controller.stop())}>Stop</button>
      )}
      {run && ['failed', 'paused'].includes(run.status) && (
        <button onClick={() => act(() => controller.retry())}>Retry</button>
      )}
    </section>
  );
}
