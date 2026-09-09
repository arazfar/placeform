import { demoConcept } from './demo-catalog';
import { preparedPresidio } from './presidio';
import type { sources } from './research';
export type ConceptId = 'A' | 'B' | 'C' | 'D';
export type Feature = 'massing' | 'facade' | 'roof' | 'landscape' | 'canopy';
export type View =
  | 'perspective'
  | 'entrance'
  | 'aerial'
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'detail';
export type Site = {
  name: string;
  location: string;
  center: [number, number];
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
  rotation: number;
  notes: string;
};
export type BuildingSpec = {
  demoContext?: 'presidio';
  boundaryConfirmed?: boolean;
  reviewedConcept?: ConceptId;
  imageReviews?: Partial<
    Record<ConceptId, { signature: string; reviewed: boolean }>
  >;
  schema: 1;
  id: string;
  revision: number;
  name: string;
  concept: ConceptId;
  site: Site;
  length: number;
  width: number;
  height: number;
  finDepth: number;
  finSpacing: number;
  material: ConceptId;
  roof: ConceptId;
  landscape: ConceptId;
  canopyDepth: number;
  locks: Feature[];
  view: View;
  hour: number;
  brief: string;
  researchReady: boolean;
  siteDesignPending?: boolean;
  evidence?: typeof sources;
  directions?: typeof concepts;
  assets: Partial<Record<ConceptId, string>>;
};
export const concepts: {
  id: ConceptId;
  name: string;
  subtitle: string;
  description: string;
  inspiration: string;
  tradeoff: string;
  colors: string[];
  materials: string[];
  roof: string;
  landscape: string;
}[] = [
  {
    id: 'A',
    name: 'Kiln & Canopy',
    subtitle: 'An industrial rhythm. A softer edge.',
    description:
      'Deep terracotta piers turn a long industrial volume into a measured street facade. A copper canopy brings the entrance down to the scale of a person.',
    inspiration:
      'Warehouse bays and masonry traditions, reinterpreted through depth, shadow, and a sheltered public threshold.',
    tradeoff:
      'Deep masonry adds weight and embodied impact. Salvaged content and the facade support system need verification.',
    colors: ['#985643', '#b88664', '#393d3c', '#697154'],
    materials: [
      'Terracotta brick',
      'Weathered copper',
      'Dark metal',
      'Meadow planting',
    ],
    roof: 'Flat, screened plant',
    landscape: 'Rain-garden edge',
  },
  {
    id: 'B',
    name: 'Tidal Works',
    subtitle: 'Lightness along the working river.',
    description:
      'Long silver ribbons slip over a basalt base. Stepped roof terraces break the volume and create a deliberate horizontal relationship to the river.',
    inspiration:
      'The district’s metal-clad sheds, river commerce, and layered industrial infrastructure.',
    tradeoff:
      'Reflectivity, panel weathering, bird-safe glazing, and solar gain require study.',
    colors: ['#b0b7b4', '#525859', '#8c806e', '#688276'],
    materials: ['Folded aluminum', 'Basalt plinth', 'Bronze metal', 'Bioswale'],
    roof: 'Stepped terraces',
    landscape: 'Linear bioswale',
  },
  {
    id: 'C',
    name: 'Forest Exchange',
    subtitle: 'Three halls, threaded with green.',
    description:
      'Three articulated halls share a sheltered base. Slender timber-look screens and planted interstitial courts soften the service-scale envelope.',
    inspiration:
      'A regional timber vocabulary and Portland’s commitment to urban canopy.',
    tradeoff:
      'Exterior timber durability, fire requirements, and added envelope area need evaluation.',
    colors: ['#8f6946', '#d0b58d', '#353d3c', '#4e6344'],
    materials: [
      'Timber rainscreen',
      'Pale concrete',
      'Dark aluminum',
      'Woodland garden',
    ],
    roof: 'Repeated gables',
    landscape: 'Planted courts',
  },
  {
    id: 'D',
    name: 'Basalt Commons',
    subtitle: 'A quiet monument to everyday life.',
    description:
      'Charcoal masonry frames a deeply recessed entrance. Sawtooth roof forms give an otherwise quiet enclosure a recognizable industrial silhouette.',
    inspiration:
      'Regional volcanic stone and the practical roof profiles of working buildings.',
    tradeoff:
      'A heavy envelope may increase embodied carbon; the public apron must be reconciled with secure operations.',
    colors: ['#4b4b47', '#97968c', '#d0d0c5', '#838564'],
    materials: [
      'Charcoal brick',
      'Board-formed concrete',
      'Zinc roof',
      'Civic meadow',
    ],
    roof: 'Sawtooth roof lights',
    landscape: 'Public planted apron',
  },
];
export function createPortlandDemo(): BuildingSpec {
  return {
    schema: 1,
    id: 'central-eastside',
    revision: 1,
    name: 'Eastbank Exchange',
    concept: 'A',
    site: {
      name: 'Central Eastside',
      location: 'Portland, Oregon',
      center: [-122.6653, 45.5134],
      polygon: {
        type: 'Feature',
        properties: { mode: 'polygon' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.66602, 45.51299],
              [-122.66457, 45.51299],
              [-122.66457, 45.5138],
              [-122.66602, 45.5138],
              [-122.66602, 45.51299],
            ],
          ],
        },
      },
      rotation: 90,
      notes:
        'Speculative study boundary near SE Water Avenue / SE Main Street. Existing occupation, ownership, zoning entitlement and precise flood status are unverified.',
    },
    length: 84,
    width: 44,
    height: 16,
    finDepth: 0.85,
    finSpacing: 3,
    material: 'A',
    roof: 'A',
    landscape: 'A',
    canopyDepth: 4.5,
    locks: [],
    view: 'perspective',
    hour: 15,
    brief:
      'Make the industrial scale legible through repeated bays. Give the public edge shelter and planting. Keep service access distinct and visible in the design review.',
    researchReady: true,
    assets: {},
  };
}
export const presidioConcepts = concepts.map((direction, i) => ({
  ...direction,
  name: ['Porch & Bay', 'Horizon Works', 'Timber Courts', 'Quiet Commons'][i],
  subtitle: [
    'Measured bays and a sheltered threshold.',
    'Stepped metal halls with open edges.',
    'Three gabled halls and planted gaps.',
    'A courtyard beneath a working roof.',
  ][i],
  description: [
    'A long masonry hall gains human scale through deep repeated bays and a sheltered entrance. Public planting stays outside the secure operational edge.',
    'Stepped metal halls articulate the operational volume with horizontal terraces, recessed dark layers and a clear visitor entrance.',
    'Three timber-screened gabled halls frame planted courts. Repeated screens reveal depth and shadow while the technical enclosure remains legible.',
    'Charcoal masonry and sawtooth roof forms frame a recessed entrance and planted courtyard, balancing civic presence with secure operations.',
  ][i],
  inspiration:
    'Watt Wonder / Presidio board synthesis: measured repetition, tactile materials and landscape gaps (P02, P03, P05). Interpretation, not a parcel finding.',
  colors: [
    ['#985643', '#b88664', '#393d3c', '#697154'],
    ['#b0b7b4', '#79786e', '#3e4545', '#688276'],
    ['#8f6946', '#bba68b', '#353d3c', '#4e6344'],
    ['#4b4b47', '#97968c', '#3f4445', '#838564'],
  ][i],
  materials: [
    ['Clay masonry', 'Warm metal canopy', 'Dark metal', 'Meadow planting'],
    ['Folded metal', 'Muted metal canopy', 'Dark metal', 'Planted edge'],
    ['Timber screens', 'Warm canopy accent', 'Dark metal', 'Court planting'],
    ['Charcoal masonry', 'Pale canopy accent', 'Dark metal', 'Civic planting'],
  ][i],
}));
export function createDemo(): BuildingSpec {
  const original = createPortlandDemo();
  const center: [number, number] = [-122.4662, 37.7989];
  // Valid internal map extent only; hidden until the user draws a study boundary.
  const dx = 0.0007,
    dy = 0.0004;
  return preparedPresidio({
    ...original,
    id: 'presidio-demo',
    name: 'Presidio Exchange',
    boundaryConfirmed: false,
    siteDesignPending: true,
    directions: presidioConcepts,
    site: {
      ...original.site,
      name: 'Presidio',
      location: 'San Francisco, California',
      center,
      notes:
        'Draw a speculative study boundary. Ownership, permitted use, ecology, utilities and engineering feasibility are unverified.',
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
            ],
          ],
        },
      },
    },
    assets: {},
    imageReviews: {},
  });
}
// Same direction retains mixed components; selecting another respects every lock.
export function effectiveConcept(s: BuildingSpec, id: ConceptId) {
  return id === s.concept ? clone(s) : applyConcept(s, id);
}
export function imageSignature(s: BuildingSpec) {
  return JSON.stringify({
    site: s.site,
    length: s.length,
    width: s.width,
    height: s.height,
    concept: s.concept,
    material: s.material,
    roof: s.roof,
    landscape: s.landscape,
    canopyDepth: s.canopyDepth,
    finDepth: s.finDepth,
    finSpacing: s.finSpacing,
    directions: s.directions,
    brief: s.brief,
  });
}
export function canReviewImage(s: BuildingSpec, id: ConceptId) {
  return (
    !!s.assets[id] &&
    s.imageReviews?.[id]?.signature === imageSignature(effectiveConcept(s, id))
  );
}
export function canOpenModel(s: BuildingSpec) {
  if (s.id === 'presidio-hackathon-v1') return true;
  return (
    !s.demoContext ||
    (!!s.boundaryConfirmed &&
      !!s.assets[s.reviewedConcept || s.concept] &&
      !!s.imageReviews?.[s.reviewedConcept || s.concept]?.reviewed)
  );
}
export function reviewConcept(s: BuildingSpec, id: ConceptId): BuildingSpec {
  if (!canReviewImage(s, id))
    throw new Error(
      'Generate an image for the current design before reviewing it.',
    );
  return {
    ...effectiveConcept(s, id),
    reviewedConcept: id,
    imageReviews: {
      ...s.imageReviews,
      [id]: { signature: s.imageReviews![id]!.signature, reviewed: true },
    },
  };
}
export function conceptImage(s: BuildingSpec, id: ConceptId) {
  if (s.id === 'presidio-hackathon-v1') return demoConcept(id).image;
  return (
    s.assets[id] ||
    (s.directions || s.siteDesignPending
      ? '/assets/concept-pending.svg'
      : `/assets/concept-${id.toLowerCase()}.png`)
  );
}
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
export function applyConcept(s: BuildingSpec, id: ConceptId): BuildingSpec {
  const n = clone(s);
  if (!s.locks.includes('massing')) {
    n.concept = id;
  }
  if (!s.locks.includes('facade')) {
    n.material = id;
    n.finDepth = id === 'A' ? 0.85 : id === 'C' ? 1.2 : 0.45;
    n.finSpacing = id === 'C' ? 1.8 : 3;
  }
  if (!s.locks.includes('roof')) n.roof = id;
  if (!s.locks.includes('landscape')) n.landscape = id;
  return n;
}
export const featureLabels: Record<Feature, string> = {
  massing: 'Massing',
  facade: 'Facade',
  roof: 'Roofline',
  landscape: 'Landscape',
  canopy: 'Entrance canopy',
};
export function validSpec(v: unknown): v is BuildingSpec {
  if (!v || typeof v !== 'object') return false;
  const s = v as BuildingSpec;
  if (
    s.reviewedConcept !== undefined &&
    !['A', 'B', 'C', 'D'].includes(s.reviewedConcept)
  )
    return false;
  if (s.demoContext !== undefined && s.demoContext !== 'presidio') return false;
  if (
    s.boundaryConfirmed !== undefined &&
    typeof s.boundaryConfirmed !== 'boolean'
  )
    return false;
  if (
    s.imageReviews !== undefined &&
    (!s.imageReviews ||
      typeof s.imageReviews !== 'object' ||
      Array.isArray(s.imageReviews) ||
      Object.entries(s.imageReviews).some(
        ([id, r]) =>
          !['A', 'B', 'C', 'D'].includes(id) ||
          !r ||
          typeof r.signature !== 'string' ||
          typeof r.reviewed !== 'boolean',
      ))
  )
    return false;
  const ring = s.site?.polygon?.geometry?.coordinates?.[0];
  if (
    s.directions !== undefined &&
    (!Array.isArray(s.directions) ||
      s.directions.length !== 4 ||
      ['A', 'B', 'C', 'D'].some(
        (id) => s.directions!.filter((d) => d?.id === id).length !== 1,
      ) ||
      s.directions.some(
        (d) =>
          !d ||
          [
            'name',
            'subtitle',
            'description',
            'inspiration',
            'tradeoff',
            'roof',
            'landscape',
          ].some((k) => typeof d[k as keyof typeof d] !== 'string') ||
          !Array.isArray(d.colors) ||
          d.colors.length !== 4 ||
          d.colors.some(
            (c) => typeof c !== 'string' || !/^#[a-f\d]{6}$/i.test(c),
          ) ||
          !Array.isArray(d.materials) ||
          d.materials.length !== 4 ||
          d.materials.some((m) => typeof m !== 'string'),
      ))
  )
    return false;
  if (
    typeof s.brief !== 'string' ||
    typeof s.researchReady !== 'boolean' ||
    (s.siteDesignPending !== undefined &&
      typeof s.siteDesignPending !== 'boolean') ||
    typeof s.site?.notes !== 'string' ||
    !s.assets ||
    typeof s.assets !== 'object' ||
    Array.isArray(s.assets) ||
    Object.entries(s.assets).some(
      ([k, v]) =>
        !['A', 'B', 'C', 'D'].includes(k) ||
        typeof v !== 'string' ||
        !/^data:image\/(png|jpeg|webp);base64,/.test(v),
    )
  )
    return false;
  if (
    !ring ||
    ring.length > 1000 ||
    JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1])
  )
    return false;
  if (
    s.evidence !== undefined &&
    (!Array.isArray(s.evidence) ||
      s.evidence.some(
        (r) =>
          !r ||
          [
            'id',
            'title',
            'category',
            'fact',
            'response',
            'limitation',
            'source',
            'feature',
            'url',
          ].some((k) => typeof r[k as keyof typeof r] !== 'string') ||
          !r.url.startsWith('https://'),
      ))
  )
    return false;
  return (
    s.schema === 1 &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    ['A', 'B', 'C', 'D'].includes(s.concept) &&
    ['A', 'B', 'C', 'D'].includes(s.material) &&
    ['A', 'B', 'C', 'D'].includes(s.roof) &&
    ['A', 'B', 'C', 'D'].includes(s.landscape) &&
    Number.isFinite(s.revision) &&
    s.revision >= 1 &&
    Number.isFinite(s.length) &&
    s.length >= 30 &&
    s.length <= 120 &&
    Number.isFinite(s.width) &&
    s.width >= 20 &&
    s.width <= (s.id === 'presidio-hackathon-v1' ? 84 : 65) &&
    Number.isFinite(s.height) &&
    s.height >= 8 &&
    s.height <= 26 &&
    Number.isFinite(s.finDepth) &&
    s.finDepth >= 0.2 &&
    s.finDepth <= 2.5 &&
    Number.isFinite(s.finSpacing) &&
    s.finSpacing >= 1 &&
    s.finSpacing <= 6 &&
    Number.isFinite(s.canopyDepth) &&
    s.canopyDepth >= 2 &&
    s.canopyDepth <= 9 &&
    Number.isFinite(s.hour) &&
    s.hour >= 6 &&
    s.hour <= 21 &&
    Array.isArray(s.locks) &&
    s.locks.every((x) => Object.keys(featureLabels).includes(x)) &&
    [
      'perspective',
      'entrance',
      'aerial',
      'north',
      'south',
      'east',
      'west',
      'detail',
    ].includes(s.view) &&
    !!s.site &&
    typeof s.site.name === 'string' &&
    typeof s.site.location === 'string' &&
    Number.isFinite(s.site.rotation) &&
    Array.isArray(s.site.center) &&
    s.site.center.length === 2 &&
    s.site.center.every(Number.isFinite) &&
    Math.abs(s.site.center[0]) <= 180 &&
    Math.abs(s.site.center[1]) <= 85 &&
    s.site.polygon?.type === 'Feature' &&
    s.site.polygon.geometry?.type === 'Polygon' &&
    s.site.polygon.geometry.coordinates?.[0]?.length >= 4 &&
    s.site.polygon.geometry.coordinates[0].every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        Number.isFinite(p[0]) &&
        Math.abs(p[0]) <= 180 &&
        Number.isFinite(p[1]) &&
        Math.abs(p[1]) <= 90,
    )
  );
}
export const storageKey = 'placeform-projects-v1';
export type SavedState = {
  project: BuildingSpec;
  past: BuildingSpec[];
  future: BuildingSpec[];
  saved: string;
};
