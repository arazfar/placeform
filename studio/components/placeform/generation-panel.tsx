'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Loader2, RefreshCw, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { concepts, type BuildingSpec, type ConceptId } from '@/lib/spec';
import {
  generationFingerprint,
  applyGeneration,
  type GenerationInput,
  type GenerationJob,
  type GenerationKind,
} from '@/lib/generation';
import { importedImage } from '@/lib/persistence';
import { loadMedia, saveMedia } from '@/lib/media-store';
import {
  generationJSON as json,
  generationCall,
  type Connection,
} from '@/lib/generation-client';

export type GenerationRequest = {
  kind: GenerationKind;
  prompt: string;
  key: number;
};
type SavedJob = GenerationJob & {
  projectId: string;
  fingerprint: string;
  kind: GenerationKind;
  concept: ConceptId;
  prompt: string;
  created: string;
  applied?: boolean;
};
const labels: Record<GenerationKind, string> = {
  research: 'Research this place',
  concepts: 'Create four directions',
  image: 'Generate a concept image',
  design: 'Propose model changes',
};
export default function GenerationPanel({
  spec,
  selected,
  request,
  onClose,
  onOpen,
  onApply,
  onMessage,
  capture,
}: {
  spec: BuildingSpec;
  selected: ConceptId;
  request: GenerationRequest | null;
  onClose: () => void;
  onOpen: () => void;
  onApply: (s: BuildingSpec) => void;
  onMessage: (message: string) => void;
  capture?: () => Promise<Blob>;
}) {
  const [connection, setConnection] = useState<Connection>({
      available: false,
      message: 'Checking your Codex connection…',
    }),
    [api, setApi] = useState(false),
    [provider, setProvider] = useState<'codex' | 'openai'>('codex'),
    [kind, setKind] = useState<GenerationKind>('research'),
    [prompt, setPrompt] = useState(''),
    [jobs, setJobs] = useState<SavedJob[]>([]),
    [loaded, setLoaded] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [batch, setBatch] = useState(false),
    [error, setError] = useState(''),
    [reference, setReference] = useState<'concept' | 'model' | 'none'>(
      'concept',
    );
  const state = useRef({ spec, connection, provider, jobs });
  state.current = { spec, connection, provider, jobs };
  const submissionLock = useRef(false);
  const inFlight = useRef(false),
    requestKey = useRef(0),
    persistence = useRef(Promise.resolve());
  async function connect() {
    try {
      const [local, status] = await Promise.all([
        fetch('/api/codex').then((r) => json<Connection>(r)),
        fetch('/api/status').then((r) => json<{ generation: boolean }>(r)),
      ]);
      setConnection(local as Connection);
      setApi(status.generation);
      setProvider(local.available ? 'codex' : 'openai');
    } catch {
      setConnection({
        available: false,
        message: 'Could not connect. Check that the local app is running.',
      });
    }
  }
  useEffect(() => {
    void connect();
    void loadMedia('generation-jobs-v1')
      .then(async (blob) => {
        if (blob) {
          const rows = JSON.parse(await blob.text());
          if (Array.isArray(rows)) setJobs(rows);
        }
      })
      .catch(() => setError('Saved jobs could not be loaded.'))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (request && request.key !== requestKey.current) {
      requestKey.current = request.key;
      setKind(request.kind);
      setPrompt(request.prompt);
      setError('');
    }
  }, [request]);
  useEffect(() => {
    if (!loaded) return;
    const blob = new Blob([JSON.stringify(jobs)], { type: 'application/json' });
    persistence.current = persistence.current
      .catch(() => {})
      .then(() => saveMedia('generation-jobs-v1', blob))
      .catch(() =>
        setError(
          'Your browser could not save these jobs. Keep this page open until you download or apply the result.',
        ),
      );
  }, [jobs, loaded]);
  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        for (const job of state.current.jobs.filter(
          (j) => j.status === 'running' || j.status === 'queued',
        )) {
          try {
            const data = (await fetch(
              `${job.provider === 'codex' ? '/api/codex' : '/api/generation'}?id=${encodeURIComponent(job.id)}`,
              {
                headers: {
                  'x-placeform-token': state.current.connection.nonce || '',
                },
              },
            ).then(json)) as GenerationJob;
            if (data.result?.image) {
              const blob = await fetch(data.result.image).then((r) => r.blob());
              data.result.image = await importedImage(
                new File([blob], 'generated.png', { type: blob.type }),
              );
            }
            if (!stopped)
              setJobs((rows) =>
                rows.map((row) =>
                  row.id === job.id ? { ...row, ...data } : row,
                ),
              );
          } catch (e) {
            if (
              job.provider === 'codex' &&
              (e as Error).message.includes('Refresh the page')
            )
              void fetch('/api/codex')
                .then((r) => json<Connection>(r))
                .then(setConnection)
                .catch(() => {});
            if (!stopped)
              setJobs((rows) =>
                rows.map((row) =>
                  row.id === job.id
                    ? {
                        ...row,
                        message: `Connection interrupted; checking again. ${(e as Error).message}`,
                      }
                    : row,
                ),
              );
          }
        }
      } finally {
        inFlight.current = false;
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 4500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [connection.nonce]);
  async function start(
    target: GenerationKind = kind,
    concept: ConceptId = selected,
    customPrompt = prompt,
  ) {
    if (submissionLock.current) return false;
    submissionLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const current = state.current.spec;
      let image: string | undefined;
      if (target === 'image' && reference === 'model') {
        if (!capture)
          throw new Error(
            'Open the 3D model first so it can supply a reference frame.',
          );
        const frame = await capture();
        image = await importedImage(
          new File([frame], 'model.png', { type: frame.type }),
        );
      }
      if (target === 'image' && reference === 'concept') {
        const src =
          current.assets[concept] ||
          (!current.directions && !current.siteDesignPending
            ? `/assets/concept-${concept.toLowerCase()}.png`
            : undefined);
        if (src) {
          const blob = await fetch(src).then((r) => r.blob());
          image = await importedImage(
            new File([blob], 'reference.png', { type: blob.type }),
          );
        }
      }
      const input: GenerationInput = {
        kind: target,
        spec: { ...current, assets: {} },
        concept,
        prompt: customPrompt,
        reference: image,
      };
      const result = await generationCall(
        provider,
        connection.nonce || '',
        'POST',
        undefined,
        input,
      );
      const saved: SavedJob = {
        ...result,
        projectId: current.id,
        fingerprint: generationFingerprint(current, target),
        kind: target,
        concept,
        prompt: customPrompt,
        created: new Date().toISOString(),
      };
      setJobs((rows) => [saved, ...rows].slice(0, 60));
      onMessage(
        `${labels[target]} started with ${provider === 'codex' ? 'your Codex subscription' : 'the OpenAI API'}. You can continue working.`,
      );
      return true;
    } catch (e) {
      setError(
        `${(e as Error).message} No automatic resubmission was made. If the connection dropped after submission, a provider charge may still occur.`,
      );
      return false;
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }
  async function generateSet() {
    setBatch(true);
    setReference('none');
    for (const direction of state.current.spec.directions || []) {
      if (state.current.spec.assets[direction.id]) continue;
      if (
        !(await start(
          'image',
          direction.id,
          `Generate the approved ${direction.name} direction for the current data-center site. Keep the shared scale and three-quarter pedestrian viewpoint. ${prompt}`,
        ))
      )
        break;
    }
    setBatch(false);
  }
  async function cancel(job: SavedJob) {
    try {
      await fetch(
        `${job.provider === 'codex' ? '/api/codex' : '/api/generation'}?id=${encodeURIComponent(job.id)}`,
        {
          method: 'DELETE',
          headers: { 'x-placeform-token': connection.nonce || '' },
        },
      ).then(json);
      setJobs((rows) =>
        rows.map((row) =>
          row.id === job.id
            ? { ...row, message: 'Cancellation requested…' }
            : row,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function apply(job: SavedJob) {
    try {
      const current = state.current.spec;
      if (
        current.id !== job.projectId ||
        generationFingerprint(current, job.kind) !== job.fingerprint
      )
        throw new Error(
          'The site or design changed while this job ran. Start a new job against the current project, or undo those changes before applying.',
        );
      if (!job.result) throw new Error('No result is ready.');
      onApply(applyGeneration(current, job.kind, job.result, job.concept));
      setJobs((rows) =>
        rows.map((row) =>
          row.id === job.id ? { ...row, applied: true } : row,
        ),
      );
      onMessage(
        job.kind === 'concepts'
          ? 'Four directions applied. Generate each image here, then explore them in Concepts.'
          : 'Result applied as a new design version. Undo is available.',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const relevant = jobs.filter((j) => j.projectId === spec.id),
    running = relevant.filter(
      (j) => j.status === 'running' || j.status === 'queued',
    ).length;
  return (
    <>
      <button
        className={`generation-launch ${running ? 'working' : ''}`}
        onClick={onOpen}
        aria-label="Generation activity"
        hidden={!running}
      >
        {running > 0 && <Loader2 size={14} className="spin" />}
        {running} generating
      </button>
      <Dialog
        open={!!request}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="studio-dialog generation-dialog">
          <DialogTitle>Make the next move.</DialogTitle>
          <DialogDescription>
            Research, concepts and model proposals return here for review. Your
            project stays editable while jobs run.
          </DialogDescription>
          <div className="generation-connection">
            <div>
              <span className="eyebrow">GENERATION CONNECTION</span>
              <p>{connection.message}</p>
            </div>
            <button
              className="tool-button"
              aria-label="Refresh connections"
              onClick={() => void connect()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="generation-form">
            <label className="field-label">
              WORK TO DO
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as GenerationKind)}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              RUN WITH
              <select
                value={provider}
                onChange={(e) =>
                  setProvider(e.target.value as 'codex' | 'openai')
                }
              >
                <option value="codex" disabled={!connection.available}>
                  Codex subscription · no API charge
                </option>
                <option value="openai" disabled={!api}>
                  OpenAI API · paid usage
                </option>
              </select>
            </label>
          </div>
          <label className="field-label">
            DIRECTION FROM YOU
            <textarea
              value={prompt}
              maxLength={6000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the research or design explore?"
            />
          </label>
          {kind === 'image' && (
            <label className="field-label">
              VISUAL REFERENCE
              <select
                value={reference}
                onChange={(e) =>
                  setReference(e.target.value as typeof reference)
                }
              >
                <option value="concept">Current concept image</option>
                <option value="model" disabled={!capture}>
                  Actual 3D model view
                </option>
                <option value="none">Fresh concept visualization</option>
              </select>
            </label>
          )}
          {provider === 'openai' ? (
            <p className="generation-cost">
              Paid API use. Text: GPT-5 mini, up to 10,000 output tokens;
              research adds up to 8 web searches. Images: GPT Image 2, medium
              1536 × 1024; one per individual job, plus GPT-5 orchestration.
              Token usage is recorded below; this is metered billing, not a
              fixed quote.{' '}
              <a
                href="https://developers.openai.com/api/docs/pricing"
                target="_blank"
                rel="noreferrer"
              >
                Current rates
              </a>
            </p>
          ) : (
            <p className="generation-cost">
              Uses the ChatGPT account signed into local Codex and its available
              allowance. Voice and AIand video use their API connections. Paid
              fallback is always your choice.
            </p>
          )}
          {!spec.researchReady && kind !== 'research' && (
            <p className="inline-warning">
              Research this geofence first to ground new directions in local
              evidence.
            </p>
          )}
          <div className="generation-actions">
            <button
              className="accent-button"
              disabled={
                batch ||
                submitting ||
                !loaded ||
                (provider === 'codex' ? !connection.available : !api) ||
                (kind === 'concepts' && !spec.researchReady)
              }
              onClick={() => void start()}
            >
              {submitting ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <ArrowRight size={16} />
              )}{' '}
              {submitting ? 'Starting…' : labels[kind]}
              {kind === 'image' ? ` ${selected}` : ''}
            </button>
          </div>
          {!!spec.directions && (
            <div className="generation-directions">
              <span className="field-label">GENERATE THE FOUR IMAGES</span>
              <button
                className="accent-button"
                disabled={
                  batch ||
                  submitting ||
                  running > 0 ||
                  Object.keys(spec.assets).length === 4
                }
                onClick={() => void generateSet()}
              >
                Generate missing images
                {provider === 'openai' ? ' · up to 4 paid images' : ' · Codex'}
              </button>
              {(spec.directions || concepts).map((d) => (
                <button
                  key={d.id}
                  className="outline-button"
                  disabled={
                    batch ||
                    submitting ||
                    relevant.some(
                      (j) =>
                        j.kind === 'image' &&
                        j.concept === d.id &&
                        j.status === 'running',
                    )
                  }
                  onClick={() => {
                    setKind('image');
                    void start(
                      'image',
                      d.id,
                      `Create the approved ${d.name} direction at this site. ${prompt}`,
                    );
                  }}
                >
                  {spec.assets[d.id] ? <Check size={13} /> : null}
                  {d.id} · {d.name}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="inline-warning">
              {error}
            </p>
          )}
          <div className="generation-jobs">
            <div className="section-kicker">
              PROJECT JOBS <span>{relevant.length}</span>
            </div>
            {!relevant.length && (
              <p className="muted">Your first result will appear here.</p>
            )}
            {relevant.map((job) => (
              <article key={job.id} className="generation-job">
                <div className="generation-job-heading">
                  <div>
                    <strong>
                      {labels[job.kind]}
                      {job.kind === 'image' ? ` ${job.concept}` : ''}
                    </strong>
                    <small>
                      {job.provider === 'codex'
                        ? 'CODEX SUBSCRIPTION'
                        : 'PAID OPENAI API'}{' '}
                      · {new Date(job.created).toLocaleString()}
                    </small>
                  </div>
                  <span className="pill">
                    {job.applied ? 'APPLIED' : job.status.toUpperCase()}
                  </span>
                </div>
                <output>{job.message}</output>
                {(job.status === 'running' || job.status === 'queued') && (
                  <button
                    className="text-link"
                    onClick={() => void cancel(job)}
                  >
                    <X size={13} /> Cancel job
                  </button>
                )}
                {job.result && (
                  <details open={!job.applied}>
                    <summary>Review result</summary>
                    {job.result.image && (
                      <img
                        className="generation-preview"
                        src={job.result.image}
                        alt={`Generated direction ${job.concept}`}
                      />
                    )}
                    {job.result.brief && (
                      <p className="generation-brief">{job.result.brief}</p>
                    )}
                    {job.result.sources?.map((s) => (
                      <div className="generation-source" key={s.id}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title} ↗
                        </a>
                        <p>{s.fact}</p>
                        <small>Design response: {s.response}</small>
                        <small>To verify: {s.limitation}</small>
                      </div>
                    ))}
                    {job.result.directions?.map((d) => (
                      <div className="generation-source" key={d.id}>
                        <strong>
                          {d.id} · {d.name}
                        </strong>
                        <p>{d.description}</p>
                        <small>{d.inspiration}</small>
                        <small>Tradeoff: {d.tradeoff}</small>
                        <div className="generation-swatches">
                          {d.colors.map((color, i) => (
                            <span
                              key={color + i}
                              style={{ background: color }}
                              title={d.materials[i]}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {job.result.message && <p>{job.result.message}</p>}
                    {job.result.actions && (
                      <ul>
                        {job.result.actions.map((a, i) => (
                          <li key={i}>
                            {Object.entries(a)
                              .filter(([, v]) => v !== '')
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ')}
                          </li>
                        ))}
                      </ul>
                    )}
                    {job.kind === 'image' && (
                      <p className="generation-cost">
                        This visualization does not change model geometry.
                        Review the image against the model; use “Propose model
                        changes” for editable geometry.
                      </p>
                    )}
                    {!job.applied && (
                      <button
                        className="accent-button"
                        disabled={
                          generationFingerprint(spec, job.kind) !==
                            job.fingerprint ||
                          (job.kind === 'design' && !job.result.actions?.length)
                        }
                        onClick={() => apply(job)}
                      >
                        Apply to this project <Check size={15} />
                      </button>
                    )}
                    {!job.applied &&
                      generationFingerprint(spec, job.kind) !==
                        job.fingerprint && (
                        <p className="inline-warning">
                          The project changed. Review is available; start a new
                          job to apply changes safely.
                        </p>
                      )}
                  </details>
                )}
                {job.usage && (
                  <details>
                    <summary>Recorded token usage</summary>
                    <pre>{JSON.stringify(job.usage, null, 2)}</pre>
                  </details>
                )}
                {(job.status === 'failed' || job.status === 'cancelled') && (
                  <button
                    className="outline-button"
                    disabled={batch || submitting}
                    onClick={() =>
                      void start(job.kind, job.concept, job.prompt)
                    }
                  >
                    Start a new attempt{provider === 'openai' ? ' · paid' : ''}
                  </button>
                )}
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
