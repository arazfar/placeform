'use client';
import { useEffect, useState } from 'react';
import {
  JOBS_KEY,
  readSavedJobs,
  reconcileJobs,
  type VideoJob,
  type ProviderJob,
} from '@/lib/cinematic';
import { savedFilm, videoJSON } from '@/lib/video-client';

export default function LegacyFilms({ projectId }: { projectId: string }) {
  const [jobs, setJobs] = useState<VideoJob[]>([]),
    [notice, setNotice] = useState(''),
    [url, setURL] = useState('');
  useEffect(() => {
    try {
      setJobs(readSavedJobs(localStorage.getItem(JOBS_KEY)));
    } catch (e) {
      setNotice((e as Error).message);
    }
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const shown = jobs.filter((j) => j.projectId === projectId);
  if (!shown.length && !notice) return null;
  async function refresh() {
    try {
      const all: ProviderJob[] = [];
      let after = '';
      for (let page = 0; page < 10; page++) {
        const result = await videoJSON<{
          data: ProviderJob[];
          has_more: boolean;
        }>(
          `/api/video?history=1${after ? `&after=${encodeURIComponent(after)}` : ''}`,
        );
        all.push(...result.data);
        if (!result.has_more || !result.data.length) break;
        after = result.data[result.data.length - 1].id;
      }
      const latest = reconcileJobs(
        readSavedJobs(localStorage.getItem(JOBS_KEY)),
        all,
      ).map((j) => {
        const result = all.find((r) => r.id === j.id);
        return result
          ? { ...j, status: result.status, error: result.error }
          : j;
      });
      localStorage.setItem(JOBS_KEY, JSON.stringify(latest));
      setJobs(latest);
      setNotice('');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <details className="cinematic-advanced">
      <summary>Earlier AIand films · {shown.length}</summary>
      <button className="outline-button" onClick={() => void refresh()}>
        Refresh earlier films
      </button>
      {shown.map((j) => (
        <div className="job" key={j.id}>
          <span>
            {j.referenceLabel || j.shot} · {j.seconds}s · {j.status}
          </span>
          {j.status === 'completed' && (
            <button
              className="plain"
              onClick={() => {
                void savedFilm(j.id)
                  .then(({ blob, warning }) => {
                    setURL(URL.createObjectURL(blob));
                    setNotice(warning || '');
                  })
                  .catch((e) => setNotice(e.message));
              }}
            >
              Watch film
            </button>
          )}
        </div>
      ))}
      {url && (
        <>
          <video controls playsInline src={url} />
          <a
            className="outline-button"
            href={url}
            download="placeform-legacy.mp4"
          >
            Download MP4
          </a>
        </>
      )}
      {notice && <p className="inline-warning">{notice}</p>}
    </details>
  );
}
