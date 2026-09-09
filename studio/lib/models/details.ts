import * as THREE from 'three';
import {
  AssemblyBuilder,
  inside,
  type Height,
  type P2,
} from './geometry';
import type { ModelMaterials } from './materials';
import type { Feature } from '../spec';
export function createDetails(b: AssemblyBuilder, m: ModelMaterials) {
  function line(
    part: THREE.Group,
    a: P2,
    c: P2,
    y: number,
    width: number,
    height: number,
    mat: THREE.Material,
    feature: Feature = 'facade',
  ) {
    const dx = c[0] - a[0],
      dz = c[1] - a[1];
    b.box(
      part,
      (a[0] + c[0]) / 2,
      y,
      (a[1] + c[1]) / 2,
      Math.hypot(dx, dz),
      height,
      width,
      mat,
      feature,
      -Math.atan2(dz, dx),
    );
  }
  function facade(
    part: THREE.Group,
    path: P2[],
    top: Height,
    bottom = 0,
    solidLow = false,
  ) {
    let distance = 0,
      nextMullion = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i],
        c = path[i + 1],
        ya = top(...a),
        yc = top(...c),
        len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.001 || Math.min(ya, yc) <= bottom + 0.15) continue;
      const mat = solidLow && Math.min(ya, yc) < 3.5 ? m.silver : m.glass;
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            a[0],
            bottom,
            a[1],
            c[0],
            bottom,
            c[1],
            c[0],
            yc,
            c[1],
            a[0],
            ya,
            a[1],
          ],
          3,
        ),
      );
      g.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(
          [0, bottom, len, bottom, len, yc, 0, ya],
          2,
        ),
      );
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      b.add(part, g, mat, 'facade');
      while (nextMullion <= distance + len) {
        const u = (nextMullion - distance) / len,
          x = a[0] + (c[0] - a[0]) * u,
          z = a[1] + (c[1] - a[1]) * u,
          h = ya + (yc - ya) * u - bottom;
        b.instance(
          part,
          'Curtain wall mullions',
          b.cube,
          m.dark,
          [x, bottom + h / 2, z],
          [0.075, h, 0.14],
          'facade',
          new THREE.Euler(0, -Math.atan2(c[1] - a[1], c[0] - a[0]), 0),
        );
        nextMullion += 1.5;
      }
      b.beam(part, [a[0], ya, a[1]], [c[0], yc, c[1]], 0.055, m.dark, 'facade');
      const transom = bottom + 2.5;
      if (Math.min(ya, yc) > transom + 0.4)
        b.beam(
          part,
          [a[0], transom, a[1]],
          [c[0], transom, c[1]],
          0.035,
          m.dark,
          'facade',
        );
      line(part, a, c, bottom + 0.06, 0.17, 0.12, m.dark, 'facade');
      distance += len;
    }
  }
  function tree(
    part: THREE.Group,
    x: number,
    z: number,
    y = 0,
    size = 1,
    kind = 0,
  ) {
    const height = (5.1 + b.random() * 1.5) * size;
    b.instance(
      part,
      'Branched tree trunks',
      b.cylinder,
      m.bark,
      [x, y + height * 0.4, z],
      [0.14 * size, height * 0.8, 0.14 * size],
    );
    for (let j = 0; j < 5; j++) {
      const t = j * 2.399 + kind * 0.6,
        spread = (0.9 + b.random() * 0.65) * size,
        cx = x + Math.cos(t) * spread,
        cz = z + Math.sin(t) * spread,
        cy = y + height * (0.63 + 0.06 * j);
      b.beam(
        part,
        [x, y + height * 0.35, z],
        [cx, cy, cz],
        0.035 * size,
        m.bark,
        'landscape',
      );
      b.instance(
        part,
        `Tree crown core ${kind % 2}`,
        b.crown,
        m.leaf[kind % 2],
        [cx, cy, cz],
        [0.55 * size, 0.7 * size, 0.52 * size],
      );
      for (let k = 0; k < 14; k++) {
        const angle = k * 2.399,
          vertical = (k / 13 - 0.5) * 1.7,
          radius = Math.sqrt(Math.max(0, 1 - vertical * vertical)) * 0.8,
          px = cx + Math.cos(angle) * radius * size,
          pz = cz + Math.sin(angle) * radius * size;
        b.instance(
          part,
          `Canopy leaf sprays ${kind % 2}`,
          b.foliage,
          m.foliage[kind % 2],
          [px, cy + vertical * size, pz],
          [1.75 * size, 1.75 * size, 1],
          'landscape',
          new THREE.Euler(
            (b.random() - 0.5) * 2,
            angle,
            (b.random() - 0.5) * 2,
          ),
        );
      }
    }
  }
  function shrub(part: THREE.Group, x: number, z: number, y = 0, size = 1) {
    const kind = Math.floor(b.random() * 3),
      s = (0.45 + b.random() * 0.4) * size;
    b.instance(
      part,
      `Native shrub ${kind}`,
      b.shrub,
      m.leaf[kind],
      [x, y + s * 0.5, z],
      [s * 0.45, s * (kind === 2 ? 0.28 : 0.42), s * 0.4],
    );
    for (let k = 0; k < 5; k++) {
      const a = k * 2.399;
      b.instance(
        part,
        `Shrub leaf sprays ${kind}`,
        b.foliage,
        m.foliage[kind],
        [x + Math.cos(a) * s * 0.32, y + s * 0.38, z + Math.sin(a) * s * 0.32],
        [s * 1.5, s * 1.15, 1],
        'landscape',
        new THREE.Euler(0.5, a, 0.4 * Math.sin(a)),
      );
    }
    if (kind === 2)
      for (let j = 0; j < 3; j++) {
        const angle = b.random() * Math.PI * 2;
        b.instance(
          part,
          'Dry grass tussocks',
          b.cylinder,
          m.grass,
          [
            x + Math.cos(angle) * s * 0.5,
            y + s * 0.55,
            z + Math.sin(angle) * s * 0.5,
          ],
          [0.04, s * 0.8, 0.035],
          'landscape',
          new THREE.Euler(
            0.25 * Math.cos(angle),
            angle,
            0.25 * Math.sin(angle),
          ),
        );
      }
  }
  function meadow(
    part: THREE.Group,
    outline: P2[],
    y: Height,
    count: number,
    exclude: (x: number, z: number) => boolean = () => false,
  ) {
    const xs = outline.map((p) => p[0]),
      zs = outline.map((p) => p[1]),
      minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minZ = Math.min(...zs),
      maxZ = Math.max(...zs);
    for (let i = 0, placed = 0; i < count * 8 && placed < count; i++) {
      const x = minX + b.random() * (maxX - minX),
        z = minZ + b.random() * (maxZ - minZ);
      if (!inside([x, z], outline) || exclude(x, z)) continue;
      shrub(part, x, z, y(x, z), 0.65 + b.random() * 0.7);
      placed++;
    }
  }
  function stairs(
    part: THREE.Group,
    x: number,
    z: number,
    width: number,
    fromY: number,
    toY: number,
    length: number,
    angle = 0,
  ) {
    const n = Math.max(2, Math.ceil(Math.abs(toY - fromY) / 0.18));
    const transform = (lx: number, lz: number): P2 => [
      x + lx * Math.cos(angle) + lz * Math.sin(angle),
      z - lx * Math.sin(angle) + lz * Math.cos(angle),
    ];
    for (let i = 0; i < n; i++) {
      const h = fromY + ((toY - fromY) * (i + 1)) / n,
        p = transform(0, (-length * (i + 0.5)) / n);
      b.box(
        part,
        p[0],
        (h + fromY) / 2,
        p[1],
        width,
        Math.max(0.04, h - fromY),
        length / n + 0.015,
        m.paving,
        'landscape',
        angle,
      );
    }
    for (const side of [-1, 1]) {
      const start = transform(side * (width / 2 - 0.12), 0),
        end = transform(side * (width / 2 - 0.12), -length);
      b.beam(
        part,
        [start[0], fromY + 0.95, start[1]],
        [end[0], toY + 0.95, end[1]],
        0.035,
        m.dark,
        'landscape',
      );
      for (let i = 0; i <= 4; i++) {
        const u = i / 4,
          p = transform(side * (width / 2 - 0.12), -length * u),
          y = fromY + (toY - fromY) * u;
        b.box(
          part,
          p[0],
          y + 0.48,
          p[1],
          0.045,
          0.96,
          0.045,
          m.dark,
          'landscape',
        );
      }
    }
  }
  function equipment(
    part: THREE.Group,
    x: number,
    z: number,
    y: number,
    w: number,
    d: number,
  ) {
    const rows = Math.max(1, Math.floor(d / 5)),
      cols = Math.max(2, Math.floor(w / 4));
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const px = x - w / 2 + 2 + (col * (w - 4)) / Math.max(1, cols - 1),
          pz = z - d / 2 + 2.2 + (row * (d - 4.4)) / Math.max(1, rows - 1);
        b.instance(
          part,
          'Mechanical housings',
          b.cube,
          m.silver,
          [px, y + 0.58, pz],
          [2.5, 1.16, 2.7],
          'roof',
        );
        b.instance(
          part,
          'Fan rims',
          b.cylinder,
          m.dark,
          [px, y + 1.18, pz],
          [0.65, 0.08, 0.65],
          'roof',
        );
        b.instance(
          part,
          'Fan hubs',
          b.cylinder,
          m.silver,
          [px, y + 1.25, pz],
          [0.13, 0.07, 0.13],
          'roof',
        );
        for (let k = 0; k < 5; k++)
          b.box(
            part,
            px,
            y + 0.22 + k * 0.16,
            pz + 1.36,
            2.2,
            0.035,
            0.025,
            m.dark,
            'roof',
          );
      }
    for (const zz of [z - d / 2 - 0.8, z + d / 2 + 0.8]) {
      line(
        part,
        [x - w / 2 - 1, zz],
        [x + w / 2 + 1, zz],
        y + 0.64,
        0.12,
        1.28,
        m.back,
        'roof',
      );
      for (let i = 0; i < 5; i++)
        line(
          part,
          [x - w / 2 - 1, zz + 0.1],
          [x + w / 2 + 1, zz + 0.1],
          y + 0.15 + i * 0.26,
          0.08,
          0.085,
          m.silver,
          'roof',
        );
    }
    for (const xx of [x - w / 2 - 1, x + w / 2 + 1])
      line(
        part,
        [xx, z - d / 2 - 0.8],
        [xx, z + d / 2 + 0.8],
        y + 0.64,
        0.12,
        1.28,
        m.back,
        'roof',
      );
  }
  function furniture(part: THREE.Group, x: number, z: number, y: number) {
    b.box(part, x, y + 0.72, z, 1.2, 0.08, 0.7, m.timber, 'facade');
    for (const sx of [-0.45, 0.45])
      for (const sz of [-0.23, 0.23])
        b.box(
          part,
          x + sx,
          y + 0.36,
          z + sz,
          0.035,
          0.72,
          0.035,
          m.dark,
          'facade',
        );
    for (const side of [-1, 1]) {
      b.box(
        part,
        x,
        y + 0.45,
        z + side * 0.85,
        0.48,
        0.08,
        0.48,
        m.timber,
        'facade',
      );
      b.box(
        part,
        x,
        y + 0.69,
        z + side * 1.07,
        0.48,
        0.42,
        0.045,
        m.timber,
        'facade',
      );
    }
  }
  function interior(
    part: THREE.Group,
    x: number,
    z: number,
    y: number,
    w: number,
    d: number,
    ceiling: number | Height,
    exclusion: (x: number, z: number) => boolean = () => false,
  ) {
    for (let px = x - w / 2 + 3; px < x + w / 2 - 1; px += 6) {
      const h = typeof ceiling === 'number' ? ceiling : ceiling(px, z);
      if (exclusion(px, z) || h - y < 2.2) continue;
      b.box(part, px, y + (h - y) / 2, z, 0.2, h - y, 0.2, m.timber, 'facade');
      b.box(part, px, h - 0.25, z, 2.5, 0.06, 0.14, m.light, 'facade');
    }
    for (let px = x - w / 2 + 3; px < x + w / 2 - 1; px += 5.3)
      for (let pz = z - d / 2 + 2; pz < z + d / 2 - 1; pz += 4.5)
        if (
          !exclusion(px, pz) &&
          (typeof ceiling === 'number' ? ceiling : ceiling(px, pz)) - y > 2.2
        )
          furniture(part, px, pz, y);
  }
  function people(part: THREE.Group, x: number, z: number, y = 0) {
    const scale = 0.9 + b.random() * 0.18,
      mat = b.random() > 0.5 ? m.dark : m.timber;
    b.instance(
      part,
      'Visitors · torso',
      b.cylinder,
      mat,
      [x, y + 0.98 * scale, z],
      [0.17 * scale, 0.62 * scale, 0.13 * scale],
    );
    b.instance(
      part,
      'Visitors · head',
      b.shrub,
      m.stone,
      [x, y + 1.48 * scale, z],
      [0.12 * scale, 0.16 * scale, 0.12 * scale],
    );
    for (const side of [-1, 1])
      b.instance(
        part,
        'Visitors · legs',
        b.cylinder,
        m.dark,
        [x + side * 0.08, y + 0.39 * scale, z + side * 0.04],
        [0.055, 0.78 * scale, 0.06],
      );
  }
  return {
    line,
    facade,
    tree,
    shrub,
    meadow,
    stairs,
    equipment,
    furniture,
    interior,
    people,
  };
}
