import * as THREE from 'three';
import type { ConceptId } from './spec';
import { demoConcept } from './demo-catalog';
import { entrances } from './demo-presentation';
import {
  AssemblyBuilder,
  roofShell,
  ribbonShell,
  roofSampler,
  ellipse,
  inside,
  type P2,
} from './models/geometry';
import { createMaterials } from './models/materials';
import { createDetails } from './models/details';
import { createLandscape } from './models/landscape';
import {
  MODEL_STAGE,
  terraces,
  ribbons,
  ribbonSurface,
  duneOutline,
  duneCourts,
  duneHeight,
  halls,
  pavilions,
} from './models/reference-data';
export { setExplode } from './models/geometry';
/** Deterministic reference-authored exterior reconstructions. X lateral, Y up, +Z arrival. */
export function buildDemoModel(id: ConceptId): THREE.Group {
  const b = new AssemblyBuilder(),
    m = createMaterials(),
    detail = createDetails(b, m);
  const { facade } = detail;
  b.root.name = demoConcept(id).name;
  b.root.userData = {
    concept: id,
    approximate: true,
    version: 2,
    stage: MODEL_STAGE,
    bounds: [112, 16, 84],
  };
  const { planting } = createLandscape(b, m, id);
  function interiorLight(part: THREE.Group, x: number, y: number, z: number) {
    const light = new THREE.PointLight('#ffd39b', 40, 22, 2);
    light.position.set(x, y, z);
    light.name = part.name + ' interior light';
    light.userData = { interiorPoint: true, feature: 'facade' };
    part.add(light);
  }
  if (id === 'A')
    for (const [i, t] of terraces.entries()) {
      const p = b.part(`Terrace ${i + 1} sandstone and garden`),
        { x, z, w, d, y, h } = t;
      const fractions = [
        [-0.5, -0.34, -0.22, 0.16, 0.32, 0.5],
        [-0.5, -0.28, -0.17, 0.26, 0.36, 0.5],
        [-0.5, -0.39, -0.24, 0.06, 0.17, 0.5],
        [-0.5, -0.27, -0.16, 0.2, 0.39, 0.5],
      ][i];
      const setbacks = [
        [3, 5, 0, 0, 5, 2],
        [1, 1, 4, 4, 0, 2],
        [4, 0, 0, 5, 5, 2],
        [0, 3, 3, 0, 0, 1],
      ][i];
      const front: P2[] = fractions.map((f, j) => [
        x + w * f,
        z + d / 2 - setbacks[j],
      ]);
      const outline: P2[] = [
        ...front,
        [x + w / 2, z - d / 2],
        [x - w / 2, z - d / 2],
      ];
      b.slab(p, outline, Math.min(0, y - 0.3), Math.max(0.3, y + 0.3), m.stone);
      b.mesh(
        p,
        `Terrace ${i + 1} closed roof shell`,
        roofShell(outline, [], () => y + h + 0.38, 0.38, 8),
        [m.stone, m.timber, m.stone],
        'roof',
      );
      b.box(p, x, y + h / 2, z - d / 2 + 2, w, h, 4, m.stone);
      b.box(p, x - w / 2 + 1, y + h / 2, z, 2, h, d - 1, m.stone);
      b.box(p, x + w / 2 - 1, y + h / 2, z, 2, h, d - 1, m.stone);
      const glassLine = front.map(([px, pz]) => [px, pz - 1.35] as P2);
      facade(p, glassLine, () => y + h - 0.05, y + 0.3);
      const stairSide = i % 2 ? -1 : 1,
        stairEndZ = z + d / 2 - 9.5;
      for (let j = 0; j < outline.length; j++) {
        const a = outline[j],
          c = outline[(j + 1) % outline.length];
        if (j === (i % 2 ? outline.length - 1 : front.length - 1)) {
          const direction = Math.sign(c[1] - a[1]);
          detail.line(
            p,
            a,
            [a[0], stairEndZ - direction * 1.6],
            y + h + 0.7,
            0.4,
            0.8,
            m.stone,
            'roof',
          );
          detail.line(
            p,
            [c[0], stairEndZ + direction * 1.6],
            c,
            y + h + 0.7,
            0.4,
            0.8,
            m.stone,
            'roof',
          );
        } else detail.line(p, a, c, y + h + 0.7, 0.4, 0.8, m.stone, 'roof');
      }
      b.box(
        p,
        x + stairSide * (w / 2 + 0.85),
        y + h + 0.52,
        stairEndZ,
        4.7,
        0.16,
        3.2,
        m.paving,
        'landscape',
      );
      for (const j of [0, 4])
        detail.line(p, front[j], front[j + 1], y + h / 2, 0.65, h, m.stone);
      const stairX = x + (i % 2 ? -1 : 1) * (w / 2 + 1.6);
      detail.stairs(p, stairX, z + d / 2 + 2, 3, y, y + h + 0.6, 11.5);
      detail.interior(p, x, z + 1, y + 0.3, w - 10, 5, y + h - 0.5);
      b.box(p, x, y + h - 0.3, z + 4, w - 7, 0.12, 2.5, m.timber, 'canopy');
      const garden = outline.map(
        ([px, pz]) => [x + (px - x) * 0.957, z + (pz - z) * 0.8] as P2,
      );
      b.slab(p, garden, y + h + 0.39, 0.18, m.grass, 'landscape');
      detail.meadow(
        p,
        garden,
        () => y + h + 0.58,
        180,
        (px, pz) => pz > z + d / 2 - 4.2,
      );
      const path = front.map(
        ([px, pz]) => [x + (px - x) * 0.94, pz - 2.4] as P2,
      );
      for (let j = 0; j < path.length - 1; j++)
        detail.line(
          p,
          path[j],
          path[j + 1],
          y + h + 0.61,
          1.35,
          0.09,
          m.gravel,
          'landscape',
        );
      for (let k = 0; k < 5; k++) {
        const px = x - w * 0.35 + k * w * 0.17;
        detail.tree(p, px, z - 2, y + h + 0.58, 0.32 + (k % 2) * 0.04, k);
      }
      interiorLight(p, x, y + 3.8, z + 3);
      if (i < 3) {
        const bed = ellipse(x, z - d / 2 - 1.15, w * 0.42, 0.9);
        b.slab(planting, bed, y + 0.12, 0.26, m.soil, 'landscape');
        detail.meadow(planting, bed, () => y + 0.4, 65);
      }
    }
  else if (id === 'B')
    for (const [i, r] of ribbons.entries()) {
      const p = b.part(`Ribbon ${i + 1} folded hall`),
        s = ribbonSurface(r);
      const shell = ribbonShell(s.frontLine, s.rearLine, s.height, 0.36),
        roofY = roofSampler(shell, s.height);
      b.mesh(
        p,
        `Folded ribbon ${i + 1} closed shell`,
        shell,
        [m.silver, m.timber, m.timber],
        'roof',
      );
      facade(
        p,
        s.frontLine.map(([x, z]) => [x, z - 2.6]),
        (x, z) => roofY(x, z) - 0.36,
      );
      facade(p, s.rearLine.slice().reverse(), (x, z) => roofY(x, z) - 0.36);
      const left = [s.frontLine[0], s.rearLine[0]],
        right = [s.rearLine[96], s.frontLine[96]];
      facade(p, left.reverse(), (x, z) => roofY(x, z) - 0.36, 0, true);
      facade(p, right.reverse(), (x, z) => roofY(x, z) - 0.36, 0, true);
      for (let x = r.min + 5; x < r.max - 4; x += 8) {
        const z = s.front((x - r.min) / (r.max - r.min)) - 4,
          h = roofY(x, z) - 0.42;
        b.box(p, x, h / 2, z, 0.2, h, 0.2, m.timber, 'facade');
      }
      detail.interior(
        p,
        (r.min + r.max) / 2,
        r.z + 2,
        0.22,
        r.max - r.min - 14,
        5,
        (x, z) => roofY(x, z) - 0.55,
      );
      b.slab(p, s.outline, 0, 0.22, m.paving);
      for (let x = r.min + 0.8; x < r.max - 0.5; x += 1.25) {
        const u = (x - r.min) / (r.max - r.min);
        for (let j = 0; j < 12; j++) {
          const z1 = THREE.MathUtils.lerp(s.front(u), s.rear(u), j / 12),
            z2 = THREE.MathUtils.lerp(s.front(u), s.rear(u), (j + 1) / 12);
          b.beam(
            p,
            [x, roofY(x, z1) + 0.022, z1],
            [x, roofY(x, z2) + 0.022, z2],
            0.014,
            m.seam,
            'roof',
          );
        }
      }
      interiorLight(p, -18, Math.min(roofY(-18, r.z) - 1, 4.5), r.z + 2);
      if (i < ribbons.length - 1) {
        const next = ribbonSurface(ribbons[i + 1]),
          xmin = Math.max(r.min, ribbons[i + 1].min) + 2,
          xmax = Math.min(r.max, ribbons[i + 1].max) - 2;
        const near: P2[] = [],
          far: P2[] = [];
        for (let j = 0; j <= 48; j++) {
          const x = xmin + ((xmax - xmin) * j) / 48,
            zA = s.rear((x - r.min) / (r.max - r.min)),
            zB = next.front(
              (x - ribbons[i + 1].min) /
                (ribbons[i + 1].max - ribbons[i + 1].min),
            );
          near.push([x, zA - 0.35]);
          far.push([x, zB + 0.35]);
          if (j % 5 === 0 && zA - zB > 4)
            detail.tree(planting, x, (zA + zB) / 2, 0.28, 0.56, j);
        }
        const bed = [...near, ...far.reverse()];
        b.slab(planting, bed, 0.05, 0.18, m.soil, 'landscape');
        detail.meadow(planting, bed, () => 0.24, 130);
      }
    }
  else if (id === 'C') {
    const p = b.part('Continuous dune roof and glazed halls');
    const roof = roofShell(
        duneOutline,
        duneCourts.map((c) => c.outline),
        duneHeight,
        0.34,
        1.4,
      ),
      roofY = roofSampler(roof, duneHeight);
    b.mesh(
      p,
      'Continuous dune roof · connected shell',
      roof,
      [m.silver, m.timber, m.timber],
      'roof',
    );
    const inset = duneOutline.map(([x, z]) => [x * 0.957, z * 0.957] as P2);
    facade(
      p,
      [...inset, inset[0]].reverse(),
      (x, z) => roofY(x, z) - 0.34,
      0,
      true,
    );
    b.mesh(
      p,
      'Dune interior floor with open gardens',
      roofShell(
        duneOutline,
        duneCourts.map((c) => c.outline),
        () => 0.19,
        0.16,
        10,
      ),
      [m.paving, m.paving, m.paving],
      'massing',
    );
    for (const c of duneCourts) {
      const court = b.part(`Garden court · ${c.id}`, 'landscape');
      b.slab(court, c.outline, 0.03, 0.12, m.grass, 'landscape');
      if (c.id !== 'entrance-oculus') {
        facade(p, [...c.outline, c.outline[0]], (x, z) => roofY(x, z) - 0.34);
        detail.meadow(court, c.outline, () => 0.19, Math.round(c.rx * c.rz));
        for (const side of [-1, 1])
          detail.tree(
            court,
            c.center[0] + side * c.rx * 0.35,
            c.center[1],
            0.19,
            0.6,
            side + 1,
          );
      }
    }
    for (let x = -54; x < 55; x += 1.15)
      for (let z = -40; z < 39; z += 1.25) {
        const z2 = z + 1.25;
        const clear = (zz: number) =>
          inside([x, zz], duneOutline) &&
          !duneCourts.some((c) => inside([x, zz], c.outline));
        if (clear(z) && clear(z2) && clear((z + z2) / 2))
          b.beam(
            p,
            [x, roofY(x, z) + 0.024, z],
            [x, roofY(x, z2) + 0.024, z2],
            0.014,
            m.seam,
            'roof',
          );
      }
    for (const [x, z] of [
      [-26, 27],
      [26, 29],
      [-11, -1],
      [34, -16],
    ]) {
      detail.interior(
        p,
        x,
        z,
        0.2,
        14,
        5,
        (px, pz) => roofY(px, pz) - 0.5,
        (px, pz) => duneCourts.some((c) => inside([px, pz], c.outline)),
      );
      interiorLight(p, x, Math.min(5, roofY(x, z) - 1), z);
    }
  } else {
    for (const t of halls) {
      const p = b.part(`Technical hall ${t.id}`),
        { x, z, w, d, y, h } = t;
      b.box(p, x, (y + h) / 2, z, w, y + h, d, m.back);
      b.mesh(
        p,
        `Technical hall ${t.id} closed roof shell`,
        roofShell(
          [
            [x - w / 2 - 0.15, z + d / 2 + 0.15],
            [x + w / 2 + 0.15, z + d / 2 + 0.15],
            [x + w / 2 + 0.15, z - d / 2 - 0.15],
            [x - w / 2 - 0.15, z - d / 2 - 0.15],
          ],
          [],
          () => y + h + 0.3,
          0.3,
          8,
        ),
        [m.silver, m.back, m.silver],
        'roof',
      );
      for (const zz of [z - d / 2, z + d / 2])
        detail.line(
          p,
          [x - w / 2, zz],
          [x + w / 2, zz],
          y + h + 0.65,
          0.18,
          1.0,
          m.silver,
          'roof',
        );
      for (const xx of [x - w / 2, x + w / 2])
        detail.line(
          p,
          [xx, z - d / 2],
          [xx, z + d / 2],
          y + h + 0.65,
          0.18,
          1.0,
          m.silver,
          'roof',
        );
      for (let xx = x - w / 2 + 0.1; xx <= x + w / 2; xx += 0.76)
        for (const side of [-1, 1])
          b.instance(
            p,
            'Aluminum facade fins',
            b.cube,
            m.silver,
            [xx, (y + h) / 2, z + side * (d / 2 + 0.32)],
            [0.1, y + h, 0.67],
            'facade',
          );
      for (let zz = z - d / 2 + 0.1; zz < z + d / 2; zz += 0.76)
        for (const side of [-1, 1])
          if (
            side !== Math.sign(x) ||
            ![-5, 0, 5].some((dz) => Math.abs(zz - z - dz) < 1.8)
          )
            b.instance(
              p,
              'Aluminum return fins',
              b.cube,
              m.silver,
              [x + side * (w / 2 + 0.32), (y + h) / 2, zz],
              [0.67, y + h, 0.1],
              'facade',
            );
      detail.equipment(p, x, z, y + h + 0.35, w - 10, d - 9);
      const side = x > 0 ? 1 : -1;
      for (let j = 0; j < 3; j++) {
        const pz = z - 5 + j * 5;
        b.box(
          p,
          x + side * (w / 2 + 0.36),
          y + 1.85,
          pz,
          0.1,
          3.7,
          3.2,
          m.dark,
          'facade',
        );
        for (let k = 0; k < 9; k++)
          b.box(
            p,
            x + side * (w / 2 + 0.425),
            y + 0.4 + k * 0.35,
            pz,
            0.035,
            0.045,
            2.9,
            m.silver,
            'facade',
          );
      }
    }
    for (const [i, t] of pavilions.entries()) {
      const p = b.part(`Lantern pavilion ${i + 1}`),
        { x, z, w, d, y, h } = t;
      b.box(p, x, y / 2, z, w, Math.max(0.15, y), d, m.stone);
      b.box(p, x, y + 0.1, z, w, 0.2, d, m.paving);
      b.mesh(
        p,
        `Lantern pavilion ${i + 1} closed roof shell`,
        roofShell(
          [
            [x - w / 2 - 0.25, z + d / 2 + 0.25],
            [x + w / 2 + 0.25, z + d / 2 + 0.25],
            [x + w / 2 + 0.25, z - d / 2 - 0.25],
            [x - w / 2 - 0.25, z - d / 2 - 0.25],
          ],
          [],
          () => y + h + 0.15,
          0.3,
          6,
        ),
        [m.silver, m.timber, m.silver],
        'roof',
      );
      const outline: P2[] = [
        [x - w / 2, z + d / 2],
        [x + w / 2, z + d / 2],
        [x + w / 2, z - d / 2],
        [x - w / 2, z - d / 2],
        [x - w / 2, z + d / 2],
      ];
      facade(p, [outline[1], outline[2]], () => y + h - 0.15, y + 0.2);
      facade(p, [outline[3], outline[4]], () => y + h - 0.15, y + 0.2);
      if (i === 0)
        facade(p, [outline[0], outline[1]], () => y + h - 0.15, y + 0.2);
      if (i === pavilions.length - 1)
        facade(p, [outline[2], outline[3]], () => y + h - 0.15, y + 0.2);
      detail.interior(p, x, z, y + 0.2, w - 3, d - 3, y + h - 0.3);
      b.box(p, x - w / 2 + 0.8, y + 1.7, z, 0.18, 3, d - 6, m.timber, 'facade');
      b.box(
        p,
        x - w / 2 + 1,
        y + 3.25,
        z,
        0.18,
        0.06,
        d - 6,
        m.light,
        'facade',
      );
      b.box(p, x, y + h - 0.25, z, w - 0.4, 0.12, d - 0.4, m.timber, 'canopy');
      interiorLight(p, x, y + 4.8, z);
      if (i === 0) {
        b.box(p, x, y + 3.5, z - d / 2 + 3, w - 1, 0.2, 5, m.timber, 'facade');
        detail.stairs(p, x - w / 2 + 2, z + 4, 1.7, y + 0.2, y + 3.6, 6.8);
        detail.line(
          p,
          [x - w / 2 + 1, z - d / 2 + 5.5],
          [x + w / 2 - 1, z - d / 2 + 5.5],
          y + 4.45,
          0.045,
          0.045,
          m.dark,
          'facade',
        );
      }
      const [bx, bz] = [
        [-31, 9.5],
        [-30, -16],
        [32, -0.2],
        [32, -23.4],
      ][i];
      const bed = ellipse(bx, bz, 5, 0.75);
      b.slab(planting, bed, 0.12, 0.2, m.soil, 'landscape');
      detail.meadow(planting, bed, () => 0.32, 28);
      detail.tree(planting, bx, bz, 0.32, 0.48, i);
      if (i > 0) {
        const prev = pavilions[i - 1],
          front = z + d / 2,
          rear = prev.z - prev.d / 2;
        const depth = Math.max(1, rear - front + 1.2),
          cz = (front + rear) / 2;
        b.box(p, x, y + h - 0.4, cz, w - 2, 0.25, depth, m.silver, 'roof');
        detail.stairs(
          p,
          x,
          cz + depth / 2,
          w - 3,
          prev.y,
          y,
          Math.max(3, depth),
        );
      }
    }
  }
  const root = b.finish();
  root.userData.sculptRuntime.entrances = [
    {
      id: `${id.toLowerCase()}-public-entrance`,
      position: entrances[id],
      facing: [0, 0, 1],
    },
  ];
  // Materials unused in a construction pass must not escape the root's lifetime.
  const used = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh)
      for (const mat of Array.isArray(o.material) ? o.material : [o.material])
        used.add(mat);
  });
  for (const mat of Object.values(m).flat())
    if (!used.has(mat)) {
      for (const value of Object.values(mat))
        if (value instanceof THREE.Texture) value.dispose();
      mat.dispose();
    }
  root.userData.reference = {
    image: demoConcept(id).image,
    hiddenAreas:
      'Rear facades, structure, interiors and topography inferred from one image.',
    courtyards:
      id === 'C' ? duneCourts.map((c) => ({ id: c.id, center: c.center })) : [],
  };
  return root;
}
