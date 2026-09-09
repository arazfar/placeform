import JSZip from 'jszip';
import { loadMedia, saveMedia } from './media-store';
import { type CinematicSequence } from './cinematic-sequence';
import type { BuildingSpec } from './spec';
import { filmIdentity, sameFilmIdentity } from './cinematic-model';

export type ModelFilmJob = {
  kind: 'three-model';
  id: string;
  createdAt: string;
  status:
    | 'preparing'
    | 'rendering'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'interrupted';
  spec: BuildingSpec;
  sequence: CinematicSequence;
  error?: string;
  extension?: 'mp4' | 'webm';
};
const indexKey = 'model-film-index-v1';
export async function readModelFilms(): Promise<ModelFilmJob[]> {
  const blob = await loadMedia(indexKey);
  if (!blob) return [];
  return parseModelFilms(await blob.text());
}
export function parseModelFilms(raw: string): ModelFilmJob[] {
  const jobs = JSON.parse(raw);
  if (
    !Array.isArray(jobs) ||
    jobs.some(
      (j) =>
        !j ||
        j.kind !== 'three-model' ||
        typeof j.id !== 'string' ||
        !j.spec ||
        !['A', 'B', 'C', 'D'].includes(j.spec.concept) ||
        !j.spec.site ||
        !j.sequence ||
        j.sequence.version !== 1 ||
        j.sequence.frames !== 576 ||
        !Array.isArray(j.sequence.shots) ||
        j.sequence.shots.length !== 4 ||
        !j.sequence.bounds ||
        !sameFilmIdentity(j.sequence.source, filmIdentity(j.spec)) ||
        ![
          'preparing',
          'rendering',
          'completed',
          'cancelled',
          'failed',
          'interrupted',
        ].includes(j.status),
    )
  )
    throw new Error(
      'Saved model film history could not be read. It has been left intact.',
    );
  return jobs;
}
let writes: Promise<unknown> = Promise.resolve();
export function saveModelFilm(job: ModelFilmJob) {
  const write = writes
    .catch(() => {})
    .then(async () => {
      const jobs = await readModelFilms();
      const next = [job, ...jobs.filter((j) => j.id !== job.id)];
      await saveMedia(
        indexKey,
        new Blob([JSON.stringify(next)], { type: 'application/json' }),
      );
    });
  writes = write;
  return write;
}
export function recoverModelFilms(jobs: ModelFilmJob[]): ModelFilmJob[] {
  return jobs.map((j) =>
    ['preparing', 'rendering'].includes(j.status)
      ? {
          ...j,
          status: 'interrupted',
          error:
            'Rendering was interrupted. Render the saved model again to finish this take.',
        }
      : j,
  );
}
export async function modelFilmPackage(job: ModelFilmJob, video?: Blob) {
  const glb = await loadMedia(`${job.id}:model`);
  if (!glb)
    throw new Error(
      'This film’s saved model is no longer available in this browser.',
    );
  const zip = new JSZip();
  zip.file('model.glb', glb);
  zip.file('building-specification.json', JSON.stringify(job.spec, null, 2));
  zip.file('sequence.json', JSON.stringify(job.sequence, null, 2));
  zip.file(
    'source.json',
    JSON.stringify(
      {
        ...job.sequence.source,
        filmId: job.id,
        renderer: 'three-model',
        sequenceVersion: 1,
      },
      null,
      2,
    ),
  );
  const thumbnail = await loadMedia(`${job.id}:thumbnail`);
  if (thumbnail) zip.file('thumbnail.png', thumbnail);
  const clip = video || (await loadMedia(`${job.id}:video`));
  if (clip)
    zip.file(
      `cinematic.${job.extension || (clip.type.includes('mp4') ? 'mp4' : 'webm')}`,
      clip,
    );
  return zip.generateAsync({ type: 'blob' });
}
