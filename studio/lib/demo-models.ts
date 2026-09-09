import * as THREE from 'three';
import type { ConceptId, Feature } from './spec';
import { demoConcept } from './demo-catalog';

/** Fixed, single-image architectural reconstructions. Hidden sides and dimensions are inferred.
 * X lateral, +Z public entrance, Y up. Campus envelopes fit 112 × 84 metres.
 * Parts are named independently, with deterministic instanced landscaping and facade details. */
export function buildDemoModel(id: ConceptId): THREE.Group {
  const root = new THREE.Group();
  root.name = demoConcept(id).name;
  root.userData = { concept: id, approximate: true, bounds: [112, 16, 84] };
  const material = (color: string, roughness = 0.7, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const stone = material('#bba88d'),
    paving = material('#c7bda8'),
    silver = material('#c7cccf', 0.38, 0.52),
    timber = material('#a67c48', 0.76),
    dark = material('#454b48', 0.55, 0.25),
    soil = material('#7d8060'),
    grass = material('#606e46');
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#a9b5ad',
    metalness: 0.3,
    roughness: 0.16,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glow = material('#e9c78f', 0.65);
  glow.emissive.set('#e4a552');
  glow.emissiveIntensity = 0.28;
  const trunk = material('#74634b'),
    leaves = [material('#354e38'), material('#526442'), material('#718052')];
  const cube = new THREE.BoxGeometry(1, 1, 1),
    sphere = new THREE.IcosahedronGeometry(1, 1),
    cylinder = new THREE.CylinderGeometry(0.7, 1, 1, 7);
  const batches = new Map<
    string,
    {
      geometry: THREE.BufferGeometry;
      material: THREE.Material;
      matrices: THREE.Matrix4[];
      feature: Feature;
    }
  >();
  function instance(
    name: string,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    position: number[],
    scale: number[],
    feature: Feature = 'landscape',
    angle = 0,
  ) {
    let b = batches.get(name);
    if (!b) {
      b = { geometry, material: mat, matrices: [], feature };
      batches.set(name, b);
    }
    b.matrices.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...(position as [number, number, number])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
        new THREE.Vector3(...(scale as [number, number, number])),
      ),
    );
  }
  function mesh(
    name: string,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    feature: Feature,
    parent = root,
  ) {
    const m = new THREE.Mesh(geometry, mat);
    m.name = name;
    m.userData.feature = feature;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    feature: Feature = 'massing',
  ) {
    const m = mesh(name, cube, mat, feature);
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    return m;
  }
  let seed = 84217;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function tree(x: number, z: number, y = 0, size = 1) {
    instance(
      'Tree trunks',
      cylinder,
      trunk,
      [x, y + 2.2 * size, z],
      [0.22 * size, 4.4 * size, 0.22 * size],
    );
    for (let k = 0; k < 3; k++)
      instance(
        `Tree crowns ${k}`,
        sphere,
        leaves[k],
        [
          x + (random() - 0.5) * size,
          y + (4 + k * 0.7) * size,
          z + (random() - 0.5) * size,
        ],
        [1.35 * size, (1.8 - k * 0.25) * size, 1.3 * size],
      );
  }
  function shrubs(x: number, z: number, y = 0, scale = 1) {
    instance(
      'Low native shrubs',
      sphere,
      leaves[2],
      [x, y + 0.4 * scale, z],
      [0.65 * scale, 0.45 * scale, 0.6 * scale],
    );
  }
  function planting(
    name: string,
    x: number,
    z: number,
    w: number,
    d: number,
    y = 0,
    count = 35,
  ) {
    box(name, x, y + 0.12, z, w, 0.24, d, grass, 'landscape');
    for (let i = 0; i < count; i++)
      shrubs(
        x + (random() - 0.5) * (w - 1),
        z + (random() - 0.5) * (d - 1),
        y + 0.24,
        0.6 + random(),
      );
  }
  function facade(
    name: string,
    x: number,
    z: number,
    w: number,
    h: number,
    y = 0,
  ) {
    box(`${name} glazing`, x, y + h / 2, z, w, h, 0.14, glass, 'facade');
    box(`${name} interior floor`, x, y + 0.12, z - 2, w, 0.24, 4, paving);
    box(
      `${name} warm interior`,
      x,
      y + h * 0.43,
      z - 2.6,
      w - 1,
      h * 0.75,
      0.12,
      glow,
      'facade',
    );
    for (let xx = x - w / 2; xx <= x + w / 2; xx += 1.6)
      instance(
        'Glazing mullions',
        cube,
        dark,
        [xx, y + h / 2, z + 0.13],
        [0.09, h, 0.16],
        'facade',
      );
    instance(
      'Glazing transoms',
      cube,
      dark,
      [x, y + h * 0.65, z + 0.13],
      [w, 0.07, 0.16],
      'facade',
    );
  }
  function equipment(x: number, z: number, y: number, count = 5) {
    for (let i = 0; i < count; i++) {
      instance(
        'Rooftop mechanical units',
        cube,
        silver,
        [x + i * 3.4, y + 0.65, z],
        [2.3, 1.3, 2.5],
        'roof',
      );
      instance(
        'Mechanical fan grilles',
        cylinder,
        dark,
        [x + i * 3.4, y + 1.33, z],
        [0.7, 0.06, 0.7],
        'roof',
      );
    }
  }
  box('Landscape plinth', 0, -1.2, 0, 148, 2, 120, soil, 'landscape');
  box('Campus apron', 0, -0.08, 0, 124, 0.2, 96, paving, 'landscape');
  box('Public road', 0, 0.02, 53, 148, 0.08, 6, dark, 'landscape');
  box('Public promenade', 0, 0.12, 46, 128, 0.25, 4, paving, 'landscape');
  for (let x = -68; x < 70; x += 7)
    instance('Road markings', cube, paving, [x, 0.07, 53], [3, 0.03, 0.12]);
  for (let i = 0; i < 180; i++) {
    const side = i % 4,
      x =
        side < 2
          ? (side === 0 ? -1 : 1) * (65 + random() * 7)
          : (random() - 0.5) * 142;
    const z =
      side < 2
        ? (random() - 0.5) * 100
        : (side === 2 ? -1 : 1) * (55 + random() * 3);
    tree(x, z, 0, 0.7 + random() * 0.8);
  }
  for (let x = -54; x <= 54; x += 9) {
    tree(x, 43, 0, 0.6);
    shrubs(x + 3, 43);
  }

  if (id === 'A') {
    // Four retreating landscape terraces with staggered wings and tall public glazing.
    for (let row = 0; row < 4; row++) {
      const z = 29 - row * 21,
        y = row * 1.15,
        w = 108 - row * 5,
        h = 6.4;
      box(
        `Terrace ${row + 1} retaining base`,
        0,
        y / 2,
        z,
        w,
        Math.max(0.1, y),
        18,
        stone,
      );
      box(
        `Terrace ${row + 1} stone hall`,
        0,
        y + h / 2,
        z - 2,
        w,
        h,
        14,
        stone,
      );
      box(
        `Terrace ${row + 1} left wing`,
        -w / 2 + 4,
        y + h / 2,
        z + 6,
        8,
        h,
        6,
        stone,
      );
      box(
        `Terrace ${row + 1} right wing`,
        w / 2 - 4,
        y + h / 2,
        z + 6,
        8,
        h,
        6,
        stone,
      );
      facade(
        `Terrace ${row + 1} public front`,
        row % 2 ? 7 : -9,
        z + 8.1,
        w * 0.7,
        5.4,
        y + 0.2,
      );
      box(
        `Terrace ${row + 1} roof slab`,
        0,
        y + h,
        z,
        w + 0.3,
        0.4,
        18.4,
        stone,
        'roof',
      );
      planting(
        `Terrace ${row + 1} roof garden`,
        0,
        z,
        w - 3,
        14,
        y + h + 0.2,
        110,
      );
      box(
        `Terrace ${row + 1} roof walk`,
        0,
        y + h + 0.42,
        z + 5,
        w - 3,
        0.14,
        2,
        paving,
        'landscape',
      );
      for (let x = -w / 2 + 6; x < w / 2 - 3; x += 12)
        tree(x, z - 3, y + h + 0.4, 0.4);
      box(
        `Terrace ${row + 1} parapet`,
        0,
        y + h + 0.6,
        z + 9,
        w,
        0.8,
        0.35,
        stone,
        'roof',
      );
      const stairX = row % 2 ? -w / 2 + 3 : w / 2 - 3;
      for (let j = 0; j < 25; j++)
        box(
          `Terrace ${row + 1} stair ${j}`,
          stairX,
          y + ((j + 1) * h) / 50,
          z + 15 - j * 0.4,
          3,
          ((j + 1) * h) / 25,
          0.42,
          paving,
          'landscape',
        );
    }
    planting('Front meadow', -29, 40, 35, 4, 0, 45);
    planting('Entrance garden', 30, 40, 31, 4, 0, 40);
  } else if (id === 'B') {
    // Lofted, folded ribbon roofs. Each roof has real thickness and angular ridge transitions.
    for (let row = 0; row < 4; row++) {
      const z = 28 - row * 22,
        width = 108 - row * 3;
      const profile = (u: number) =>
        3.5 +
        8.5 * Math.max(0, 1 - Math.abs(u - 0.36) / 0.39) +
        2 * Math.max(0, 1 - Math.abs(u - 0.8) / 0.22);
      const n = 64,
        positions: number[] = [],
        indices: number[] = [];
      for (let layer = 0; layer < 2; layer++)
        for (let j = 0; j < 2; j++)
          for (let i = 0; i <= n; i++) {
            const u = i / n,
              x = (u - 0.5) * width;
            positions.push(
              x,
              profile(u) + j * 1.6 - layer * 0.4,
              z + (j - 0.5) * 17 + Math.sin(u * Math.PI) * 3,
            );
          }
      const line = n + 1,
        top = 2 * line;
      for (let i = 0; i < n; i++) {
        indices.push(i, i + 1, line + i, i + 1, line + i + 1, line + i);
        indices.push(
          top + i,
          top + line + i,
          top + i + 1,
          top + i + 1,
          top + line + i,
          top + line + i + 1,
        );
        for (const edge of [0, line]) {
          const a = edge + i;
          indices.push(a, top + a, a + 1, a + 1, top + a, top + a + 1);
        }
      }
      for (const i of [0, n])
        indices.push(i, line + i, top + i, line + i, top + line + i, top + i);
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.setIndex(indices);
      g.computeVertexNormals();
      const roof = mesh(`Folded ribbon ${row + 1}`, g, silver, 'roof');
      roof.material.side = THREE.DoubleSide;
      // Wood underside follows the same fold rather than a flat box.
      const underside = g.clone();
      underside.translate(0, -0.07, 0);
      mesh(`Timber soffit ${row + 1}`, underside, timber, 'canopy').scale.y =
        0.95;
      for (let seg = 0; seg < 27; seg++) {
        const u = (seg + 0.5) / 27,
          x = (u - 0.5) * width,
          h = profile(u) - 0.5;
        facade(
          `Ribbon ${row + 1} bay ${seg + 1}`,
          x,
          z + 8.55 + Math.sin(u * Math.PI) * 3,
          width / 27 - 0.08,
          h,
        );
        const seam = box(
          `Ribbon ${row + 1} seam ${seg}`,
          x,
          profile(u) + 0.83,
          z + Math.sin(u * Math.PI) * 3,
          0.035,
          0.035,
          17.1,
          dark,
          'roof',
        );
        seam.rotation.x = -Math.atan2(1.6, 17);
      }
      box(
        `Ribbon ${row + 1} end enclosure`,
        width / 2 - 4,
        2.4,
        z,
        8,
        4.8,
        17,
        silver,
      );
      if (row < 3) {
        planting(`Ribbon court ${row + 1}`, 0, z - 12, 87, 4, 0, 70);
        for (let x = -35; x < 40; x += 12) tree(x, z - 12, 0, 0.65);
      }
    }
    box('Rear technical hall', 35, 4.3, -30, 30, 8.6, 18, silver);
    equipment(24, -30, 8.6, 7);
  } else if (id === 'C') {
    // Three undulating annular roof shells: actual courtyard holes, continuous surfaces and fascia.
    for (let row = 0; row < 3; row++) {
      const cz = 26 - row * 29,
        rx = 54 - row * 2,
        rz = 16,
        n = 160,
        rings = 12;
      const positions: number[] = [],
        indices: number[] = [];
      const point = (t: number, v: number, layer: number) => {
        const rxi = rx * 0.44,
          rzi = 5.5;
        const x = Math.cos(t) * (rxi + (rx - rxi) * v);
        const z =
          cz + Math.sin(t) * (rzi + (rz - rzi) * v) + Math.sin(t * 2) * 2;
        const y =
          7.3 +
          2.9 * Math.sin(t * 2 + 0.3) +
          1.5 * Math.cos(t * 3 - row * 0.4) +
          1.1 * Math.sin(v * Math.PI) -
          layer * 0.38;
        return [x, y, z];
      };
      const stride = n + 1,
        layerSize = (rings + 1) * stride;
      for (let layer = 0; layer < 2; layer++)
        for (let r = 0; r <= rings; r++)
          for (let i = 0; i <= n; i++)
            positions.push(...point((i / n) * Math.PI * 2, r / rings, layer));
      for (let layer = 0; layer < 2; layer++)
        for (let r = 0; r < rings; r++)
          for (let i = 0; i < n; i++) {
            const a = layer * layerSize + r * stride + i,
              b = a + stride;
            if (layer === 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
            else indices.push(a, a + 1, b, a + 1, b + 1, b);
          }
      for (const r of [0, rings])
        for (let i = 0; i < n; i++) {
          const a = r * stride + i,
            b = a + layerSize;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.setIndex(indices);
      g.computeVertexNormals();
      silver.side = THREE.DoubleSide;
      mesh(`Continuous dune roof ${row + 1}`, g, silver, 'roof');
      // Court and perimeter curtain walls follow the roof edge, segmented finely around the ellipse.
      for (const edge of [0, 1])
        for (let i = 0; i < n; i += 2) {
          const a = point((i / n) * Math.PI * 2, edge, 1),
            b = point(((i + 2) / n) * Math.PI * 2, edge, 1);
          const len = Math.hypot(b[0] - a[0], b[2] - a[2]),
            h = Math.min(a[1], b[1]) - 0.15;
          const m = box(
            `Dune ${row + 1} ${edge ? 'outer' : 'court'} glazing ${i}`,
            (a[0] + b[0]) / 2,
            h / 2,
            (a[2] + b[2]) / 2,
            len,
            h,
            0.08,
            glass,
            'facade',
          );
          m.rotation.y = -Math.atan2(b[2] - a[2], b[0] - a[0]);
          instance(
            'Dune mullions',
            cube,
            timber,
            [a[0], h / 2, a[2]],
            [0.1, h, 0.1],
            'facade',
          );
          instance(
            'Warm soffit edge',
            cube,
            timber,
            [(a[0] + b[0]) / 2, h + 0.03, (a[2] + b[2]) / 2],
            [len, 0.25, 1.2],
            'canopy',
            m.rotation.y,
          );
        }
      // A planted oval stays inside the open court; floor surrounds it beneath the shell.
      const court = mesh(
        `Open courtyard ${row + 1}`,
        new THREE.CircleGeometry(1, 64),
        grass,
        'landscape',
      );
      court.rotation.x = -Math.PI / 2;
      court.scale.set(rx * 0.4, 4.7, 1);
      court.position.set(0, 0.14, cz);
      for (let i = 0; i < 38; i++) {
        const t = random() * Math.PI * 2,
          r = Math.sqrt(random());
        shrubs(Math.cos(t) * rx * 0.36 * r, cz + Math.sin(t) * 4 * r);
      }
      for (let x = -16; x <= 16; x += 8) tree(x, cz, 0, 0.65);
      // Interior warm floor bands, kept clear of each courtyard opening.
      box(`Dune ${row + 1} south interior`, 0, 0.18, cz + 10, 75, 0.3, 5, glow);
      box(
        `Dune ${row + 1} north interior`,
        0,
        0.18,
        cz - 10,
        75,
        0.3,
        5,
        paving,
      );
    }
    box('Dune rear equipment enclosure', 38, 3.4, -34, 24, 6.8, 14, silver);
    equipment(30, -34, 6.8, 5);
  } else {
    // Six technical halls flank a lower, luminous visitor spine.
    for (let row = 0; row < 3; row++)
      for (const side of [-1, 1]) {
        const x = side * 33,
          z = 26 - row * 30,
          h = 8 + row * 0.7,
          w = 39,
          d = 22;
        box(`Hall ${row + 1} ${side} enclosure`, x, h / 2, z, w, h, d, silver);
        box(
          `Hall ${row + 1} ${side} roof`,
          x,
          h,
          z,
          w + 0.5,
          0.35,
          d + 0.5,
          paving,
          'roof',
        );
        box(
          `Hall ${row + 1} ${side} parapet front`,
          x,
          h + 0.65,
          z + d / 2,
          w,
          1.3,
          0.2,
          silver,
          'roof',
        );
        box(
          `Hall ${row + 1} ${side} parapet rear`,
          x,
          h + 0.65,
          z - d / 2,
          w,
          1.3,
          0.2,
          silver,
          'roof',
        );
        for (let xx = x - w / 2; xx <= x + w / 2; xx += 0.85) {
          instance(
            'Vertical aluminum fins',
            cube,
            silver,
            [xx, h / 2, z + d / 2 + 0.38],
            [0.13, h, 0.8],
            'facade',
          );
          instance(
            'Rear aluminum fins',
            cube,
            silver,
            [xx, h / 2, z - d / 2 - 0.38],
            [0.13, h, 0.8],
            'facade',
          );
        }
        for (let zz = z - d / 2; zz < z + d / 2; zz += 0.85)
          instance(
            'Hall end fins',
            cube,
            silver,
            [x + side * (w / 2 + 0.35), h / 2, zz],
            [0.8, h, 0.13],
            'facade',
          );
        equipment(x - 12, z, h + 0.2, 8);
        box(
          `Hall ${row + 1} connector ${side}`,
          side * 10,
          2.3,
          z,
          10,
          4.6,
          8,
          glass,
          'facade',
        );
        if (row < 2) {
          planting(`Hall court ${row + 1} ${side}`, x, z - 15, 35, 5, 0, 45);
          for (let i = 0; i < 3; i++) tree(x - 12 + i * 12, z - 15, 0, 0.7);
        }
      }
    box('Lantern spine warm interior', 0, 2.5, 0, 10, 5, 80, glow, 'facade');
    box('Lantern spine roof', 0, 5.8, 0, 16, 0.4, 83, silver, 'roof');
    for (const side of [-1, 1]) {
      box(
        `Spine glazing ${side}`,
        side * 7.7,
        2.8,
        0,
        0.12,
        5.6,
        83,
        glass,
        'facade',
      );
      for (let z = -40; z <= 41; z += 1.6)
        instance(
          'Spine mullions',
          cube,
          timber,
          [side * 7.8, 2.8, z],
          [0.13, 5.6, 0.13],
          'facade',
        );
    }
    facade('Lantern entrance', 0, 41.6, 15.6, 5.6);
    box('Entrance canopy', 0, 6.1, 43, 20, 0.3, 7, silver, 'canopy');
  }
  // Shared scale cues: people, benches, bollards, truck docks and planting.
  for (let i = 0; i < 46; i++) {
    const x = (random() - 0.5) * 106,
      z = 45 + random() * 3;
    instance('People bodies', cylinder, dark, [x, 0.86, z], [0.2, 1.1, 0.2]);
    instance('People heads', sphere, stone, [x, 1.58, z], [0.17, 0.19, 0.17]);
  }
  for (let x = -45; x <= 45; x += 15) {
    box(
      `Promenade bench ${x}`,
      x,
      0.5,
      48,
      2.5,
      0.15,
      0.65,
      timber,
      'landscape',
    );
    instance(
      'Path bollards',
      cylinder,
      dark,
      [x + 4, 0.6, 48],
      [0.1, 1.2, 0.1],
    );
  }
  for (let i = 0; i < 3; i++) {
    box(`Delivery trailer ${i}`, 59, 1.5, -25 + i * 10, 3, 3, 7, paving);
    box(`Delivery cab ${i}`, 59, 1.05, -20 + i * 10, 2.7, 2.1, 2, silver);
  }
  for (const [name, b] of batches) {
    const m = new THREE.InstancedMesh(
      b.geometry,
      b.material,
      b.matrices.length,
    );
    m.name = name;
    m.userData.feature = b.feature;
    b.matrices.forEach((matrix, i) => m.setMatrixAt(i, matrix));
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  root.userData.sculptRuntime = {
    parts: root.children.map((o) => o.name),
    approximate: true,
  };
  return root;
}
