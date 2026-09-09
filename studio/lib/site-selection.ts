import type { BuildingSpec, Site } from './spec';
import { siteAt, updateBoundary } from './site';

export type MapPoint = { x: number; y: number };
export type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export function selectionRect(start: MapPoint, end: MapPoint): SelectionRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
export function clampPoint(
  point: MapPoint,
  width: number,
  height: number,
): MapPoint {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

// Only an owner-pointer release can produce a rectangle. Every cancellation
// discards the session, so a later release cannot accidentally commit it.
export class SiteSelection {
  private drag?: { pointer: number; start: MapPoint; end: MapPoint };
  get pointer() {
    return this.drag?.pointer;
  }
  begin(pointer: number, point: MapPoint) {
    if (this.drag) {
      this.cancel();
      return;
    }
    this.drag = { pointer, start: point, end: point };
  }
  move(pointer: number, point: MapPoint) {
    if (!this.drag || this.drag.pointer !== pointer) return;
    this.drag.end = point;
    return selectionRect(this.drag.start, point);
  }
  finish(pointer: number, point: MapPoint) {
    const rect = this.move(pointer, point);
    if (!rect) return;
    this.cancel();
    if (rect.width >= 10 && rect.height >= 10) return rect;
  }
  cancel() {
    this.drag = undefined;
  }
}

export function rectanglePolygon(
  rect: SelectionRect,
  unproject: (point: [number, number]) => [number, number],
): GeoJSON.Feature<GeoJSON.Polygon> | undefined {
  if (
    ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return;
  const { left, top, width, height } = rect;
  const ring = [
    [left, top + height],
    [left + width, top + height],
    [left + width, top],
    [left, top],
  ].map(([x, y]) => unproject([x, y]));
  if (
    ring.some(
      ([lng, lat]) =>
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        Math.abs(lng) > 180 ||
        Math.abs(lat) > 85,
    )
  )
    return;
  // Reject an antimeridian-spanning rectangle instead of creating a global site.
  if (
    Math.max(...ring.map(([lng]) => lng)) -
      Math.min(...ring.map(([lng]) => lng)) >
    180
  )
    return;
  ring.push([...ring[0]]);
  return {
    type: 'Feature',
    properties: { mode: 'polygon' },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

export function selectedSite(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  current: Site,
  searched?: Site,
): Site {
  const selected = updateBoundary(current, polygon);
  const nearby = (site: Site) => {
    const dy = (selected.center[1] - site.center[1]) * 111320;
    const dx =
      (selected.center[0] - site.center[0]) *
      111320 *
      Math.cos((selected.center[1] * Math.PI) / 180);
    return Math.hypot(dx, dy) < 5000;
  };
  const context =
    searched && nearby(searched)
      ? searched
      : nearby(current)
        ? current
        : siteAt(
            selected.center,
            `${selected.center[1].toFixed(4)}, ${selected.center[0].toFixed(4)}`,
          );
  return updateBoundary(context, polygon);
}

export function centeredSite(
  spec: BuildingSpec,
  center: [number, number],
  searched?: Site,
): Site {
  // Fit the current footprint even when its saved orientation is diagonal.
  const half = Math.max(57, Math.hypot(spec.length, spec.width) * 0.65);
  const dx = half / (111320 * Math.cos((center[1] * Math.PI) / 180));
  const dy = half / 111320;
  const polygon = rectanglePolygon(
    {
      left: center[0] - dx,
      top: center[1] - dy,
      width: 2 * dx,
      height: 2 * dy,
    },
    ([lng, lat]) => [lng, lat],
  );
  if (!polygon) return spec.site;
  return selectedSite(polygon, spec.site, searched);
}
