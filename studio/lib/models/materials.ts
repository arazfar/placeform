import * as THREE from 'three';
import { finishTextures, type Finish } from './textures';
const readiness = new WeakMap<THREE.Source<unknown>, Promise<void>>();
export async function awaitModelTextures(root: THREE.Object3D) {
  const pending = new Set<Promise<void>>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const texture of Object.values(m)) {
          if (!(texture instanceof THREE.Texture)) continue;
          const p = readiness.get(texture.source);
          if (p) pending.add(p);
        }
      }
  });
  await Promise.all(pending);
}
export function createMaterials() {
  const standard = (
    name: string,
    color: string,
    roughness = 0.7,
    metalness = 0,
  ) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    return m;
  };
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#aabbb7',
    roughness: 0.14,
    metalness: 0,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  glass.name = 'Low iron architectural glass';
  const light = standard('Warm interior luminaires', '#ffe3ad', 0.45);
  light.emissive.set('#ffd29a');
  light.emissiveIntensity = 0.3;
  light.userData.interiorLight = true;
  const materials = {
    stone: standard('Honed sandstone', '#c6b296', 0.83),
    silver: standard('Satin standing seam aluminum', '#cbd1d3', 0.44, 0.42),
    timber: standard('Warm oak soffits', '#aa7949', 0.72),
    dark: standard('Bronze frames', '#333d3d', 0.48, 0.55),
    back: standard('Recessed wall panels', '#59605e', 0.76),
    paving: standard('Limestone paving', '#c7c1b0', 0.86),
    soil: standard('Mineral planting substrate', '#928771', 0.98),
    grass: standard('Dry native meadow', '#8a8f60', 0.96),
    bark: standard('Weathered bark', '#68614e', 0.95),
    glass,
    light,
    leaf: [
      standard('Olive canopy', '#667447', 0.94),
      standard('Dark evergreen', '#344c38', 0.96),
      standard('Silver sage', '#9b9d75', 0.95),
    ],
    gravel: standard('Fine pale gravel', '#b9b09b', 0.95),
    asphalt: standard('Road asphalt', '#535b5a', 0.96),
    seam: standard('Folded aluminum seams', '#9ba4a7', 0.48, 0.42),
  };
  for (const [key, finish] of [
    ['stone', 'stone'],
    ['silver', 'metal'],
    ['timber', 'wood'],
    ['paving', 'paving'],
    ['soil', 'soil'],
    ['grass', 'meadow'],
  ] as const) {
    const material = materials[key];
    Object.assign(material, finishTextures(finish as Finish));
    material.roughness = 1;
    material.normalScale.set(0.55, 0.55);
    material.aoMapIntensity = 0.5;
  }
  const foliage = materials.leaf.map((_, i) => {
    const mat = standard(
      `Evergreen leaf sprays ${i}`,
      ['#ffffff', '#dce6d4', '#fff5de'][i],
      0.92,
    );
    mat.side = THREE.DoubleSide;
    mat.alphaTest = 0.42;
    mat.emissive.set('#506334');
    mat.emissiveIntensity = 0.11;
    mat.shadowSide = THREE.FrontSide;
    return mat;
  });
  if (typeof document !== 'undefined') {
    let resolve!: () => void, reject!: (e: Error) => void;
    const ready = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void ready.catch(() => {});
    const texture = new THREE.TextureLoader().load(
      '/assets/models/evergreen-spray.png',
      () => resolve(),
      undefined,
      () =>
        reject(
          new Error(
            'The canopy texture could not load. Retry the export after reloading.',
          ),
        ),
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.name = 'Evergreen spray · image-generated RGBA';
    readiness.set(texture.source, ready);
    foliage.forEach((mat) => {
      mat.map = texture;
    });
  }
  return { ...materials, foliage };
}
export type ModelMaterials = ReturnType<typeof createMaterials>;
