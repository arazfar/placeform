import area from '@turf/area';
import bearing from '@turf/bearing';
import centroid from '@turf/centroid';
import type { BuildingSpec, Site } from './spec';
export function siteArea(site: Site) {
  return area(site.polygon);
}
export function updateBoundary(
  site: Site,
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
): Site {
  const center = centroid(polygon).geometry.coordinates as [number, number];
  const ring = polygon.geometry.coordinates[0];
  let longest = 0,
    rotation = 90;
  for (let i = 1; i < ring.length; i++) {
    const dx =
        (ring[i][0] - ring[i - 1][0]) * Math.cos((center[1] * Math.PI) / 180),
      dy = ring[i][1] - ring[i - 1][1],
      length = dx * dx + dy * dy;
    if (length > longest) {
      longest = length;
      rotation = (bearing(ring[i - 1], ring[i]) + 360) % 180;
    }
  }
  return {
    ...site,
    polygon,
    center,
    rotation: Math.round(rotation * 100) / 100,
  };
}
export function toLngLat(x: number, z: number, site: Site): [number, number] {
  const a = ((site.rotation - 90) * Math.PI) / 180;
  const east = x * Math.cos(a) - z * Math.sin(a),
    north = -x * Math.sin(a) - z * Math.cos(a);
  return [
    site.center[0] +
      east / (111320 * Math.cos((site.center[1] * Math.PI) / 180)),
    site.center[1] + north / 111320,
  ];
}
export function footprint(s: BuildingSpec): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-s.length / 2, -s.width / 2],
          [s.length / 2, -s.width / 2],
          [s.length / 2, s.width / 2],
          [-s.length / 2, s.width / 2],
          [-s.length / 2, -s.width / 2],
        ].map(([x, z]) => toLngLat(x, z, s.site)),
      ],
    },
  };
}
function inside(p: number[], ring: number[][]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
export function fitsSite(s: BuildingSpec) {
  return footprint(s).geometry.coordinates[0].every((p) =>
    inside(p, s.site.polygon.geometry.coordinates[0]),
  );
}
export function siteAt(center: [number, number], name: string): Site {
  const dx = 57 / (111320 * Math.cos((center[1] * Math.PI) / 180)),
    dy = 45 / 111320;
  return {
    name,
    location: name,
    center,
    rotation: 90,
    notes:
      'Illustrative study boundary. Survey, ownership, permitted use, local context, utilities and engineering feasibility require research.',
    polygon: {
      type: 'Feature',
      properties: { mode: 'polygon' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [center[0] - dx, center[1] - dy],
            [center[0] + dx, center[1] - dy],
            [center[0] + dx, center[1] + dy],
            [center[0] - dx, center[1] + dy],
            [center[0] - dx, center[1] - dy],
          ].map((coordinate) =>
            coordinate.map((value) => Number(value.toFixed(9))),
          ),
        ],
      },
    },
  };
}
