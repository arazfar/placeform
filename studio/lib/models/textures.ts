import * as THREE from 'three';
export type Finish = 'stone' | 'metal' | 'wood' | 'paving' | 'soil' | 'meadow';
const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) =>
  fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function sample(kind: Finish, u: number, v: number) {
  const micro = hash(Math.floor(u * 256), Math.floor(v * 256));
  const coarse = hash(Math.floor(u * 12), Math.floor(v * 12));
  if (kind === 'stone') {
    const row = Math.floor(v * 5),
      fv = fract(v * 5),
      fu = fract(u * 1.8 + (row % 2) * 0.5),
      joint = fv < 0.012 || fv > 0.985 || fu < 0.008;
    const block = hash(Math.floor(u * 1.8 + (row % 2) * 0.5), row);
    return {
      color: (joint ? 0.72 : 0.9 + block * 0.08) + (micro - 0.5) * 0.045,
      height: (joint ? -0.018 : 0) + (micro - 0.5) * 0.0009,
      rough: 0.82 + (coarse - 0.5) * 0.1,
      ao: joint ? 0.84 : 1,
    };
  }
  if (kind === 'wood') {
    const grain = Math.sin(
        u * 160 + Math.sin(v * 4 * Math.PI) * 1.8 + Math.sin(u * 33) * 2,
      ),
      fine = Math.sin(u * 720 + Math.sin(v * 11) * 2),
      board = fract(u * 4),
      joint = board < 0.012;
    return {
      color: joint
        ? 0.58
        : 0.83 + grain * 0.08 + fine * 0.025 + (micro - 0.5) * 0.025,
      height: joint ? -0.009 : grain * 0.0007,
      rough: 0.62 + grain * 0.065,
      ao: joint ? 0.8 : 1,
    };
  }
  if (kind === 'metal')
    return {
      color: 0.96 + (micro - 0.5) * 0.025 + Math.sin(u * 128) * 0.008,
      height: (micro - 0.5) * 0.00015,
      rough: 0.46 + (hash(0, Math.floor(v * 256)) - 0.5) * 0.07,
      ao: 1,
    };
  if (kind === 'paving') {
    const fx = fract(u),
      fy = fract(v),
      joint = fx < 0.012 || fy < 0.012;
    return {
      color: joint
        ? 0.78
        : 0.93 + (coarse - 0.5) * 0.055 + (micro - 0.5) * 0.035,
      height: joint ? -0.009 : (micro - 0.5) * 0.001,
      rough: 0.88 + (micro - 0.5) * 0.08,
      ao: joint ? 0.9 : 1,
    };
  }
  return {
    color: 0.82 + (coarse - 0.5) * 0.16 + (micro - 0.5) * 0.12,
    height: (micro - 0.5) * 0.008,
    rough: 0.98,
    ao: 0.95 + micro * 0.05,
  };
}
/** Independent, seeded PBR channels. Color is sRGB; surface-data maps remain linear. */
export function finishTextures(kind: Finish, size = 256) {
  const data = () => new Uint8Array(size * size * 4),
    color = data(),
    rough = data(),
    normal = data(),
    ao = data();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        s = sample(kind, u, v),
        i = (y * size + x) * 4;
      const dx =
        (sample(kind, ((x + 1) % size) / size, v).height -
          sample(kind, ((x - 1 + size) % size) / size, v).height) *
        size *
        0.45;
      const dy =
        (sample(kind, u, ((y + 1) % size) / size).height -
          sample(kind, u, ((y - 1 + size) % size) / size).height) *
        size *
        0.45;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      for (let k = 0; k < 3; k++) {
        color[i + k] = Math.round(THREE.MathUtils.clamp(s.color, 0, 1) * 255);
        rough[i + k] = Math.round(s.rough * 255);
        ao[i + k] = Math.round(s.ao * 255);
      }
      normal[i] = Math.round((n.x * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
      color[i + 3] = rough[i + 3] = normal[i + 3] = ao[i + 3] = 255;
    }
  function map(name: string, data: Uint8Array, srgb = false) {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.name = `${kind} · ${name}`;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }
  return {
    map: map('base color', color, true),
    roughnessMap: map('roughness', rough),
    normalMap: map('normal relief', normal),
    aoMap: map('contact cavities', ao),
  };
}
