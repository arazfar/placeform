import type { BuildingSpec, SavedState } from './spec';
type ProjectStore = {
  active?: string;
  projects: SavedState[];
  images?: Record<string, string>;
};
/** Store each imported image once, even when referenced by many undo versions. */
export function encodeProjects(data: ProjectStore) {
  const images: Record<string, string> = {},
    keys = new Map<string, string>();
  const pack = (s: BuildingSpec) => ({
    ...s,
    assets: Object.fromEntries(
      Object.entries(s.assets || {}).map(([id, url]) => {
        if (!url?.startsWith('data:image/')) return [id, url];
        let key = keys.get(url);
        if (!key) {
          key = `image-${keys.size + 1}`;
          keys.set(url, key);
          images[key] = url;
        }
        return [id, `@${key}`];
      }),
    ),
  });
  return JSON.stringify({
    ...data,
    images,
    projects: data.projects.map((p) => ({
      ...p,
      project: pack(p.project),
      past: p.past.map(pack),
      future: p.future.map(pack),
    })),
  });
}
export function decodeProjects(raw: string | null): ProjectStore {
  const data = JSON.parse(raw || '{}');
  const unpack = (s: BuildingSpec) => ({
    ...s,
    assets: Object.fromEntries(
      Object.entries(s.assets || {}).map(([id, url]) => [
        id,
        url?.startsWith('@') ? data.images?.[url.slice(1)] || '' : url,
      ]),
    ),
  });
  return {
    active: data.active,
    projects: (Array.isArray(data.projects) ? data.projects : []).map(
      (p: SavedState) => ({
        ...p,
        project: unpack(p.project),
        past: (p.past || []).map(unpack),
        future: (p.future || []).map(unpack),
      }),
    ),
  };
}
export async function importedImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const c = canvas.getContext('2d');
  if (!c) {
    bitmap.close();
    throw new Error('Image decoding is unavailable.');
  }
  c.fillStyle = '#f5f4ef';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.88);
}
