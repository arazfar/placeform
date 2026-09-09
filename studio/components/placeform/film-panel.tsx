'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Download, Film, Square } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type { SceneAPI } from './scene';
import type { BuildingSpec, ConceptId } from '@/lib/spec';
import { demoConcept, demoConcepts } from '@/lib/demo-catalog';
import { download } from '@/lib/download';
import { saveMedia, loadMedia } from '@/lib/media-store';
import {
  disposeSnapshot,
  filmIdentity,
  snapshotGLB,
  restoreSnapshot,
  type ModelSnapshot,
} from '@/lib/cinematic-model';
import { planSequence, type CinematicSequence } from '@/lib/cinematic-sequence';
import {
  CinematicRenderer,
  renderFilm,
  throwIfAborted,
  filmCodec,
  nextPaint,
} from '@/lib/cinematic-renderer';
import {
  readModelFilms,
  saveModelFilm,
  recoverModelFilms,
  modelFilmPackage,
  type ModelFilmJob,
} from '@/lib/model-films';
import LegacyFilms from './legacy-films';

export default function FilmPanel({
  spec,
  api,
  onMessage,
  visible,
  onConcept,
}: {
  spec: BuildingSpec;
  api?: SceneAPI;
  onMessage: (message: string) => void;
  visible: boolean;
  onConcept: (concept: ConceptId) => void;
}) {
  const [jobs, setJobs] = useState<ModelFilmJob[]>([]),
    [ready, setReady] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [progress, setProgress] = useState(0);
  const [story, setStory] = useState<{
    sequence: CinematicSequence;
    images: string[];
  }>();
  const [featured, setFeatured] = useState<{
    job: ModelFilmJob;
    blob: Blob;
    url: string;
  }>();
  const [format, setFormat] = useState(''),
    [codecError, setCodecError] = useState('');
  const preview = useRef<HTMLDivElement>(null),
    abort = useRef<AbortController | null>(null),
    mounted = useRef(true);
  const update = useCallback(async (job: ModelFilmJob) => {
    await saveModelFilm(job);
    if (mounted.current)
      setJobs((current) => [job, ...current.filter((j) => j.id !== job.id)]);
  }, []);
  useEffect(() => {
    mounted.current = true;
    void readModelFilms()
      .then(async (saved) => {
        const recovered = recoverModelFilms(saved);
        for (let i = 0; i < saved.length; i++)
          if (saved[i] !== recovered[i]) await saveModelFilm(recovered[i]);
        if (mounted.current) {
          setJobs(recovered);
          setReady(true);
        }
      })
      .catch((e) => setError(e.message));
    void filmCodec()
      .then((f) => setFormat(f.extension.toUpperCase()))
      .catch((e) => setCodecError(e.message));
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(
    () => () => {
      if (featured) URL.revokeObjectURL(featured.url);
    },
    [featured],
  );
  useEffect(() => {
    setStory(undefined);
    setSourceError('');
    if (!visible || !api || busy) return;
    let disposed = false;
    const urls: string[] = [];
    let snapshot: ModelSnapshot | undefined,
      renderer: CinematicRenderer | undefined;
    void (async () => {
      try {
        snapshot = api.snapshot(filmIdentity(spec));
        const sequence = planSequence(snapshot);
        renderer = new CinematicRenderer(snapshot, sequence, 640, 360);
        for (let i = 0; i < 4; i++) {
          if (disposed) return;
          urls.push(
            URL.createObjectURL(await renderer.thumbnail(i * 144 + 72)),
          );
          await nextPaint();
        }
        if (!disposed) {
          setStory({ sequence, images: [...urls] });
        }
      } catch (e) {
        if (!disposed) setSourceError((e as Error).message);
      } finally {
        renderer?.dispose();
        if (snapshot) disposeSnapshot(snapshot);
        if (disposed) urls.forEach((url) => URL.revokeObjectURL(url));
      }
    })();
    return () => {
      disposed = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [api, spec, visible, busy]);

  async function runPreview() {
    if (!api || abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setError('');
    setBusy('Previewing sequence');
    let snapshot: ModelSnapshot | undefined,
      renderer: CinematicRenderer | undefined;
    try {
      snapshot = api.snapshot(filmIdentity(spec));
      const sequence = planSequence(snapshot);
      renderer = new CinematicRenderer(snapshot, sequence, 960, 540);
      await renderer.ready();
      throwIfAborted(controller.signal);
      preview.current?.replaceChildren(renderer.canvas);
      const start = performance.now();
      while (true) {
        throwIfAborted(controller.signal);
        const frame = Math.min(
          575,
          Math.floor(((performance.now() - start) / 1000) * 24),
        );
        renderer.render(frame);
        setProgress(((frame + 1) / 576) * 100);
        if (frame === 575) break;
        await new Promise((resolve) => setTimeout(resolve, 1000 / 24));
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      preview.current?.replaceChildren();
      renderer?.dispose();
      if (snapshot) disposeSnapshot(snapshot);
      abort.current = null;
      if (mounted.current) setBusy('');
    }
  }
  async function generate(original?: ModelFilmJob) {
    if (abort.current || (!original && !api)) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy('Preparing model');
    setProgress(0);
    setError('');
    let snapshot: ModelSnapshot | undefined, job: ModelFilmJob | undefined;
    try {
      // Capture synchronously before awaiting any encoder or storage operation.
      if (!original) snapshot = api!.snapshot(filmIdentity(spec));
      else {
        const glb = await loadMedia(`${original.id}:model`);
        if (!glb)
          throw new Error('This film’s saved model is no longer available.');
        snapshot = await restoreSnapshot(glb, original.spec);
      }
      throwIfAborted(controller.signal);
      const sequence = original?.sequence || planSequence(snapshot);
      job = {
        kind: 'three-model',
        id: `model-film-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        status: 'preparing',
        spec: snapshot.spec,
        sequence,
      };
      const glb = await snapshotGLB(snapshot);
      await saveMedia(`${job.id}:model`, glb);
      const renderer = new CinematicRenderer(snapshot, sequence, 640, 360);
      try {
        await saveMedia(`${job.id}:thumbnail`, await renderer.thumbnail());
      } finally {
        renderer.dispose();
      }
      await update(job);
      throwIfAborted(controller.signal);
      job = { ...job, status: 'rendering' };
      await update(job);
      setBusy(`Rendering ${demoConcept(job.spec.concept).name}`);
      const result = await renderFilm(
        snapshot,
        sequence,
        (frame) => {
          if (mounted.current) setProgress((frame / 576) * 100);
        },
        controller.signal,
      );
      job = { ...job, status: 'completed', extension: result.extension };
      if (mounted.current)
        setFeatured({
          job,
          blob: result.blob,
          url: URL.createObjectURL(result.blob),
        });
      try {
        await saveMedia(`${job.id}:video`, result.blob);
        await update(job);
      } catch {
        setError(
          'Your film is ready, but this browser could not save it. Download the video now to keep it.',
        );
      }
      onMessage(`${demoConcept(job.spec.concept).name} cinematic is ready.`);
    } catch (e) {
      const cancelled = (e as Error).name === 'AbortError';
      if (job) {
        job = {
          ...job,
          status: cancelled ? 'cancelled' : 'failed',
          error: cancelled ? undefined : (e as Error).message,
        };
        await update(job).catch(() => {});
      }
      if (mounted.current) setError(cancelled ? '' : (e as Error).message);
    } finally {
      if (snapshot) disposeSnapshot(snapshot);
      abort.current = null;
      if (mounted.current) setBusy('');
    }
  }
  async function watch(job: ModelFilmJob) {
    try {
      const blob = await loadMedia(`${job.id}:video`);
      if (!blob)
        throw new Error(
          'The saved video is unavailable. Render the saved model again.',
        );
      setFeatured({ job, blob, url: URL.createObjectURL(blob) });
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function exportPackage(job: ModelFilmJob) {
    try {
      download(
        await modelFilmPackage(
          job,
          featured?.job.id === job.id ? featured.blob : undefined,
        ),
        `placeform-${job.spec.concept}-r${job.spec.revision}-film.zip`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const shown = jobs.filter((j) => j.spec.id === spec.id);
  return (
    <div className="film-layout cinematic-layout model-cinema">
      <div className="film-story">
        {featured && (
          <section className="cinematic-result">
            <div className="section-kicker">
              {demoConcept(featured.job.spec.concept).name} · r
              {featured.job.spec.revision} · 24 seconds
            </div>
            <video
              controls
              playsInline
              src={featured.url}
              preload="metadata"
              aria-label="Completed model cinematic"
            />
            <div className="film-actions">
              <a
                className="accent-button"
                href={featured.url}
                download={`placeform-${featured.job.spec.concept}-r${featured.job.spec.revision}.${featured.job.extension}`}
              >
                <Download size={15} /> Download{' '}
                {featured.job.extension?.toUpperCase()}
              </a>
              <button
                className="outline-button"
                onClick={() => void exportPackage(featured.job)}
              >
                Export film package
              </button>
            </div>
          </section>
        )}
        <div
          ref={preview}
          className="sequence-preview"
          aria-label="Cinematic sequence preview"
        />
        <div className="film-source-heading">
          <div className="section-kicker">SELECTED 3D MODEL</div>
          <h3>
            {demoConcept(spec.concept).name} <span>r{spec.revision}</span>
          </h3>
        </div>
        {story ? (
          <div className="film-storyboard">
            {story.sequence.shots.map((shot, i) => (
              <figure key={shot.id}>
                <img
                  src={story.images[i]}
                  alt={`${demoConcept(spec.concept).name}: ${shot.name}`}
                />
                <figcaption>
                  <span>
                    {String(i * 6).padStart(2, '0')}—{(i + 1) * 6}s
                  </span>
                  <strong>{shot.name}</strong>
                  <p>{shot.description}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="muted">
            {busy
              ? 'The captured model is being rendered.'
              : 'Preparing the selected model’s camera sequence…'}
          </p>
        )}
        <div className="jobs">
          <div className="section-kicker">YOUR MODEL FILMS</div>
          {!shown.length && (
            <p className="muted">
              Completed films and their original models are saved in this
              browser.
            </p>
          )}
          {shown.map((job) => (
            <div className="job" key={job.id}>
              <div>
                <strong>
                  {demoConcept(job.spec.concept).name} · r{job.spec.revision}
                </strong>
                <output className="job-status">{job.status}</output>
              </div>
              {job.error && <p className="inline-warning">{job.error}</p>}
              <div className="film-actions">
                {job.status === 'completed' && (
                  <button
                    className="outline-button"
                    onClick={() => void watch(job)}
                  >
                    <Play size={14} /> Watch film
                  </button>
                )}
                <button
                  className="plain"
                  disabled={!!busy}
                  onClick={() => void generate(job)}
                >
                  Render saved model again
                </button>
                <button
                  className="plain"
                  onClick={() => void exportPackage(job)}
                >
                  Export package
                </button>
              </div>
            </div>
          ))}
        </div>
        <LegacyFilms projectId={spec.id} />
      </div>
      <aside className="film-settings">
        <h3>Cinematic sequence</h3>
        <label className="field-label">
          Model
          <NativeSelect
            value={spec.concept}
            onChange={(e) => onConcept(e.target.value as ConceptId)}
          >
            {demoConcepts.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <div className="cinema-format">
          <strong>24 seconds · 1080p</strong>
          <span>24 fps · 16:9 · {format || 'Checking video support…'}</span>
        </div>
        <p className="fineprint">
          Four choreographed shots rendered directly from the selected model,
          with its original materials and current daylight.
        </p>
        <button
          className="outline-button"
          disabled={!api || !!busy || !story}
          onClick={() => void runPreview()}
        >
          <Play size={15} /> Preview sequence
        </button>
        <button
          className="accent-button"
          disabled={!api || !ready || !!busy || !story || !format}
          onClick={() => void generate()}
        >
          <Film size={15} /> Generate cinematic
        </button>
        {busy && (
          <div className="film-progress">
            <output aria-live="polite">
              {busy} · {Math.round(progress)}%
            </output>
            <Progress value={progress} />
            <button
              className="outline-button"
              onClick={() => abort.current?.abort()}
            >
              <Square size={13} /> Cancel
            </button>
          </div>
        )}
        {(error || sourceError || codecError) && (
          <p className="inline-warning" role="alert">
            {error || sourceError || codecError}
          </p>
        )}
        <p className="fineprint">
          Silent film · Rendered on this device. You can explore other models
          while rendering. Keep this page open until your film is ready.
        </p>
      </aside>
    </div>
  );
}
