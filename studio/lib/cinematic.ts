import { conceptImage, type BuildingSpec, type ConceptId } from './spec';

export type CameraMove = 'push-in' | 'truck-right';
export type FilmReference = {
  concept: ConceptId;
  label: string;
  image: string;
};
export function filmReference(
  spec: BuildingSpec,
  concept: ConceptId,
  label: string,
): FilmReference {
  return { concept, label, image: conceptImage(spec, concept) };
}
export function referenceIssue(image: string) {
  return !image || /concept-pending\.svg(?:[?#]|$)/.test(image)
    ? 'Select a finished concept image before generating a cinematic.'
    : null;
}
export function cinematicPrompt(
  seconds: number,
  move: CameraMove,
  lastFrame = false,
) {
  const alignment = lastFrame
    ? `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${seconds.toFixed(2)}-second mark of the target video.`
    : 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
  const camera = lastFrame
    ? 'The camera travels smoothly from the first reference viewpoint to the final reference viewpoint, reaching Picture 2 at the end of the shot. Follow one continuous, physically plausible path with a steady horizon.'
    : move === 'push-in'
      ? 'The camera pushes in with small amplitude at slow speed, advancing only slightly toward the architecture. Preserve the overall framing and keep the building comfortably within the composition; use subtle natural parallax rather than a lens zoom.'
      : 'The camera trucks right with small amplitude at slow speed, moving only a short distance with subtle natural parallax. Keep the same visible facade and overall composition; do not orbit behind the building or reveal unseen architecture.';
  return `${alignment}\n\nintegrated_multimodal_description: [Shot 1] A realistic architectural cinematography study begins in the exact composition of Picture 1. Preserve the referenced architecture, silhouette, proportions, facade rhythm, material colors, visible openings, landscape and spatial relationships. Retain the image's lighting direction, time of day and weather throughout this single continuous ${seconds}-second take. ${camera} Ease gently into the movement and settle into a quiet final hold. Keep architectural edges and verticals stable, materials physically consistent, and reflections naturally responsive to the small camera movement. Only existing vegetation moves subtly in a light breeze; any existing distant people remain unobtrusive and move naturally. No added people, structures, invented facade details, geometry warping, cuts, speed ramps, dramatic reveals, camera shake, titles or narration.\n\noverall_soundscape: A quiet, continuous bed of soft outdoor air, with faint leaf rustle only where vegetation is present. Restrained, realistic environmental sound with no speech, singing, prominent traffic, or sudden effects.\n\nnon_diegetic_music: N/A`;
}

export type ProviderJob = {
  id: string;
  status: string;
  model: string;
  prompt: string;
  seconds: number;
  created_at: number;
  cost?: string;
  currency?: string;
  error?: { message: string; code?: string } | string | null;
};
export type VideoJob = {
  id: string;
  intentId?: string;
  projectId: string;
  revision: number;
  shot: string;
  status: string;
  prompt: string;
  seconds: number;
  createdAt: string;
  concept?: ConceptId;
  referenceLabel?: string;
  firstKey?: string;
  lastKey?: string;
  move?: CameraMove;
  source?: 'concept' | 'model';
  model?: string;
  cost?: string;
  currency?: string;
  error?: ProviderJob['error'];
  review?: string[];
};
export const JOBS_KEY = 'placeform-video-jobs';
export const isUncertain = (j: VideoJob) =>
  ['submitting', 'submission-unknown'].includes(j.status);
export const isRunning = (j: VideoJob) =>
  j.id.startsWith('video_') &&
  !['completed', 'failed', 'canceled', 'expired'].includes(j.status) &&
  !isUncertain(j);
export function mergeProviderJob(job: VideoJob, result: ProviderJob): VideoJob {
  // Provider fields cannot overwrite the local project or reference snapshot.
  return {
    ...job,
    id: result.id,
    status: result.status,
    model: result.model,
    cost: result.cost,
    currency: result.currency,
    error: result.error,
  };
}
export function reconcileJobs(jobs: VideoJob[], history: ProviderJob[]) {
  const used = new Set(jobs.filter((j) => !isUncertain(j)).map((j) => j.id));
  const uncertain = jobs.filter(isUncertain);
  const matches = (j: VideoJob, r: ProviderJob) =>
    !used.has(r.id) &&
    r.prompt === j.prompt &&
    r.seconds === j.seconds &&
    Math.abs(r.created_at * 1000 - Date.parse(j.createdAt)) < 300000;
  return jobs.map((j) => {
    if (!isUncertain(j)) return j;
    const candidates = history.filter((r) => matches(j, r));
    if (
      candidates.length !== 1 ||
      uncertain.filter((other) => matches(other, candidates[0])).length !== 1
    )
      return j;
    used.add(candidates[0].id);
    return mergeProviderJob(j, candidates[0]);
  });
}
export function readSavedJobs(raw: string | null): VideoJob[] {
  const data: unknown = JSON.parse(raw || '[]');
  if (
    !Array.isArray(data) ||
    data.some(
      (j) =>
        !j ||
        typeof j.id !== 'string' ||
        typeof j.projectId !== 'string' ||
        typeof j.status !== 'string' ||
        typeof j.prompt !== 'string' ||
        typeof j.seconds !== 'number',
    )
  ) {
    throw new Error(
      'Saved film history could not be read. It has been left intact.',
    );
  }
  return data;
}
