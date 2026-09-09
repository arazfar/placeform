import * as THREE from 'three';
import {
  AssemblyBuilder,
  ellipse,
  inside,
  type P2,
  type Height,
} from './geometry';
import type { ModelMaterials } from './materials';
import { createDetails } from './details';
import type { ConceptId } from '../spec';
export function createLandscape(
  b: AssemblyBuilder,
  m: ModelMaterials,
  id: ConceptId,
) {
  const d = createDetails(b, m),
    site = b.part('Landscape and public approach', 'landscape');
  const terrain: Height = (x, z) => {
    const outside = THREE.MathUtils.smoothstep(
      Math.max(Math.abs(x) - 57, Math.abs(z) - 44),
      0,
      13,
    );
    const hill = id === 'A' ? Math.max(0, (34 - z) * 0.085) : 0.45;
    // Flatten circulation corridors before tessellating terrain, including a cell-wide shoulder.
    const frontage = 1 - THREE.MathUtils.smoothstep(z, 39, 43);
    const service =
      (1 - THREE.MathUtils.smoothstep(Math.abs(Math.abs(x) - 60), 4.5, 7)) *
      (1 - THREE.MathUtils.smoothstep(Math.abs(z + 3), 44, 48));
    return (
      -0.14 +
      outside *
        frontage *
        (1 - service) *
        (hill + 0.32 * Math.sin(x * 0.19) * Math.cos(z * 0.16) + 0.32)
    );
  };
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [],
    nx = 68,
    nz = 56;
  for (let iz = 0; iz <= nz; iz++)
    for (let ix = 0; ix <= nx; ix++) {
      const x = (ix / nx - 0.5) * 164,
        z = (iz / nz - 0.5) * 136;
      positions.push(x, terrain(x, z), z);
      uv.push(x / 2, z / 2);
    }
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const a = z * (nx + 1) + x,
        c = a + nx + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  b.mesh(site, 'Contoured meadow terrain', g, m.grass, 'landscape');
  b.box(site, 0, -1.02, 0, 164, 0.8, 136, m.soil, 'landscape');
  const boundary: P2[] = [];
  for (let i = 0; i <= nx; i++) boundary.push([-82 + (i / nx) * 164, 68]);
  for (let i = 1; i <= nz; i++) boundary.push([82, 68 - (i / nz) * 136]);
  for (let i = 1; i <= nx; i++) boundary.push([82 - (i / nx) * 164, -68]);
  for (let i = 1; i < nz; i++) boundary.push([-82, -68 + (i / nz) * 136]);
  const skirtPos: number[] = [],
    skirtIndices: number[] = [],
    skirtUV: number[] = [];
  for (let i = 0; i < boundary.length; i++) {
    const [x, z] = boundary[i],
      [xx, zz] = boundary[(i + 1) % boundary.length],
      start = skirtPos.length / 3;
    skirtPos.push(
      x,
      -1.42,
      z,
      xx,
      -1.42,
      zz,
      xx,
      terrain(xx, zz),
      zz,
      x,
      terrain(x, z),
      z,
    );
    skirtUV.push(x, z, xx, zz, xx, terrain(xx, zz), x, terrain(x, z));
    skirtIndices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3));
  skirt.setAttribute('uv', new THREE.Float32BufferAttribute(skirtUV, 2));
  skirt.setIndex(skirtIndices);
  skirt.computeVertexNormals();
  b.add(site, skirt, m.soil, 'landscape');
  b.box(site, 0, -0.025, 0, 121, 0.1, 92, m.paving, 'landscape');
  const road = b.part('Street, promenade and service access', 'landscape');
  function ribbon(
    center: (x: number) => number,
    width: number,
    y: number,
    mat: THREE.Material,
  ) {
    const pos: number[] = [],
      idx: number[] = [],
      uv: number[] = [];
    for (let i = 0; i <= 100; i++) {
      const x = -82 + i * 1.64,
        z = center(x);
      for (const side of [-1, 1]) {
        pos.push(x, y, z + (side * width) / 2);
        uv.push(x, (side * width) / 2);
      }
    }
    for (let i = 0; i < 100; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    b.add(road, geo, mat, 'landscape');
  }
  const path = (x: number) => 49 + 1.8 * Math.sin((x + 14) * 0.032);
  const street = (x: number) => path(x) + 8;
  ribbon(path, 3.4, 0.12, m.paving);
  ribbon(street, 6.5, 0.11, m.asphalt);
  for (let x = -77; x < 80; x += 6) {
    const z = street(x);
    b.box(
      road,
      x,
      0.122,
      z,
      2.5,
      0.014,
      0.095,
      m.paving,
      'landscape',
      -0.057 * Math.cos((x + 14) * 0.032),
    );
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 100; i++) {
      const a = -82 + i * 1.64,
        c = a + 1.64;
      d.line(
        road,
        [a, street(a) + side * 3.35],
        [c, street(c) + side * 3.35],
        0.18,
        0.2,
        0.22,
        m.stone,
        'landscape',
      );
    }
  for (const x of [-60, 60])
    b.box(road, x, 0.06, -3, 4.8, 0.12, 85, m.asphalt, 'landscape');
  const planting = b.part('Native planting and mature trees', 'landscape');
  const patches: P2[][] = [];
  for (let i = 0; i < 8; i++) {
    const x = -52 + i * 15,
      z = 43 + (i % 2) * 1.1,
      outline = ellipse(x, z, 5.8 + (i % 3), 2.1, 0.12 * (i % 2));
    patches.push(outline);
    b.slab(planting, outline, 0.07, 0.22, m.soil, 'landscape');
    d.meadow(planting, outline, () => 0.31, 42);
    if (i !== 4) d.tree(planting, x - 2, z, 0.31, 0.55 + (i % 3) * 0.08, i);
  }
  for (let i = 0; i < 88; i++) {
    const side = i % 3,
      x =
        side === 0
          ? -66 - b.random() * 10
          : side === 1
            ? 66 + b.random() * 10
            : -76 + b.random() * 152,
      z = side < 2 ? -54 + b.random() * 103 : -51 - b.random() * 11;
    d.tree(planting, x, z, terrain(x, z), 0.85 + b.random() * 0.6, i);
  }
  const border: P2[] = [
    [-81, -67],
    [81, -67],
    [81, 67],
    [-81, 67],
  ];
  d.meadow(
    planting,
    border,
    terrain,
    1350,
    (x, z) =>
      (Math.abs(x) < 63 && z < 48 && z > -47) ||
      Math.abs(z - street(x)) < 4 ||
      Math.abs(z - path(x)) < 2.2 ||
      Math.abs(Math.abs(x) - 60) < 3,
  );
  for (let i = 0; i < 65; i++) {
    const x = -75 + b.random() * 150,
      z = 39 + b.random() * 27;
    if (Math.abs(z - street(x)) < 4 || Math.abs(z - path(x)) < 2.4) continue;
    b.instance(
      planting,
      'Weathered landscape rocks',
      b.shrub,
      m.stone,
      [x, terrain(x, z) + 0.17, z],
      [
        0.25 + b.random() * 0.6,
        0.25 + b.random() * 0.3,
        0.4 + b.random() * 0.5,
      ],
    );
  }
  for (let i = 0; i < 40; i++) {
    const x = -63 + b.random() * 126;
    d.people(road, x, path(x) + (b.random() - 0.5) * 2, 0.16);
  }
  for (let i = 0; i < 8; i++) {
    const x = -49 + i * 14,
      z = path(x) - 2.1;
    d.line(
      road,
      [x - 1, z],
      [x + 1, z],
      0.65,
      0.55,
      0.12,
      m.timber,
      'landscape',
    );
    for (const xx of [x - 0.7, x + 0.7])
      b.box(road, xx, 0.34, z, 0.09, 0.62, 0.4, m.dark, 'landscape');
    b.box(road, x + 3, 0.55, z, 0.1, 0.9, 0.1, m.dark, 'landscape');
  }
  for (const x of [-60, 60])
    for (let i = 0; i < 2; i++) {
      const z = -28 + i * 25;
      const p = b.part(
        `Service vehicle ${x > 0 ? 'east' : 'west'} ${i + 1}`,
        'landscape',
      );
      b.box(p, x, 1.55, z, 2.4, 2.6, 6.4, m.paving, 'landscape');
      b.box(p, x, 1.15, z + 4.1, 2.3, 1.85, 2.15, m.silver, 'landscape');
      b.box(p, x, 1.57, z + 5.19, 1.85, 0.67, 0.04, m.glass, 'landscape');
      for (const sx of [-1, 1])
        for (const dz of [-2, 2, 4])
          b.instance(
            p,
            'Vehicle wheels',
            b.cylinder,
            m.asphalt,
            [x + sx * 1.17, 0.45, z + dz],
            [0.43, 0.24, 0.43],
            'landscape',
            new THREE.Euler(0, 0, Math.PI / 2),
          );
    }
  return { site, planting, terrain, patches, inside };
}
