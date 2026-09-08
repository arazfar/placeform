'use client';
// Imperative browser engines and persisted external sessions are intentionally outside React Compiler.
// Native images support local/blob imports. Silent model films have no spoken audio to caption.
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { useEffect, useState, useRef } from 'react';
import { Play, Download, ArrowUpRight, RefreshCw, Film } from 'lucide-react';
import JSZip from 'jszip';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { filmShots, type SceneAPI } from './scene';
import { type BuildingSpec } from '@/lib/spec';
import { download } from '@/lib/download';
import { saveMedia, loadMedia } from '@/lib/media-store';
export type VideoJob = {
  id: string;
  projectId: string;
  revision: number;
  shot: string;
  status: string;
  cost?: string;
  currency?: string;
  prompt: string;
  seconds: number;
  error?: { message: string } | string;
  createdAt: string;
  review?: string[];
};
type APIData = Partial<VideoJob> &
  Catalog & {
    id: string;
    error?: string;
    uncertain?: boolean;
    data?: Array<VideoJob & { created_at: number }>;
  };
type Catalog = {
  model: {
    id: string;
    pricing: { resolution: string; per_second: string; currency: string }[];
  } | null;
  checkedAt: string;
};
export default function FilmPanel({
  spec,
  api,
  onMessage,
}: {
  spec: BuildingSpec;
  api: SceneAPI | undefined;
  onMessage: (s: string) => void;
}) {
  const shots = filmShots(spec),
    [selected, setSelected] = useState(0),
    [progress, setProgress] = useState(0),
    [busy, setBusy] = useState(''),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [jobs, setJobs] = useState<VideoJob[]>([]),
    [hydrated, setHydrated] = useState(false),
    [preview, setPreview] = useState(''),
    [firstURL, setFirstURL] = useState(''),
    [lastURL, setLastURL] = useState(''),
    [prompt, setPrompt] = useState(''),
    [seconds, setSeconds] = useState(shots[0].seconds),
    [showPrepared, setShowPrepared] = useState(false),
    [pollError, setPollError] = useState('');
  const frames = useRef<{
    first: Blob;
    last: Blob;
    revision: number;
    shot: string;
  } | null>(null);
  const shot = shots[selected],
    price = catalog?.model?.pricing.find((p) => p.resolution === '768p');
  useEffect(() => {
    try {
      const v = JSON.parse(
        localStorage.getItem('placeform-video-jobs') || '[]',
      );
      if (Array.isArray(v)) setJobs(v);
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated)
      localStorage.setItem('placeform-video-jobs', JSON.stringify(jobs));
  }, [jobs, hydrated]);
  useEffect(() => {
    setPrompt(
      `${shot.description} Preserve the building silhouette, proportions, material colors, facade bay count, canopy, roof equipment screen and landscape from the supplied model renders. A slow architectural camera move; no new geometry, no text, no dramatic weather. Schematic exterior of ${spec.name}.`,
    );
    setSeconds(shot.seconds);
    frames.current = null;
    setFirstURL('');
    setLastURL('');
    setShowPrepared(false);
    setPreview('');
    loadMedia(`${spec.id}:${spec.revision}:${shot.id}`)
      .then((blob) => {
        if (blob) setPreview(URL.createObjectURL(blob));
      })
      .catch(() => {});
  }, [
    selected,
    spec.id,
    spec.revision,
    spec.name,
    shot.description,
    shot.seconds,
    shot.id,
  ]);
  useEffect(() => {
    return () => {
      if (firstURL.startsWith('blob:')) URL.revokeObjectURL(firstURL);
      if (lastURL.startsWith('blob:')) URL.revokeObjectURL(lastURL);
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [firstURL, lastURL, preview]);
  useEffect(() => {
    if (!hydrated) return;
    const active = jobs.filter(
      (j) =>
        ![
          'completed',
          'failed',
          'canceled',
          'submission-unknown',
          'submitting',
        ].includes(j.status),
    );
    if (!active.length) return;
    let dead = false;
    async function poll() {
      for (const job of active) {
        try {
          const r = await fetch(`/api/video?id=${encodeURIComponent(job.id)}`);
          const v = (await r.json()) as APIData;
          if (!r.ok) throw new Error(v.error || 'Video request failed.');
          if (!dead) {
            setJobs((js) =>
              js.map((j) => (j.id === job.id ? { ...j, ...v } : j)),
            );
            setPollError('');
          }
        } catch (e) {
          if (!dead) setPollError((e as Error).message);
        }
      }
    }
    const timer = setInterval(poll, 15000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [jobs, hydrated]);
  async function guarded(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setProgress(0);
    try {
      await fn();
    } catch (e) {
      onMessage((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function prepare() {
    if (!api) throw new Error('Open the model and wait for it to load.');
    const f = await api.frames(shot);
    frames.current = { ...f, revision: spec.revision, shot: shot.id };
    setFirstURL(URL.createObjectURL(f.first));
    setLastURL(URL.createObjectURL(f.last));
  }
  async function refreshCatalog() {
    const r = await fetch('/api/video');
    const v = (await r.json()) as APIData;
    if (!r.ok) throw new Error(v.error || 'Video request failed.');
    setCatalog(v);
    if (!v.model)
      onMessage(
        'MiniMax H3 is not available in this account’s current catalog.',
      );
    else
      onMessage(
        'Live AIand model and price verified. Review the frames and prompt before generating.',
      );
  }
  async function record() {
    if (!api) throw new Error('The model is loading.');
    const clip = await api.record({ ...shot, seconds }, setProgress);
    await saveMedia(`${spec.id}:${spec.revision}:${shot.id}`, clip);
    setPreview(URL.createObjectURL(clip));
    setShowPrepared(false);
    onMessage(
      'Original model clip saved in this browser. It is ready to download.',
    );
  }
  async function submit() {
    if (!price) throw new Error('Verify the live model and price first.');
    if (
      !frames.current ||
      frames.current.revision !== spec.revision ||
      frames.current.shot !== shot.id
    )
      throw new Error(
        'Prepare reference frames for the current revision first.',
      );
    const f = frames.current;
    const fileIds: string[] = [];
    for (const [i, blob] of [f.first, f.last].entries()) {
      const form = new FormData();
      form.set('file', blob, `r${spec.revision}-${shot.id}-${i}.png`);
      const r = await fetch('/api/video', { method: 'POST', body: form });
      const v = (await r.json()) as APIData;
      if (!r.ok) throw new Error(v.error || 'Video request failed.');
      fileIds.push(v.id);
    }
    const intent: VideoJob = {
      id: `intent-${crypto.randomUUID()}`,
      projectId: spec.id,
      revision: spec.revision,
      shot: shot.id,
      status: 'submitting',
      prompt,
      seconds,
      createdAt: new Date().toISOString(),
    };
    setJobs((j) => [intent, ...j]);
    try {
      const r = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          seconds,
          firstFrame: fileIds[0],
          lastFrame: fileIds[1],
          expectedRate: price.per_second,
        }),
      });
      const v = (await r.json()) as APIData;
      if (!r.ok) {
        setJobs((js) =>
          js.map((j) =>
            j.id === intent.id
              ? {
                  ...j,
                  status: v.uncertain ? 'submission-unknown' : 'failed',
                  error: v.error,
                }
              : j,
          ),
        );
        throw new Error(v.error || 'Video request failed.');
      }
      setJobs((js) =>
        js.map((j) => (j.id === intent.id ? { ...intent, ...v } : j)),
      );
      onMessage(
        `AIand accepted the ${seconds}-second job. Quote: ${v.cost} ${v.currency}.`,
      );
    } catch (e) {
      setJobs((js) =>
        js.map((j) =>
          j.id === intent.id && j.status === 'submitting'
            ? { ...j, status: 'submission-unknown' }
            : j,
        ),
      );
      throw e;
    }
  }
  async function exportFrames() {
    if (!frames.current) await prepare();
    const f = frames.current!;
    const zip = new JSZip();
    zip.file('first-frame.png', f.first);
    zip.file('last-frame.png', f.last);
    zip.file(
      'shot.json',
      JSON.stringify(
        {
          projectId: spec.id,
          revision: spec.revision,
          ...shot,
          seconds,
          prompt,
          provider: 'AIand',
          model: 'minimaxai/minimax-h3',
          pricing: price || 'Unverified; use live catalog',
        },
        null,
        2,
      ),
    );
    zip.file('building-specification.json', JSON.stringify(spec, null, 2));
    download(
      await zip.generateAsync({ type: 'blob' }),
      `placeform-${shot.id}-r${spec.revision}-video-task.zip`,
    );
  }
  async function reconcile() {
    const r = await fetch('/api/video?history=1'),
      v = (await r.json()) as APIData;
    if (!r.ok) throw new Error(v.error || 'Video request failed.');
    const recent = Array.isArray(v.data) ? v.data : [];
    setJobs((js) =>
      js.map((j) => {
        if (!['submission-unknown', 'submitting'].includes(j.status)) return j;
        const candidates = recent.filter(
          (r: VideoJob & { created_at: number }) =>
            r.prompt === j.prompt &&
            r.seconds === j.seconds &&
            Math.abs(r.created_at * 1000 - Date.parse(j.createdAt)) < 300000,
        );
        if (candidates.length === 1) {
          return { ...j, ...candidates[0] };
        }
        return j;
      }),
    );
    onMessage(
      'Recent provider history checked. Unmatched or ambiguous submissions remain unresolved; inspect the AIand console before retrying.',
    );
  }
  const projectJobs = jobs.filter((j) => j.projectId === spec.id);
  return (
    <div className="film-layout">
      <div className="film-story">
        <div className="film-intro">
          <div>
            <div className="eyebrow">A CINEMATIC DESIGN REVIEW</div>
            <h2>Architecture, in motion.</h2>
          </div>
          <button
            className="outline-button"
            onClick={() => {
              setShowPrepared(!showPrepared);
              setPreview('');
            }}
          >
            <Film size={16} />
            {showPrepared ? 'Return to storyboard' : 'Prepared walkthrough'}
          </button>
        </div>
        {showPrepared ? (
          <div className="film-video">
            <video
              controls
              src="/assets/model-walkthrough.mp4"
              poster="/assets/model-perspective.png"
            />
            <p>
              Original Three.js walkthrough · prepared Portland study, revision
              1 · no AI video processing.
            </p>
          </div>
        ) : preview ? (
          <div className="film-video">
            <video controls src={preview} />
            <button
              className="outline-button"
              onClick={async () => {
                const blob = await (await fetch(preview)).blob();
                download(
                  blob,
                  `${shot.id}-r${spec.revision}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`,
                );
              }}
            >
              <Download size={15} /> Download original model clip
            </button>
          </div>
        ) : (
          <div className="film-frames">
            {firstURL ? (
              <>
                <figure>
                  <img src={firstURL} alt="Actual model first frame" />
                  <figcaption>01 · FIRST FRAME</figcaption>
                </figure>
                <figure>
                  <img src={lastURL} alt="Actual model last frame" />
                  <figcaption>02 · LAST FRAME</figcaption>
                </figure>
              </>
            ) : (
              <div className="storyboard-empty">
                <span>0{selected + 1}</span>
                <h3>{shot.name}</h3>
                <p>{shot.description}</p>
                <button
                  className="dark-button"
                  disabled={!!busy || !api}
                  onClick={() =>
                    guarded('Rendering reference frames…', prepare)
                  }
                >
                  Prepare model frames <ArrowUpRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}
        <div className="shot-list">
          {shots.map((sh, i) => (
            <button
              className={selected === i ? 'selected' : ''}
              key={sh.id}
              onClick={() => {
                setSelected(i);
                api?.play();
              }}
            >
              <span>0{i + 1}</span>
              <div>
                <strong>{sh.name}</strong>
                <small>
                  {sh.seconds} SEC ·{' '}
                  {i === 0
                    ? 'APPROACH'
                    : i === 1
                      ? 'STREET LEVEL'
                      : i === 2
                        ? 'FACADE DETAIL'
                        : 'AERIAL REVEAL'}
                </small>
              </div>
              <Play size={14} />
            </button>
          ))}
        </div>
        <div className="film-actions">
          <button
            className="outline-button"
            disabled={!api || !!busy}
            onClick={() => {
              api?.play({ ...shot, seconds });
              onMessage(`Playing ${shot.name} in the live model canvas.`);
            }}
          >
            <Play size={15} /> Preview camera move
          </button>
          <button
            className="outline-button"
            disabled={!api || !!busy}
            onClick={() => guarded('Recording the original model…', record)}
          >
            <Film size={15} /> Record model clip
          </button>
          <button
            className="outline-button"
            disabled={!api || !!busy}
            onClick={() => guarded('Exporting the video task…', exportFrames)}
          >
            <Download size={15} /> Export video task
          </button>
        </div>
        {busy && (
          <div className="film-progress">
            <span>{busy}</span>
            <Progress value={busy.includes('Recording') ? progress : null} />
          </div>
        )}
        <div className="jobs">
          <div className="section-kicker">
            SAVED VIDEO JOBS{' '}
            <button
              className="plain"
              onClick={() => guarded('Checking provider history…', reconcile)}
            >
              <RefreshCw size={13} /> Reconcile
            </button>
          </div>
          {projectJobs.length === 0 ? (
            <p className="muted">
              No paid jobs submitted. Model recordings are saved separately in
              this browser.
            </p>
          ) : (
            projectJobs.map((job) => (
              <div className="job" key={job.id}>
                <div>
                  <strong>
                    {job.shot} · r{job.revision}
                  </strong>
                  <span className="job-status">
                    {job.status.replaceAll('_', ' ')}
                  </span>
                  {job.cost && (
                    <small>
                      {Number(job.cost).toFixed(2)}{' '}
                      {job.currency?.toUpperCase()} quote
                    </small>
                  )}
                </div>
                {job.error && (
                  <p>
                    {typeof job.error === 'string'
                      ? job.error
                      : job.error.message}
                  </p>
                )}
                {job.status === 'completed' && (
                  <>
                    <video controls src={`/api/video?id=${job.id}&content=1`} />
                    <a
                      className="outline-button"
                      href={`/api/video?id=${job.id}&content=1`}
                    >
                      <Download size={14} /> Download MP4
                    </a>
                    <div className="drift-check">
                      <strong>Architectural drift review</strong>
                      {[
                        'Silhouette & proportions',
                        'Facade bays & material identity',
                        'Entrance, roof & landscape',
                      ].map((label) => (
                        <label key={label}>
                          <Checkbox
                            checked={job.review?.includes(label) || false}
                            onCheckedChange={(checked) =>
                              setJobs((js) =>
                                js.map((j) =>
                                  j.id === job.id
                                    ? {
                                        ...j,
                                        review: checked
                                          ? [...(j.review || []), label]
                                          : (j.review || []).filter(
                                              (x) => x !== label,
                                            ),
                                      }
                                    : j,
                                ),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                      <p>
                        {job.review?.length === 3
                          ? 'Review recorded. Compare with the retained model clip before presenting.'
                          : 'Unreviewed generated output. Compare it with the original model and supplied frames.'}
                      </p>
                    </div>
                  </>
                )}
                {job.status === 'failed' && (
                  <button
                    className="plain"
                    onClick={() => {
                      setPrompt(job.prompt);
                      setSeconds(job.seconds);
                      setSelected(
                        Math.max(
                          0,
                          shots.findIndex((s) => s.id === job.shot),
                        ),
                      );
                      onMessage(
                        'Failed job settings loaded. Prepare fresh frames and review the current price to retry.',
                      );
                    }}
                  >
                    <RefreshCw size={14} /> Load for retry
                  </button>
                )}
                {['submission-unknown', 'submitting'].includes(job.status) && (
                  <p>
                    Do not resubmit until job history is reconciled. This may
                    already be a paid job.
                  </p>
                )}
              </div>
            ))
          )}
          {pollError && (
            <p className="inline-warning">
              Status refresh failed: {pollError} The job has not been
              resubmitted.
            </p>
          )}
        </div>
      </div>
      <aside className="film-settings">
        <div className="section-kicker">
          PRODUCTION <span className="pill">AIAND</span>
        </div>
        <h3>Bring the study to life.</h3>
        <p>
          First and last frames from your actual model guide the camera and hold
          the architecture together.
        </p>
        <label className="field-label">
          SHOT PROMPT
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={7000}
          />
        </label>
        <label className="field-label">
          DURATION{' '}
          <NativeSelect
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 4).map((n) => (
              <NativeSelectOption key={n} value={n}>
                {n} seconds
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <div className="provider-card">
          <div>
            <span>MiniMax H3</span>
            <small>768p · 16:9 · MP4</small>
          </div>
          <code>minimaxai/minimax-h3</code>
          <p>
            {price
              ? `Live quote: ${(Number(price.per_second) * seconds).toFixed(2)} ${price.currency.toUpperCase()} for ${seconds} seconds.`
              : `Illustrative estimate: $${(0.08 * seconds).toFixed(2)} for ${seconds}s at the documented $0.08/s example rate. Live price unverified.`}
          </p>
          <a
            href="https://docs.aiand.com/api/videos/"
            target="_blank"
            rel="noreferrer"
          >
            Provider documentation <ArrowUpRight size={12} />
          </a>
        </div>
        <button
          className="outline-button"
          disabled={!!busy}
          onClick={() => guarded('Checking model and price…', refreshCatalog)}
        >
          <RefreshCw size={14} /> Verify live model & price
        </button>
        <button
          className="accent-button"
          disabled={!price || !firstURL || !!busy || prompt.length < 8}
          onClick={() => guarded('Submitting to AIand…', submit)}
        >
          Generate ·{' '}
          {price
            ? `${(Number(price.per_second) * seconds).toFixed(2)} ${price.currency.toUpperCase()}`
            : 'Connect AIand'}{' '}
          <ArrowUpRight size={15} />
        </button>
        <p className="fineprint">
          Paid API usage. Credentials stay on the server. The key owner must
          accept video terms in the AIand console. Submitted renders cannot be
          stopped. Download completed films within 30 days.
        </p>
      </aside>
    </div>
  );
}
