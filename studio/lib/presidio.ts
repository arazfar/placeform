import type { BuildingSpec, Site } from './spec';

export const moodBoardUrl =
  'https://www.are.na/oscar-hong/watt-wonder-presidio-design-inspiration';
export const presidioBrief = `Speculative Presidio data-center study. Use measured bays, deep screens and legible operational volumes; keep public thresholds outside secure halls. Test restrained tactile materials and visible landscape gaps, drainage and movement. This prepared context is a September 2026 snapshot of the Watt Wonder board, not live parcel research. Preserve the drawn boundary, entered dimensions and locked features. Noise, energy and water demand, service traffic, ecology, neighborhood scale, land availability and permissions remain unresolved.`;
export function withinPresidio(site: Site) {
  const [lon, lat] = site.center;
  return lon >= -122.49 && lon <= -122.445 && lat >= 37.785 && lat <= 37.813;
}
const record = (
  id: string,
  title: string,
  category: string,
  fact: string,
  response: string,
  limitation: string,
  feature: string,
) => ({
  id,
  title,
  category,
  fact,
  response,
  limitation,
  feature,
  source: 'Watt Wonder / Presidio board · prepared synthesis · September 2026',
  url: moodBoardUrl,
});
export const presidioEvidence = [
  record(
    'P01',
    'Keep the histories layered',
    'HISTORY & CULTURE',
    'The board’s synthesis brings together Ramaytush history, military occupation, later alterations and the EXCLUSION exhibition; it cautions against a decorative military-only narrative.',
    'Interpretation: use clear contemporary construction and human-scale thresholds instead of copied historic ornament.',
    'Board synthesis, not a parcel heritage assessment or evidence of Indigenous permission or community endorsement.',
    'Massing · Entrance',
  ),
  record(
    'P02',
    'Bays, porches and screens',
    'ARCHITECTURAL CHARACTER',
    'The board identifies Infantry Row intervals, Funston porches, exposed frames and spatially deep screens as distinct precedents.',
    'Interpretation: articulate the supported hall recipes with measured bays, recessed entrances and replaceable screens.',
    'Precedent proportions do not establish an allowable building envelope or construction system.',
    'Massing · Facade',
  ),
  record(
    'P03',
    'Materials with visible care',
    'MATERIAL PALETTE',
    'The board observes red brick, light porch elements, warm roof colors, gray-green land, timber framing and copper studies, with different repair histories.',
    'Interpretation: use the selected recipe’s masonry, metal or timber family with a dark recessed layer and restrained planting tones.',
    'Do not specify serpentinite from appearance or assume reclaimed material is available at campus scale.',
    'Facade · Materials',
  ),
  record(
    'P04',
    'Daylight without concealment',
    'CLIMATE & ATMOSPHERE',
    'The board compares clear and foggy conditions and warns against using atmosphere to conceal building scale.',
    'Interpretation: show the complete building in diffuse natural daylight, with legible joints, canopy drainage and exposed edges.',
    'Parcel wind, corrosion, solar exposure and structural loads remain unverified.',
    'Canopy · Roof',
  ),
  record(
    'P05',
    'Keep the landscape gaps',
    'LANDSCAPE & ECOLOGY',
    'The board distinguishes planted forest, grassland, dunes and marsh and emphasizes connected habitat and watershed routes.',
    'Interpretation: keep visible gaps and planted public edges; consider drainage and construction disturbance alongside the footprint.',
    'No site habitat survey, soil test, infiltration calculation or restoration outcome is established. A planted roof does not replace intact habitat.',
    'Landscape · Site',
  ),
  record(
    'P06',
    'Public routes and working access',
    'MOVEMENT & NEIGHBORS',
    'The board’s public-space and infrastructure precedents distinguish useful public routes from secure operational boundaries.',
    'Interpretation: give visitors a legible sheltered entrance and separate service access, without implying public access to data halls.',
    'Truck demand, swept paths, access permissions, operating hours and neighborhood acceptance require study.',
    'Entrance · Service access',
  ),
  record(
    'P07',
    'A screen is not an acoustic result',
    'NOISE',
    'The board explicitly cautions that a second skin and attractive infrastructure images cannot demonstrate noise reduction.',
    'Interpretation: show screened equipment and separation from public areas where supported; evaluate attenuation and vibration isolation separately.',
    'Equipment sound data, receiving locations, nighttime operation and acoustic performance are unverified.',
    'Roof · Equipment',
  ),
  record(
    'P08',
    'Keep the resource questions visible',
    'ENERGY & WATER',
    'The board warns against inferring clean energy or improved cooling from design references.',
    'Interpretation: retain credible mechanical space and service access; compare cooling approaches and resource budgets during engineering review.',
    'IT load, grid capacity, water demand and supply, PUE, WUE and annual emissions are unknown. No performance claim.',
    'Equipment · Energy',
  ),
];
export function preparedPresidio(s: BuildingSpec): BuildingSpec {
  return {
    ...s,
    demoContext: 'presidio',
    brief: presidioBrief,
    evidence: presidioEvidence,
    researchReady: true,
  };
}
