import type { BuildingSpec, ConceptId } from './spec';

export const DEMO_STORAGE_KEY = 'placeform-hackathon-v1';
export const demoConcepts = [
  {
    id: 'A',
    name: 'Terrace Commons',
    image: '/assets/hackathon/datacenter_2.png',
    subtitle: 'Architecture becomes a planted hillside.',
    description:
      'Long sandstone terraces step through the landscape. Green roofs and public paths connect warm glazed entrances, gardens and sheltered gathering places.',
    colors: ['#c4af90', '#817555', '#4c6140', '#c49b60'],
    materials: ['Sandstone', 'Planted roof', 'Native planting', 'Warm glazing'],
    roof: 'Stepped garden terraces',
    landscape: 'Connected hillside gardens',
  },
  {
    id: 'B',
    name: 'Folded Horizon',
    image: '/assets/hackathon/datacenter_5.png',
    subtitle: 'Silver folds frame the public edge.',
    description:
      'Sweeping angular roof ribbons shelter glazed halls and planted courts. Timber soffits bring warmth to the silver metal canopy and generous arrival plaza.',
    colors: ['#c8cbd0', '#a67e50', '#586650', '#787e80'],
    materials: ['Silver metal', 'Timber soffit', 'Court planting', 'Glass'],
    roof: 'Folded metal ribbons',
    landscape: 'Sheltered planted courts',
  },
  {
    id: 'C',
    name: 'Civic Dune',
    image: '/assets/hackathon/datacenter_7.png',
    subtitle: 'A flowing roof, opened to the sky.',
    description:
      'Continuous undulating roofs rise over glazed public rooms and dip toward the landscape. Open courtyards bring planting and daylight into the center of each hall.',
    colors: ['#d0d0cc', '#b08751', '#627148', '#c7bca5'],
    materials: [
      'Satin silver roof',
      'Timber soffit',
      'Garden courts',
      'Pale paving',
    ],
    roof: 'Curved roofs with open courts',
    landscape: 'Gardens threaded through halls',
  },
  {
    id: 'D',
    name: 'Lantern Spine',
    image: '/assets/hackathon/datacenter_8.png',
    subtitle: 'A warm public route between working halls.',
    description:
      'Finned metal halls line a luminous glass spine. Landscaped courtyards separate the operational blocks while a transparent entrance welcomes visitors from the public path.',
    colors: ['#b9bbb7', '#ddba7e', '#5d6b45', '#888b87'],
    materials: [
      'Metal fins',
      'Warm glass spine',
      'Court planting',
      'Screened equipment',
    ],
    roof: 'Flat roofs and screened plant',
    landscape: 'Courts along a public spine',
  },
].map((c) => ({
  ...c,
  id: c.id as ConceptId,
  inspiration:
    'A speculative campus in the Presidio landscape, interpreted from the supplied architectural reference.',
  tradeoff:
    'Conceptual exterior study; structure, operations and landscape feasibility require further design.',
}));
export function demoConcept(id: ConceptId) {
  return demoConcepts.find((c) => c.id === id)!;
}
export function fixedDemoSpec(
  s: BuildingSpec,
  id: ConceptId = s.concept,
): BuildingSpec {
  return {
    ...s,
    id: 'presidio-hackathon-v1',
    name: 'Presidio Exchange',
    demoContext: 'presidio',
    boundaryConfirmed: true,
    siteDesignPending: false,
    researchReady: true,
    reviewedConcept: id,
    concept: id,
    material: id,
    roof: id,
    landscape: id,
    length: 112,
    width: 84,
    height: 16,
    finDepth: 0.45,
    finSpacing: 1.1,
    canopyDepth: 5,
    locks: [],
    directions: demoConcepts,
    assets: {},
    site: { ...s.site, rotation: 90 },
  };
}
