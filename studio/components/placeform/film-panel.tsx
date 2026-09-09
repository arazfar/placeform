'use client';
// Native images and video support browser-local media and private provider content.
import { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Download, ArrowUpRight, RefreshCw, Film } from 'lucide-react';
import JSZip from 'jszip';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { filmShots, type SceneAPI } from './scene';
import type { BuildingSpec } from '@/lib/spec';
import { download } from '@/lib/download';
import { saveMedia, loadMedia } from '@/lib/media-store';
import { videoReadiness, type VideoCatalog } from '@/lib/video-readiness';
import {
  cinematicPrompt,
  referenceIssue,
  isRunning,
  isUncertain,
  mergeProviderJob,
  reconcileJobs,
  readSavedJobs,
  JOBS_KEY,
  type CameraMove,
  type FilmReference,
  type ProviderJob,
  type VideoJob,
} from '@/lib/cinematic';
import {
  imageForFilm,
  submitCinematic,
  savedFilm,
  videoJSON,
  VideoRequestError,
} from '@/lib/video-client';
export type { VideoJob } from '@/lib/cinematic';

function CompletedFilm({
  job,
  onAnother,
}: {
  job: VideoJob;
  onAnother?: () => void;
}) {
  const [url, setURL] = useState(''),
    [notice, setNotice] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false,
      objectURL = '';
    setURL('');
    setNotice('');
    void savedFilm(job.id)
      .then(({ blob, warning }) => {
        if (!disposed) {
          objectURL = URL.createObjectURL(blob);
          setURL(objectURL);
          setNotice(warning || '');
        }
      })
      .catch((error) => {
        if (!disposed) setNotice((error as Error).message);
      });
    return () => {
      disposed = true;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [job.id, attempt]);
  return (
    <div className="film-video cinematic-result">
      <div className="section-kicker">
        {job.referenceLabel || job.shot} · {job.seconds} SECONDS
      </div>
      {url ? (
        <video
          controls
          playsInline
          src={url}
          preload="metadata"
          onError={() =>
            setNotice(
              'Playback failed. Try downloading the MP4 or reload the film.',
            )
          }
        />
      ) : (
        <output>{notice || 'Loading your cinematic…'}</output>
      )}
      <div className="film-actions">
        {url && (
          <a
            className="outline-button"
            href={url}
            download={`placeform-${job.id}.mp4`}
          >
            <Download size={15} /> Download MP4
          </a>
        )}
        {onAnother && (
          <button className="accent-button" onClick={onAnother}>
            <Film size={15} /> Generate another take
          </button>
        )}
        {notice && (
          <button
            className="outline-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            <RefreshCw size={14} /> Reload film
          </button>
        )}
      </div>
      {url && notice && <p className="inline-warning">{notice}</p>}
      {url && (
        <p>
          Compare the building edges, facade details and materials with your
          reference before presenting.
        </p>
      )}
    </div>
  );
}

export default function FilmPanel({
  spec,
  reference,
  modelToolsVisible,
  onToggleModelTools,
  onConnections,
  api,
  onMessage,
}: {
  spec: BuildingSpec;
  reference: FilmReference;
  modelToolsVisible: boolean;
  onToggleModelTools: () => void;
  onConnections: () => void;
  api: SceneAPI | undefined;
  onMessage: (s: string) => void;
}) {
  const shots = filmShots(spec);
  const [move, setMove] = useState<CameraMove>('push-in'),
    [seconds, setSeconds] = useState(10),
    [prompt, setPrompt] = useState(() => cinematicPrompt(10, 'push-in')),
    [source, setSource] = useState<'concept' | 'model'>('concept'),
    [firstURL, setFirstURL] = useState(reference.image),
    [lastURL, setLastURL] = useState(''),
    [referenceLabel, setReferenceLabel] = useState(reference.label),
    [referenceConcept, setReferenceConcept] = useState(reference.concept),
    [selectedShot, setSelectedShot] = useState(0),
    [preview, setPreview] = useState(''),
    [recordingExtension, setRecordingExtension] = useState('webm'),
    [busy, setBusy] = useState(''),
    [progress, setProgress] = useState(0),
    [catalog, setCatalog] = useState<VideoCatalog | null>(null),
    [checking, setChecking] = useState(true),
    [connectionError, setConnectionError] = useState(''),
    [referenceError, setReferenceError] = useState(''),
    [jobs, setJobs] = useState<VideoJob[]>([]),
    [hydrated, setHydrated] = useState(false),
    [historyError, setHistoryError] = useState(''),
    [pollError, setPollError] = useState(''),
    [actionError, setActionError] = useState(''),
    [featuredId, setFeaturedId] = useState<string | null>(null);
  const jobsRef = useRef<VideoJob[]>([]),
    locked = useRef(false),
    frames = useRef<{ first: Blob; last?: Blob } | null>(null),
    sourceRevision = useRef(spec.revision);
  const persist = useCallback((update: (current: VideoJob[]) => VideoJob[]) => {
    const next = update(readSavedJobs(localStorage.getItem(JOBS_KEY)));
    // Commit synchronously before any paid request. A failed write must stop submission.
    localStorage.setItem(JOBS_KEY, JSON.stringify(next));
    jobsRef.current = next;
    setJobs(next);
  }, []);
  useEffect(() => {
    try {
      const saved = readSavedJobs(localStorage.getItem(JOBS_KEY));
      jobsRef.current = saved;
      setJobs(saved);
      setHydrated(true);
    } catch (error) {
      setHistoryError((error as Error).message);
    }
  }, []);
  const refreshCatalog = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    setConnectionError('');
    setCatalog(null);
    try {
      const data = await videoJSON<VideoCatalog>('/api/video', { signal });
      if (!signal?.aborted) setCatalog(data);
    } catch (error) {
      if (!signal?.aborted) setConnectionError((error as Error).message);
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void refreshCatalog(c.signal);
    return () => c.abort();
  }, [refreshCatalog]);
  useEffect(() => {
    setSource('concept');
    setFirstURL(reference.image);
    setLastURL('');
    frames.current = null;
    setReferenceLabel(reference.label);
    setReferenceConcept(reference.concept);
    sourceRevision.current = spec.revision;
    setReferenceError('');
    setPreview('');
    setFeaturedId(null);
    setMove('push-in');
    setSeconds(10);
    setPrompt(cinematicPrompt(10, 'push-in'));
  }, [
    reference.image,
    reference.concept,
    reference.label,
    spec.id,
    spec.revision,
  ]);
  useEffect(
    () => () => {
      if (firstURL.startsWith('blob:')) URL.revokeObjectURL(firstURL);
    },
    [firstURL],
  );
  useEffect(
    () => () => {
      if (lastURL.startsWith('blob:')) URL.revokeObjectURL(lastURL);
    },
    [lastURL],
  );
  useEffect(
    () => () => {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const reconcile = useCallback(async () => {
    const history: ProviderJob[] = [];
    let after = '';
    for (let page = 0; page < 10; page++) {
      const data = await videoJSON<{ data: ProviderJob[]; has_more: boolean }>(
        `/api/video?history=1${after ? `&after=${encodeURIComponent(after)}` : ''}`,
      );
      history.push(...data.data);
      if (!data.has_more || !data.data.length) break;
      after = data.data[data.data.length - 1].id;
    }
    persist((current) => reconcileJobs(current, history));
  }, [persist]);
  useEffect(() => {
    if (!hydrated) return;
    let disposed = false,
      timer: ReturnType<typeof setTimeout>,
      failures = 0;
    const controller = new AbortController();
    async function poll() {
      let failed = false;
      // An in-flight submission can finish after Film unmounts. Read its durable
      // receipt on every tick rather than holding an obsolete component snapshot.
      try {
        const latest = readSavedJobs(localStorage.getItem(JOBS_KEY));
        if (JSON.stringify(latest) !== JSON.stringify(jobsRef.current)) {
          jobsRef.current = latest;
          if (!disposed) setJobs(latest);
        }
      } catch (error) {
        failed = true;
        if (!disposed) setPollError((error as Error).message);
      }
      for (const job of jobsRef.current.filter(isRunning)) {
        if (disposed) return;
        try {
          const data = await videoJSON<ProviderJob>(
            `/api/video?id=${encodeURIComponent(job.id)}`,
            { signal: controller.signal },
          );
          if (!disposed)
            persist((current) =>
              current.map((j) =>
                j.id === job.id ? mergeProviderJob(j, data) : j,
              ),
            );
        } catch (error) {
          if (disposed) return;
          failed = true;
          if (
            error instanceof VideoRequestError &&
            [404, 410].includes(error.status)
          ) {
            try {
              persist((current) =>
                current.map((j) =>
                  j.id === job.id
                    ? {
                        ...j,
                        status: 'expired',
                        error: 'This job is no longer available from AIand.',
                      }
                    : j,
                ),
              );
            } catch {
              /* report storage failure below */
            }
          }
          setPollError(
            `${(error as Error).message} Your render has not been resubmitted.`,
          );
        }
      }
      failures = failed ? failures + 1 : 0;
      if (!disposed) {
        if (!failed) setPollError('');
        timer = setTimeout(poll, Math.min(60000, 15000 * 2 ** failures));
      }
    }
    void poll();
    if (jobsRef.current.some(isUncertain))
      void reconcile().catch((error) => {
        if (!disposed) setPollError((error as Error).message);
      });
    // The recursive timer does not reset on every job update and cannot overlap itself.
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [hydrated, persist, reconcile]);
  const cacheAttempts = useRef(new Set<string>());
  const [cacheNotice, setCacheNotice] = useState('');
  useEffect(() => {
    const complete = jobs.filter(
      (j) => j.status === 'completed' && !cacheAttempts.current.has(j.id),
    );
    for (const job of complete) cacheAttempts.current.add(job.id);
    void (async () => {
      for (const job of complete) {
        try {
          const { warning } = await savedFilm(job.id);
          if (warning) setCacheNotice(warning);
        } catch {
          setCacheNotice(
            'A completed film could not be saved offline. Open it to retry, or download your own copy.',
          );
        }
      }
    })();
  }, [jobs]);
  async function guarded(label: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setActionError('');
    setProgress(0);
    try {
      await action();
    } catch (error) {
      const text = (error as Error).message;
      setActionError(text);
      onMessage(text);
    } finally {
      locked.current = false;
      setBusy('');
    }
  }
  const price = catalog?.model?.pricing.find((p) => p.resolution === '768p'),
    readiness = videoReadiness(catalog),
    issue = referenceIssue(firstURL) || referenceError,
    shot = shots[selectedShot],
    projectJobs = jobs.filter((j) => j.projectId === spec.id),
    unresolved = projectJobs.some(isUncertain),
    featured =
      projectJobs.find(
        (j) => j.id === featuredId && j.status === 'completed',
      ) ||
      (featuredId === null
        ? projectJobs.find(
            (j) => j.status === 'completed' && j.concept === reference.concept,
          )
        : undefined);
  function updateSettings(nextSeconds: number, nextMove: CameraMove) {
    setSeconds(nextSeconds);
    setMove(nextMove);
    setPrompt(cinematicPrompt(nextSeconds, nextMove, !!frames.current?.last));
  }
  async function selectConceptReference() {
    frames.current = null;
    sourceRevision.current = spec.revision;
    setSource('concept');
    setReferenceConcept(reference.concept);
    setReferenceLabel(reference.label);
    setFirstURL(reference.image);
    setLastURL('');
    setPreview('');
    setReferenceError('');
    setPrompt(cinematicPrompt(seconds, move));
  }
  async function prepare() {
    if (!api) throw new Error('Open the model and wait for it to load.');
    const captured = await api.frames(shot);
    frames.current = captured;
    sourceRevision.current = spec.revision;
    setSource('model');
    setReferenceConcept(spec.concept);
    setReferenceLabel(`Model · ${shot.name}`);
    setFirstURL(URL.createObjectURL(captured.first));
    setLastURL(URL.createObjectURL(captured.last));
    setReferenceError('');
    setPrompt(cinematicPrompt(seconds, move, true));
    setFeaturedId('');
  }
  async function submit(original?: VideoJob) {
    if (!hydrated)
      throw new Error('Film history must be available before generating.');
    if (checking || readiness || !price)
      throw new Error(
        connectionError || readiness || 'Wait for the connection check.',
      );
    if (!original && issue) throw new Error(issue);
    if (unresolved)
      throw new Error(
        'Check the unresolved submission in job history before generating again.',
      );
    let snapshotFrames = frames.current;
    if (original) {
      if (!original.firstKey)
        throw new Error(
          'This older film has no saved reference. Select an image for a new take.',
        );
      const first = await loadMedia(original.firstKey),
        last = original.lastKey ? await loadMedia(original.lastKey) : undefined;
      if (!first || (original.lastKey && !last))
        throw new Error(
          'The original reference is no longer saved in this browser.',
        );
      snapshotFrames = { first, last };
    }
    const intentId = `intent-${crypto.randomUUID()}`;
    const snapshot: VideoJob = {
      id: intentId,
      intentId,
      projectId: spec.id,
      revision: original?.revision ?? sourceRevision.current,
      shot: original?.shot ?? (source === 'model' ? shot.id : move),
      status: 'preparing',
      prompt: original?.prompt ?? prompt,
      seconds: original?.seconds ?? seconds,
      createdAt: new Date().toISOString(),
      concept: original?.concept ?? referenceConcept,
      referenceLabel: original?.referenceLabel ?? referenceLabel,
      move: original?.move ?? move,
      source: original?.source ?? source,
      firstKey: `${intentId}:first`,
      ...(snapshotFrames?.last ? { lastKey: `${intentId}:last` } : {}),
    };
    // Resolve immutable bytes before upload; never look up the current selection again.
    const first = snapshotFrames?.first || (await imageForFilm(firstURL)),
      last = snapshotFrames?.last;
    try {
      await saveMedia(snapshot.firstKey!, first);
      if (last) await saveMedia(snapshot.lastKey!, last);
    } catch {
      throw new Error(
        'This browser could not save the reference. Free storage space before generating.',
      );
    }
    persist((current) => [snapshot, ...current]);
    let submitted = false;
    try {
      const result = await submitCinematic(
        [first, ...(last ? [last] : [])],
        {
          prompt: snapshot.prompt,
          seconds: snapshot.seconds,
          expectedRate: price.per_second,
        },
        (index) => setBusy(`Preparing reference ${index + 1}…`),
        () => {
          persist((current) =>
            current.map((j) =>
              j.id === intentId
                ? {
                    ...j,
                    status: 'submitting',
                    createdAt: new Date().toISOString(),
                  }
                : j,
            ),
          );
          setBusy('Starting your cinematic…');
          submitted = true;
        },
      );
      if (!/^video_[\w-]+$/.test(result.id) || !result.status)
        throw new Error(
          'The provider returned an incomplete submission response.',
        );
      persist((current) =>
        current.map((j) =>
          j.id === intentId ? mergeProviderJob(j, result) : j,
        ),
      );
      setFeaturedId(result.id);
      setPreview('');
      onMessage(
        result.status === 'failed'
          ? 'AIand could not render this take. The original settings are saved for retry.'
          : 'Your cinematic is rendering. You can leave this panel and return later.',
      );
    } catch (error) {
      const uncertain =
        submitted && (!(error instanceof VideoRequestError) || error.uncertain);
      try {
        persist((current) =>
          current.map((j) =>
            j.id === intentId
              ? {
                  ...j,
                  status: uncertain ? 'submission-unknown' : 'failed',
                  error: (error as Error).message,
                }
              : j,
          ),
        );
      } catch {
        throw new Error(
          'The job may have started, but browser storage failed. Check AIand history before retrying.',
        );
      }
      if (error instanceof VideoRequestError && error.code === 'price_changed')
        await refreshCatalog();
      throw error;
    }
  }
  async function restore(job: VideoJob) {
    if (!job.firstKey)
      throw new Error(
        'This older job has no saved reference. Choose the image again to create a new take.',
      );
    const first = await loadMedia(job.firstKey),
      last = job.lastKey ? await loadMedia(job.lastKey) : undefined;
    if (!first || (job.lastKey && !last))
      throw new Error(
        'The original reference is no longer saved in this browser. Choose the image again.',
      );
    frames.current = { first, last };
    sourceRevision.current = job.revision;
    setFirstURL(URL.createObjectURL(first));
    setLastURL(last ? URL.createObjectURL(last) : '');
    setReferenceLabel(job.referenceLabel || job.shot);
    setReferenceConcept(job.concept || reference.concept);
    setSource(job.source || 'concept');
    setMove(job.move || 'push-in');
    setSeconds(job.seconds);
    setPrompt(job.prompt);
    setSelectedShot(
      Math.max(
        0,
        shots.findIndex((s) => s.id === job.shot),
      ),
    );
    setPreview('');
    setReferenceError('');
    setFeaturedId('');
  }
  async function record() {
    if (!api) throw new Error('Open the model and wait for it to load.');
    const clip = await api.record({ ...shot, seconds }, setProgress);
    await saveMedia(
      `${spec.id}:${spec.concept}:${spec.revision}:${shot.id}`,
      clip,
    );
    setRecordingExtension(clip.type.includes('mp4') ? 'mp4' : 'webm');
    setPreview(URL.createObjectURL(clip));
  }
  async function exportTask() {
    const zip = new JSZip(),
      first = frames.current?.first || (await imageForFilm(firstURL));
    zip.file('first-frame.png', first);
    if (frames.current?.last) zip.file('last-frame.png', frames.current.last);
    zip.file(
      'shot.json',
      JSON.stringify(
        {
          projectId: spec.id,
          concept: referenceConcept,
          revision: sourceRevision.current,
          referenceLabel,
          source,
          prompt,
          seconds,
          move,
          aspect_ratio: '16:9',
          model: catalog?.model?.id || 'minimaxai/minimax-h3',
          price,
        },
        null,
        2,
      ),
    );
    zip.file('building-specification.json', JSON.stringify(spec, null, 2));
    download(
      await zip.generateAsync({ type: 'blob' }),
      'placeform-cinematic-task.zip',
    );
  }
  return (
    <div className="film-layout cinematic-layout">
      <div className="film-story">
        {featured && (
          <CompletedFilm
            key={featured.id}
            job={featured}
            onAnother={() =>
              void guarded('Preparing another take…', () => submit(featured))
            }
          />
        )}
        <div className="film-frames cinematic-reference">
          <figure>
            <img
              src={firstURL}
              alt={`${referenceLabel} — cinematic reference`}
              onError={() =>
                setReferenceError(
                  'The selected reference image could not be displayed. Choose a finished image.',
                )
              }
              onLoad={() => setReferenceError('')}
            />
            <figcaption>
              {referenceLabel} ·{' '}
              {source === 'concept' ? 'SELECTED IMAGE' : 'FIRST FRAME'}
            </figcaption>
          </figure>
          {lastURL && (
            <figure>
              <img src={lastURL} alt="Final model reference frame" />
              <figcaption>LAST FRAME</figcaption>
            </figure>
          )}
        </div>
        <p className="fineprint">
          Full reference image · Fitted to 16:9 without cropping
        </p>
        <div className="jobs">
          <div className="section-kicker">
            YOUR FILMS{' '}
            <button
              className="plain"
              disabled={!!busy || !hydrated}
              onClick={() =>
                void guarded('Checking job history…', async () => {
                  await reconcile();
                  onMessage(
                    'History checked. Any ambiguous submissions remain unresolved.',
                  );
                })
              }
            >
              <RefreshCw size={13} /> Refresh history
            </button>
          </div>
          {cacheNotice && <p className="inline-warning">{cacheNotice}</p>}
          {historyError && <p className="inline-warning">{historyError}</p>}
          {!projectJobs.length && (
            <p className="muted">
              Your cinematic will appear here when it is ready.
            </p>
          )}
          {projectJobs.map((job) => (
            <div className="job" key={job.id}>
              <div>
                <strong>
                  {job.referenceLabel || job.shot} · {job.seconds}s · r
                  {job.revision}
                </strong>
                <output className="job-status">
                  {job.status.replaceAll('_', ' ').replaceAll('-', ' ')}
                </output>
                {job.cost && (
                  <small>
                    {Number(job.cost).toFixed(2)} {job.currency?.toUpperCase()}
                  </small>
                )}
              </div>
              {isRunning(job) && (
                <p>
                  Rendering usually takes a few minutes. Status updates
                  automatically.
                </p>
              )}
              {job.error && (
                <p className="inline-warning">
                  {typeof job.error === 'string'
                    ? job.error
                    : job.error.message}
                </p>
              )}
              {job.status === 'completed' && job.id !== featured?.id && (
                <button
                  className="outline-button"
                  onClick={() => setFeaturedId(job.id)}
                >
                  <Play size={14} /> Watch cinematic
                </button>
              )}
              {['failed', 'canceled', 'preparing'].includes(job.status) && (
                <button
                  className="plain"
                  disabled={!!busy}
                  onClick={() =>
                    void guarded('Restoring saved settings…', () =>
                      restore(job),
                    )
                  }
                >
                  <RefreshCw size={14} /> Load original settings
                </button>
              )}
              {isUncertain(job) && (
                <div>
                  <p className="inline-warning">
                    This request may already be rendering. Refresh history
                    before submitting again. If it remains unresolved, inspect
                    the AIand console.
                  </p>
                  <a
                    className="plain"
                    href="https://console.aiand.com/video"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open AIand job history
                  </a>
                  <button
                    className="plain"
                    disabled={!!busy}
                    onClick={() =>
                      void guarded('Updating the submission…', async () => {
                        persist((current) =>
                          current.map((j) =>
                            j.id === job.id
                              ? {
                                  ...j,
                                  status: 'failed',
                                  error:
                                    'Marked as not submitted after checking AIand. Original settings are available for retry.',
                                }
                              : j,
                          ),
                        );
                      })
                    }
                  >
                    I checked AIand: no job was created
                  </button>
                </div>
              )}
            </div>
          ))}
          {pollError && <output className="inline-warning">{pollError}</output>}
        </div>
      </div>
      <aside className="film-settings">
        <h3>Shot settings</h3>
        <label className="field-label" htmlFor="cinematic-move">
          Camera movement
          <NativeSelect
            id="cinematic-move"
            value={move}
            disabled={!!busy || source === 'model'}
            onChange={(e) =>
              updateSettings(seconds, e.target.value as CameraMove)
            }
          >
            <NativeSelectOption value="push-in">
              Slow forward move
            </NativeSelectOption>
            <NativeSelectOption value="truck-right">
              Gentle move to the right
            </NativeSelectOption>
          </NativeSelect>
        </label>
        <label className="field-label">
          Duration
          <NativeSelect
            disabled={!!busy}
            value={seconds}
            onChange={(e) => updateSettings(Number(e.target.value), move)}
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
            <span>AIand</span>
            <small>{seconds}s · 16:9 · 768p</small>
          </div>

          <output>
            {checking
              ? 'Checking video connection…'
              : (connectionError || readiness)?.includes('AIAND_API_KEY')
                ? 'Connect AIand to generate films.'
                : connectionError || readiness || 'Ready to generate'}
          </output>
          {(connectionError || readiness) && !checking && (
            <p>
              <button className="text-link" onClick={onConnections}>
                Connection settings <ArrowUpRight size={14} />
              </button>
            </p>
          )}
        </div>
        {issue && <p className="inline-warning">{issue}</p>}
        {actionError && (
          <p className="inline-warning" role="alert">
            {actionError}
          </p>
        )}
        <button
          className="accent-button"
          disabled={
            checking ||
            !!readiness ||
            !price ||
            !!issue ||
            !!busy ||
            !hydrated ||
            unresolved ||
            prompt.trim().length < 8
          }
          onClick={() => void guarded('Preparing your cinematic…', submit)}
        >
          Generate cinematic{' '}
          {price
            ? `· ${(Number(price.per_second) * seconds).toFixed(2)} ${price.currency.toUpperCase()}`
            : ''}
          <ArrowUpRight size={15} />
        </button>
        {busy && (
          <div className="film-progress">
            <output>{busy}</output>
            <Progress value={busy.includes('Recording') ? progress : null} />
          </div>
        )}
        <p className="fineprint">
          Each click starts one take. Completed films are saved in this browser
          while Film is open; download an MP4 to keep your own copy. AIand
          retains output for 30 days.
        </p>
        <details className="cinematic-advanced">
          <summary>Advanced controls</summary>
          <label className="field-label">
            SHOT PROMPT
            <textarea
              value={prompt}
              disabled={!!busy}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={7000}
            />
          </label>
          <p className="fineprint">
            Changing movement or duration rebuilds this prompt. Editing the
            prompt leaves the reference image unchanged.
          </p>
          <button
            className="outline-button"
            disabled={!!busy}
            onClick={() =>
              setPrompt(cinematicPrompt(seconds, move, !!frames.current?.last))
            }
          >
            Reset cinematic prompt
          </button>
          <button
            className="outline-button"
            disabled={!!busy || checking}
            onClick={() => void refreshCatalog()}
          >
            <RefreshCw size={14} /> Refresh connection
          </button>
          <button
            className="outline-button"
            disabled={!!busy}
            onClick={() => void selectConceptReference()}
          >
            Use selected concept image
          </button>
          <button className="outline-button" onClick={onToggleModelTools}>
            {modelToolsVisible ? 'Hide model tools' : 'Open model tools'}
          </button>
          <label className="field-label">
            MODEL CAMERA
            <NativeSelect
              value={selectedShot}
              disabled={!!busy}
              onChange={(e) => {
                setSelectedShot(Number(e.target.value));
                if (source === 'model') void selectConceptReference();
              }}
            >
              {shots.map((s, i) => (
                <NativeSelectOption key={s.id} value={i}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <p className="fineprint">
            Model frames use the active 3D model, concept {spec.concept}. It is
            an approximation of the architecture.
          </p>
          <button
            className="outline-button"
            disabled={!api || !!busy}
            onClick={() => void guarded('Rendering model frames…', prepare)}
          >
            Use model frames
          </button>
          <button
            className="outline-button"
            disabled={!api || !!busy}
            onClick={() => api?.play({ ...shot, seconds })}
          >
            <Play size={15} /> Preview model camera
          </button>
          <button
            className="outline-button"
            disabled={!api || !!busy}
            onClick={() =>
              void guarded('Recording the original model…', record)
            }
          >
            <Film size={15} /> Record model clip
          </button>
          <button
            className="outline-button"
            disabled={!!busy || !!issue}
            onClick={() =>
              void guarded('Exporting cinematic task…', exportTask)
            }
          >
            <Download size={15} /> Export video task
          </button>
          {preview && (
            <div className="film-video">
              <video controls src={preview} />
              <a
                className="outline-button"
                href={preview}
                download={`placeform-model.${recordingExtension}`}
              >
                Download model recording
              </a>
            </div>
          )}
          <p className="fineprint">
            MiniMax H3 · paid API usage. Submitted renders cannot be stopped.
          </p>
        </details>
      </aside>
    </div>
  );
}
