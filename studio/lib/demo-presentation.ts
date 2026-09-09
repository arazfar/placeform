import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { BuildingSpec, ConceptId, View } from './spec';

export type PreviewView = View | 'reverse';
export type CaptureOptions = {
  width?: number;
  height?: number;
  quality?: 'interactive' | 'final';
};
export const presentationViews = [
  { view: 'perspective', hour: 15, label: 'Hero · daylight' },
  { view: 'reverse', hour: 15, label: 'Reverse three-quarter' },
  { view: 'east', hour: 15, label: 'East elevation' },
  { view: 'west', hour: 15, label: 'West elevation' },
  { view: 'aerial', hour: 15, label: 'Roof and landscape' },
  { view: 'entrance', hour: 15, label: 'Entrance and materials' },
  { view: 'perspective', hour: 19, label: 'Hero · dusk' },
] as const;
export const entrances: Record<ConceptId, [number, number, number]> = {
  A: [-10, 3.5, 32],
  B: [-18, 4.8, 31],
  C: [-26, 4.8, 29],
  D: [3, 3.5, 36],
};
export function cameraPose(s: BuildingSpec, view: PreviewView) {
  const entry = entrances[s.concept];
  const hero: Record<ConceptId, [number, number, number]> = {
    A: [86, 73, 151],
    B: [86, 70, 148],
    C: [86, 72, 151],
    D: [86, 71, 151],
  };
  const positions: Record<PreviewView, [number, number, number]> = {
    perspective: hero[s.concept],
    reverse: [-118, 75, -146],
    aerial: [76, 178, 114],
    north: [0, 23, -196],
    south: [0, 23, 196],
    east: [205, 27, 3],
    west: [-205, 27, 3],
    entrance: [entry[0] + 26, 11, entry[2] + 42],
    detail: [entry[0] + 12, entry[1] + 4.5, entry[2] + 17],
  };
  const position = new THREE.Vector3(...positions[view]);
  const target = new THREE.Vector3(
    ...(view === 'entrance' || view === 'detail'
      ? entry
      : ([0, 4.5, 0] as [number, number, number])),
  );
  if (!['north', 'south', 'east', 'west'].includes(view)) {
    const angle = (-(s.site.rotation - 90) * Math.PI) / 180;
    position.applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
    target.applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
  }
  return { position, target };
}
export function lightSettings(hour: number) {
  const dusk = hour >= 18;
  const t = ((hour - 6) / 15) * Math.PI;
  return {
    dusk,
    background: dusk ? '#59697e' : '#c6d7df',
    sun: dusk ? '#ffc38b' : '#fff1d8',
    sky: dusk ? '#9faec9' : '#dcebf6',
    sunPosition: [
      -95 * Math.cos(t - 0.5),
      Math.max(14, 110 * Math.sin(t)),
      75,
    ] as [number, number, number],
    sunIntensity: dusk ? 1.4 : 3.2,
    skyIntensity: dusk ? 0.45 : 1.1,
    environmentIntensity: dusk ? 0.018 : 0.035,
    exposure: dusk ? 1.05 : 0.94,
  };
}
export function applyLighting(
  scene: THREE.Scene,
  group: THREE.Group,
  renderer: THREE.WebGLRenderer,
  hour: number,
  quality: 'interactive' | 'final' = 'interactive',
) {
  const p = lightSettings(hour);
  scene.background = new THREE.Color(p.background);
  scene.fog = new THREE.Fog(p.background, 260, 620);
  scene.environmentIntensity = p.environmentIntensity;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = p.exposure;
  const sun = scene.getObjectByName('sun') as
    | THREE.DirectionalLight
    | undefined;
  if (sun) {
    sun.color.set(p.sun);
    sun.position.set(...p.sunPosition);
    sun.intensity = p.sunIntensity;
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, {
      left: -101,
      right: 101,
      top: 92,
      bottom: -92,
      near: 1,
      far: 310,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00008;
    const size = quality === 'final' ? 4096 : 2048;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapPass?.dispose();
      sun.shadow.mapPass = null;
      sun.shadow.mapSize.set(size, size);
    }
    sun.shadow.needsUpdate = true;
  }
  const fill = scene.getObjectByName('sky-fill') as
    | THREE.HemisphereLight
    | undefined;
  if (fill) {
    fill.color.set(p.sky);
    fill.intensity = p.skyIntensity;
    fill.groundColor.set('#747962');
  }
  const visited = new Set<THREE.Material>();
  group.traverse((o) => {
    if (o instanceof THREE.PointLight && o.userData.interiorPoint)
      o.intensity = p.dusk ? 240 : 90;
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (visited.has(m)) continue;
      visited.add(m);
      if (m instanceof THREE.MeshStandardMaterial && m.userData.interiorLight)
        m.emissiveIntensity = p.dusk ? 2.2 : 0.28;
    }
  });
}

/** One reflection environment for interactive viewing, stills and model films. */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 4;
  uniforms.rayleigh.value = 1.4;
  uniforms.mieCoefficient.value = 0.003;
  uniforms.mieDirectionalG.value = 0.8;
  uniforms.sunPosition.value.set(-0.6, 0.75, 0.8);
  environment.add(sky);
  const map = pmrem.fromScene(environment, 0.02, 0.1, 2000);
  sky.geometry.dispose();
  sky.material.dispose();
  pmrem.dispose();
  return map;
}
