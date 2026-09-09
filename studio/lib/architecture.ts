import * as THREE from 'three';

export type Recipe = 'A' | 'B' | 'C' | 'D';
export type ArchitectureSpec = {
  length: number;
  width: number;
  height: number;
  finDepth: number;
  finSpacing: number;
  canopyDepth: number;
  material: Recipe;
  roof: Recipe;
  landscape: Recipe;
  concept: Recipe;
  hour: number;
  directions?: { id: Recipe; colors: string[] }[];
};
type Feature = 'massing' | 'facade' | 'roof' | 'landscape' | 'canopy';
type Batch = {
  material: THREE.Material;
  feature: Feature;
  parts: THREE.BufferGeometry[];
};
const ownedMaterials = new WeakMap<THREE.Group, Set<THREE.Material>>();
const defaults: ArchitectureSpec = {
  length: 84,
  width: 44,
  height: 16,
  finDepth: 0.85,
  finSpacing: 3,
  canopyDepth: 4.5,
  material: 'A',
  roof: 'A',
  landscape: 'A',
  concept: 'A',
  hour: 15,
};
export type MassingBox = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
};
/** Shared plan/elevation source. X east/west, +Z south; bearing 90 needs no rotation.
 * Site boundary: x=±56.5, z=±45 at default dimensions; public context extends beyond.
 * h is the parapet datum. Use getRoofProfiles for exact roof/plant envelope heights. */
export function getMassing(
  input: Partial<ArchitectureSpec> = {},
): MassingBox[] {
  const s = { ...defaults, ...input },
    L = Math.max(30, s.length),
    W = Math.max(20, s.width),
    H = Math.max(8, s.height);
  return s.concept === 'C'
    ? [-1, 0, 1].map((i) => ({
        x: (i * L) / 3,
        z: 0,
        w: L / 3 - 3,
        d: W,
        h: H - 2.5,
      }))
    : s.concept === 'B'
      ? [
          { x: -L * 0.25, z: 1.5, w: L * 0.5, d: W - 3, h: H - 2 },
          { x: L * 0.25, z: 0, w: L * 0.5, d: W, h: H },
        ]
      : s.concept === 'D'
        ? [
            { x: -L * 0.35, z: 0, w: L * 0.3, d: W, h: H - 1.8 },
            { x: L * 0.35, z: 0, w: L * 0.3, d: W, h: H - 1.8 },
            { x: 0, z: -W * 0.24, w: L * 0.4, d: W * 0.52, h: H - 1.8 },
          ]
        : [{ x: 0, z: 0, w: L, d: W, h: H }];
}

/** Exact longitudinal section values, including slab and cap thickness.
 * Roof D ridges run along Z: its vertical glazing faces X, not geographic north.
 * C/D rear plant boxes can be partly concealed by their roof slopes. */
export function getRoofProfiles(input: Partial<ArchitectureSpec> = {}) {
  const s = { ...defaults, ...input };
  return getMassing(s).map((v) => {
    const gableRise = Math.min(3.2, v.w * 0.14),
      pitch = v.w / Math.max(2, Math.round(v.w / 8)),
      angle = Math.atan2(2.2, pitch * 0.86);
    const eave = v.h - 0.1,
      roofTop =
        s.roof === 'C'
          ? eave + gableRise + 0.19
          : s.roof === 'D'
            ? v.h + 2.2 + 0.08 * Math.cos(angle)
            : s.roof === 'A'
              ? v.h + 0.41
              : v.h - 0.03;
    const plantTop = v.h + (s.roof === 'A' ? 2.2 : s.roof === 'B' ? 2.8 : 2.15);
    return {
      ...v,
      recipe: s.roof,
      eave,
      ridge: s.roof === 'C' ? eave + gableRise : null,
      sawtoothPitch: s.roof === 'D' ? pitch : null,
      roofTop,
      plantTop,
      top: Math.max(roofTop, plantTop),
    };
  });
}

/** Approximate, art-directed exterior, not a surveyed model. Dimensions are metres.
 * Front is +Z. Geometry batches retain feature tags; dispose before replacing a model.
 * No external assets, global caches, renderer, lights or DOM nodes are retained. */
export function buildArchitecture(
  input: Partial<ArchitectureSpec> = {},
): THREE.Group {
  const s = { ...defaults, ...input },
    L = Math.max(30, s.length),
    W = Math.max(20, s.width);
  const root = new THREE.Group();
  root.name = 'Watt & Wonder architecture';
  root.userData.spec = { ...s };
  const resources = new Set<THREE.Material>();
  ownedMaterials.set(root, resources);
  const batches = new Map<string, Batch>();
  let seed = 14231;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const mat = (
    color: THREE.ColorRepresentation,
    roughness = 0.8,
    metalness = 0,
  ) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    resources.add(m);
    return m;
  };
  // Independent colour and roughness canvases; one texture spans 2.4 metres.
  function masonry(color: string, brick: boolean) {
    const m = mat('#ffffff', 0.88);
    m.userData.uvMetres = 2.4;
    if (typeof document === 'undefined') {
      m.color.set(color);
      return m;
    }
    const canvas = document.createElement('canvas'),
      rough = document.createElement('canvas'),
      height = document.createElement('canvas');
    canvas.width =
      canvas.height =
      rough.width =
      rough.height =
      height.width =
      height.height =
        512;
    const c = canvas.getContext('2d')!,
      r = rough.getContext('2d')!,
      b = height.getContext('2d')!,
      base = new THREE.Color(color);
    c.fillStyle = '#584d45';
    c.fillRect(0, 0, 512, 512);
    r.fillStyle = '#eeeeee';
    r.fillRect(0, 0, 512, 512);
    b.fillStyle = '#555555';
    b.fillRect(0, 0, 512, 512);
    const rows = brick ? 32 : 8,
      cols = brick ? 8 : 2;
    for (let y = 0; y < rows; y++)
      for (let x = -1; x < cols + 1; x++) {
        const px = ((x + (y % 2) * 0.5) * 512) / cols,
          py = (y * 512) / rows,
          v = 0.74 + random() * 0.42;
        c.fillStyle = base.clone().multiplyScalar(v).getStyle();
        c.fillRect(px + 1, py + 1, 512 / cols - 2, 512 / rows - 2);
        const q = Math.floor(194 + random() * 48);
        r.fillStyle = `rgb(${q},${q},${q})`;
        r.fillRect(px + 1, py + 1, 512 / cols - 2, 512 / rows - 2);
        b.fillStyle = '#c5c5c5';
        b.fillRect(px + 1.6, py + 1.6, 512 / cols - 3.2, 512 / rows - 3.2);
      }
    c.globalAlpha = 0.095;
    for (let i = 0; i < 13000; i++) {
      c.fillStyle = random() > 0.5 ? '#ffffff' : '#000000';
      c.fillRect(random() * 512, random() * 512, 1 + random() * 2, 1);
    }
    const map = new THREE.CanvasTexture(canvas),
      roughnessMap = new THREE.CanvasTexture(rough),
      bumpMap = new THREE.CanvasTexture(height);
    for (const t of [map, roughnessMap, bumpMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
    }
    map.colorSpace = THREE.SRGBColorSpace;
    m.map = map;
    m.roughnessMap = roughnessMap;
    m.bumpMap = bumpMap;
    m.bumpScale = brick ? 0.025 : 0.008;
    return m;
  }
  const palette = s.directions?.find((d) => d.id === s.material)?.colors;
  const brick = masonry(
      palette?.[0] || (s.material === 'D' ? '#393c3c' : '#925535'),
      true,
    ),
    concrete = masonry('#a2a199', false);
  const dark = mat(palette?.[2] || '#20292a', 0.61, 0.24),
    coping = mat('#454b48', 0.53, 0.42),
    copper = mat(palette?.[1] || '#9b6849', 0.46, 0.72),
    aluminum = mat(palette?.[0] || '#a5b0b1', 0.45, 0.75),
    timber = mat(palette?.[0] || '#865b39', 0.85);
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#243633',
    roughness: 0.16,
    metalness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const warm = new THREE.MeshStandardMaterial({
    color: '#b18b5b',
    roughness: 0.4,
    emissive: '#ba7741',
    emissiveIntensity: s.hour > 17 || s.hour < 8 ? 0.65 : 0.12,
  });
  resources.add(glass);
  resources.add(warm);
  const pavement = mat('#92958e', 0.83),
    asphalt = mat('#404748', 0.95),
    soil = mat('#343a2b', 1),
    trunk = mat('#5a4a37', 0.97),
    white = mat('#cccfc7', 0.74);
  const leafColors = {
    A: ['#68724a', '#818258', '#9b8750'],
    B: ['#4a695c', '#6c8063', '#88936b'],
    C: ['#365947', '#60794a', '#7d884b'],
    D: ['#5f7056', '#7d8867', '#8d916f'],
  }[s.landscape];
  const localPlanting = s.directions?.find((d) => d.id === s.landscape)
    ?.colors[3];
  if (localPlanting) {
    leafColors[0] = localPlanting;
    leafColors[1] =
      '#' + new THREE.Color(localPlanting).multiplyScalar(1.12).getHexString();
  }
  const leaves = leafColors.map((c) => mat(c, 1)),
    grass = mat(leafColors[1], 1),
    facade =
      s.material === 'B' ? aluminum : s.material === 'C' ? timber : brick;
  const people = [
    mat('#3b4140', 0.95),
    mat('#6b6658', 0.98),
    mat('#47515a', 0.94),
  ];
  for (const m of leaves) m.side = THREE.DoubleSide;
  grass.side = THREE.DoubleSide;
  function append(
    g: THREE.BufferGeometry,
    m: THREE.Material,
    feature: Feature,
    name: string,
    x: number,
    y: number,
    z: number,
    ry = 0,
    rz = 0,
  ) {
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    const key = name + ':' + m.uuid;
    if (!batches.has(key))
      batches.set(key, { material: m, feature, parts: [] });
    batches.get(key)!.parts.push(g);
  }
  function metreUv(g: THREE.BufferGeometry, m: THREE.Material) {
    const uv = g.getAttribute('uv'),
      scale = m.userData.uvMetres || 1;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) / scale, uv.getY(i) / scale);
    return g;
  }
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m: THREE.Material,
    f: Feature,
    name: string,
    ry = 0,
    rz = 0,
  ) {
    if (
      /^(Copper entrance canopy|Parapet cap|Plant screen top rails|Stone base course)$/.test(
        name,
      )
    ) {
      const r = Math.min(0.035, w * 0.1, h * 0.12, d * 0.12),
        sh = new THREE.Shape();
      sh.moveTo(-w / 2 + r, -h / 2 + r);
      sh.lineTo(w / 2 - r, -h / 2 + r);
      sh.lineTo(w / 2 - r, h / 2 - r);
      sh.lineTo(-w / 2 + r, h / 2 - r);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, {
        depth: d - 2 * r,
        bevelEnabled: true,
        bevelThickness: r,
        bevelSize: r,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 1,
      });
      g.translate(0, 0, -d / 2 + r);
      append(metreUv(g, m), m, f, name, x, y, z, ry, rz);
      return;
    }
    const g = new THREE.BoxGeometry(
        Math.max(0.01, w),
        Math.max(0.01, h),
        Math.max(0.01, d),
      ),
      uv = g.getAttribute('uv'),
      scale = m.userData.uvMetres || 1;
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4),
        u = face < 2 ? d : w,
        v = face === 2 || face === 3 ? d : h;
      uv.setXY(i, (uv.getX(i) * u) / scale, (uv.getY(i) * v) / scale);
    }
    append(g, m, f, name, x, y, z, ry, rz);
  }
  function cylinder(
    radius: number,
    height: number,
    x: number,
    y: number,
    z: number,
    m: THREE.Material,
    f: Feature,
    name: string,
  ) {
    append(
      new THREE.CylinderGeometry(radius * 0.82, radius, height, 8),
      m,
      f,
      name,
      x,
      y,
      z,
    );
  }
  function stem(
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    m: THREE.Material,
    name: string,
    top = 0.45,
  ) {
    const v = b.clone().sub(a),
      g = new THREE.CylinderGeometry(r * top, r, v.length(), 5);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        v.normalize(),
      ),
    );
    const p = a.clone().add(b).multiplyScalar(0.5);
    append(g, m, 'landscape', name, p.x, p.y, p.z);
  }
  function foliage(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    m: THREE.Material,
    name: string,
  ) {
    const g = new THREE.IcosahedronGeometry(1, 0),
      p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const q = 0.78 + random() * 0.35;
      p.setXYZ(i, p.getX(i) * sx * q, p.getY(i) * sy * q, p.getZ(i) * sz * q);
    }
    g.computeVertexNormals();
    append(g, m, 'landscape', name, x, y, z, random() * 6);
  }
  function blades(x: number, y: number, z: number, height: number) {
    const ps: number[] = [],
      uv: number[] = [];
    for (let i = 0; i < 7; i++) {
      const a = random() * Math.PI * 2,
        r = 0.035 + random() * 0.12,
        h = height * (0.5 + random() * 0.6),
        dx = Math.cos(a),
        dz = Math.sin(a),
        xx = x + dx * r,
        zz = z + dz * r;
      ps.push(
        xx - dz * 0.03,
        y,
        zz + dx * 0.03,
        xx + dz * 0.03,
        y,
        zz - dx * 0.03,
        xx + dx * 0.18,
        y + h,
        zz + dz * 0.18,
      );
      uv.push(0, 0, 1, 0, 0.5, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    append(g, grass, 'landscape', 'Meadow planting', 0, 0, 0);
  }
  function hedge(w: number, d: number, x: number, z: number, y = 0.32) {
    box(
      w,
      0.32,
      d,
      x,
      y - 0.13,
      z,
      concrete,
      'landscape',
      'Rain garden edging',
    );
    box(
      w - 0.2,
      0.13,
      d - 0.2,
      x,
      y + 0.09,
      z,
      soil,
      'landscape',
      'Rain garden soil',
    );
    const count = Math.ceil(w * d * 3.1);
    for (let i = 0; i < count; i++) {
      const xx = x + (random() - 0.5) * (w - 0.35),
        zz = z + (random() - 0.5) * (d - 0.35),
        hh = 0.25 + random() * 0.5;
      blades(xx, y + 0.16, zz, hh);
      if (i % 5 === 0)
        for (let j = 0; j < 3; j++)
          foliage(
            xx + (random() - 0.5) * 0.4,
            y + 0.3 + random() * 0.15,
            zz + (random() - 0.5) * 0.4,
            0.25,
            0.18,
            0.23,
            leaves[j % 3],
            'Low mixed shrubs',
          );
    }
  }
  function tree(x: number, z: number, size = 1) {
    const lean = (random() - 0.5) * 0.45,
      base = new THREE.Vector3(x, 0.3, z),
      fork = new THREE.Vector3(x + lean, 3.1 * size, z + lean * 0.4),
      tip = new THREE.Vector3(x + lean * 1.5, 6.8 * size, z - 0.2 * size);
    stem(base, fork, 0.105 * size, trunk, 'Street tree trunks', 0.64);
    stem(fork, tip, 0.067 * size, trunk, 'Street tree trunks', 0.14);
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39 + random() * 0.7,
        spread = (1.1 + random() * 0.9) * size,
        start = fork.clone().lerp(tip, 0.1 + i * 0.054),
        end = new THREE.Vector3(
          x + Math.cos(a) * spread + lean,
          (4.3 + i * 0.14 + random() * 0.6) * size,
          z + Math.sin(a) * spread,
        );
      stem(start, end, 0.032 * size, trunk, 'Street tree trunks', 0.2);
      for (let j = 0; j < 3; j++) {
        const e = end
          .clone()
          .add(
            new THREE.Vector3(
              (random() - 0.5) * 1.1 * size,
              (0.25 + random() * 0.6) * size,
              (random() - 0.5) * 1.1 * size,
            ),
          );
        stem(end, e, 0.011 * size, trunk, 'Street tree trunks', 0.08);
        for (let k = 0; k < 3; k++)
          foliage(
            e.x + (random() - 0.5) * 0.58 * size,
            e.y + (random() - 0.5) * 0.56 * size,
            e.z + (random() - 0.5) * 0.58 * size,
            (0.24 + random() * 0.16) * size,
            (0.27 + random() * 0.24) * size,
            (0.2 + random() * 0.14) * size,
            leaves[(i + j) % 3],
            'Street tree canopy',
          );
      }
    }
  }
  function person(x: number, z: number, index: number) {
    const m = people[index % 3],
      y = 0.11,
      lean = index % 2 ? 0.05 : -0.03;
    foliage(x, y + 1.59, z, 0.095, 0.13, 0.1, m, 'Human silhouettes');
    stem(
      new THREE.Vector3(x, y + 0.82, z),
      new THREE.Vector3(x + lean, y + 1.42, z),
      0.155,
      m,
      'Human silhouettes',
      0.78,
    );
    for (const sign of [-1, 1]) {
      stem(
        new THREE.Vector3(x + sign * 0.075, y + 0.84, z),
        new THREE.Vector3(x + sign * 0.1, y + 0.1, z + sign * 0.12),
        0.06,
        m,
        'Human silhouettes',
        0.65,
      );
      stem(
        new THREE.Vector3(x + sign * 0.16, y + 1.3, z),
        new THREE.Vector3(x + sign * 0.22, y + 0.86, z - sign * 0.08),
        0.042,
        m,
        'Human silhouettes',
        0.72,
      );
    }
  }
  // Each side is authored in frontage coordinates: u horizontal, v outward normal.
  function walls(cx: number, cz: number, w: number, d: number, h: number) {
    const ground = Math.min(4.3, Math.max(2.7, h * 0.4)),
      base = ground - 0.2,
      upper = h - ground,
      glazing = ground - 0.65,
      glassY = 0.525 + glazing / 2;
    box(
      w - 0.65,
      h - base,
      d - 0.65,
      cx,
      (h + base) / 2,
      cz,
      dark,
      'massing',
      'Enclosed data hall',
    );
    box(
      w - 0.9,
      base,
      d - 0.9,
      cx,
      base / 2 + 0.05,
      cz,
      dark,
      'massing',
      'Recessed ground floor',
    );
    for (let side = 0; side < 4; side++) {
      const horizontal = side < 2,
        span = horizontal ? w : d,
        offset = horizontal ? d / 2 : w / 2,
        sign = side === 0 || side === 2 ? 1 : -1,
        angle = horizontal ? 0 : Math.PI / 2;
      const p = (
        ww: number,
        hh: number,
        dd: number,
        u: number,
        y: number,
        v: number,
        m: THREE.Material,
        name: string,
      ) =>
        box(
          ww,
          hh,
          dd,
          cx + (horizontal ? u : sign * (offset + v)),
          y,
          cz + (horizontal ? sign * (offset + v) : u),
          m,
          'facade',
          name,
          angle,
        );
      const bays = Math.max(3, Math.round(span / Math.max(1.8, s.finSpacing))),
        step = span / bays,
        rib = s.material === 'B' ? 0.17 : s.material === 'C' ? 0.19 : 0.46;
      p(span, 0.22, 0.62, 0, 0.25, 0, concrete, 'Stone base course');
      p(span, 0.3, 0.45, 0, ground, -0.13, coping, 'Continuous glazing head');
      p(span, 0.34, 0.56, 0, h - 0.2, 0, coping, 'Parapet cap');
      if (s.material === 'B') {
        p(
          span,
          upper * 0.35,
          0.4,
          0,
          ground + upper * 0.2,
          0.02,
          aluminum,
          'Lower aluminum ribbon',
        );
        p(
          span,
          upper * 0.35,
          0.5,
          0,
          h - upper * 0.19,
          0.02,
          aluminum,
          'Upper aluminum ribbon',
        );
        for (let yy = ground + 0.4; yy < h - 0.6; yy += 0.28)
          p(
            span,
            0.026,
            0.05,
            0,
            yy,
            0.29,
            coping,
            'Horizontal corrugation seams',
          );
      }
      for (let i = 0; i < bays; i++) {
        const u = -span / 2 + step * (i + 0.5),
          clear = step - rib;
        p(
          clear,
          glazing,
          0.09,
          u,
          glassY,
          -0.31,
          glass,
          'Recessed base glazing',
        );
        p(
          0.065,
          glazing + 0.01,
          0.16,
          u,
          glassY,
          -0.2,
          coping,
          'Glazing mullions',
        );
        p(clear, 0.08, 0.18, u, 0.53, -0.18, coping, 'Glazing sills');
        if (i % 4 === 2)
          p(
            clear * 0.7,
            glazing * 0.74,
            0.045,
            u,
            glassY - 0.2,
            -0.25,
            warm,
            'Lobby light panels',
          );
        if (s.material !== 'B') {
          p(
            clear,
            upper * 0.425,
            0.31,
            u,
            ground + 0.1 + upper * 0.2125,
            0.025,
            facade,
            'Masonry spandrels',
          );
          p(
            clear * 0.82,
            upper * 0.3,
            0.14,
            u,
            ground + upper * 0.645,
            -0.21,
            dark,
            'Upper ventilation recesses',
          );
          p(
            clear,
            upper * 0.19,
            0.34,
            u,
            h - 0.32 - upper * 0.095,
            0.025,
            facade,
            'Masonry head panels',
          );
          p(
            clear * 0.86,
            0.13,
            0.3,
            u,
            ground + upper * 0.487,
            0.01,
            coping,
            'Upper panel sills',
          );
          for (const sign of [-1, 1])
            p(
              0.09,
              upper * 0.308,
              0.3,
              u + sign * clear * 0.44,
              ground + upper * 0.645,
              -0.025,
              facade,
              'Masonry relief returns',
            );
          p(
            clear * 0.94,
            0.1,
            0.32,
            u,
            ground + upper * 0.802,
            -0.01,
            facade,
            'Masonry relief returns',
          );
          p(
            clear,
            0.09,
            0.2,
            u,
            ground + upper * 0.405,
            0.17,
            facade,
            'Masonry relief returns',
          );
          for (let j = 0; j < 5; j++)
            p(
              0.045,
              upper * 0.3,
              0.12,
              u - clear * 0.35 + j * clear * 0.175,
              ground + upper * 0.645,
              -0.09,
              coping,
              'Upper ventilation blades',
            );
        }
      }
      for (let i = 0; i <= bays; i++) {
        const u = -span / 2 + step * i;
        p(
          rib,
          h - 0.38,
          Math.max(0.2, s.finDepth),
          u,
          h / 2 + 0.05,
          s.finDepth * 0.32,
          facade,
          'Deep facade piers',
        );
        if (s.material === 'A' || s.material === 'D') {
          p(
            rib + 0.11,
            0.14,
            s.finDepth + 0.09,
            u,
            h - 0.49,
            s.finDepth * 0.32,
            facade,
            'Masonry relief returns',
          );
          p(
            0.09,
            upper - 0.5,
            0.19,
            u + rib * 0.6,
            (h + ground - 0.05) / 2,
            s.finDepth * 0.29,
            facade,
            'Masonry relief returns',
          );
        }
      }
      if (s.material === 'C')
        for (let i = 0; i < bays * 3; i++)
          p(
            0.065,
            upper - 0.6,
            0.33,
            -span / 2 + ((i + 0.5) * span) / (bays * 3),
            (h + ground + 0.2) / 2,
            0.52,
            timber,
            'Timber screen slats',
          );
    }
  }
  const volumes = getMassing(s);
  function screen(
    x: number,
    z: number,
    w: number,
    d: number,
    y: number,
    h = 2.1,
  ) {
    box(w, h, d, x, y + h / 2, z, dark, 'roof', 'Enclosed rooftop plant');
    for (const sign of [-1, 1]) {
      for (let i = 0; i <= Math.floor(w / 0.45); i++)
        box(
          0.045,
          h,
          0.09,
          x - w / 2 + i * 0.45,
          y + h / 2,
          z + sign * (d / 2 + 0.05),
          aluminum,
          'roof',
          'Plant screen fins',
        );
      for (let i = 0; i <= Math.floor(d / 0.45); i++)
        box(
          0.09,
          h,
          0.045,
          x + sign * (w / 2 + 0.05),
          y + h / 2,
          z - d / 2 + i * 0.45,
          aluminum,
          'roof',
          'Plant screen fins',
        );
      box(
        w + 0.15,
        0.1,
        0.14,
        x,
        y + h,
        z + (sign * d) / 2,
        coping,
        'roof',
        'Plant screen top rails',
      );
    }
  }
  function gable(x: number, z: number, w: number, d: number, y: number) {
    const rise = Math.min(3.2, w * 0.14),
      a = Math.atan2(rise, w / 2),
      len = Math.hypot(w / 2, rise);
    for (const sign of [-1, 1])
      box(
        len + 0.18,
        0.2,
        d + 0.45,
        x + (sign * w) / 4,
        y + rise / 2,
        z,
        coping,
        'roof',
        'Standing seam pitched roof',
        0,
        -sign * a,
      );
    for (const sign of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2, 0);
      sh.lineTo(w / 2, 0);
      sh.lineTo(0, rise);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, {
        depth: 0.2,
        bevelEnabled: false,
      });
      append(
        metreUv(g, facade),
        facade,
        'roof',
        'Gable end tympanum',
        x,
        y,
        z + (sign * d) / 2 - (sign === 1 ? 0 : 0.2),
      );
    }
    box(
      0.14,
      0.14,
      d + 0.5,
      x,
      y + rise + 0.12,
      z,
      coping,
      'roof',
      'Ridge flashing',
    );
  }
  for (const v of volumes) {
    walls(v.x, v.z, v.w, v.d, v.h);
    box(v.w, 0.25, v.d, v.x, v.h - 0.25, v.z, coping, 'roof', 'Roof membrane');
    if (s.roof === 'C') gable(v.x, v.z, v.w, v.d, v.h - 0.1);
    else if (s.roof === 'D') {
      const n = Math.max(2, Math.round(v.w / 8)),
        pitch = v.w / n;
      for (let i = 0; i < n; i++) {
        const x = v.x - v.w / 2 + (i + 0.5) * pitch,
          a = Math.atan2(2.2, pitch * 0.86);
        box(
          Math.hypot(pitch * 0.86, 2.2),
          0.16,
          v.d - 3,
          x,
          v.h + 1.1,
          v.z,
          white,
          'roof',
          'Sawtooth opaque slopes',
          0,
          a,
        );
        box(
          0.15,
          2.2,
          v.d - 3,
          x + pitch * 0.43,
          v.h + 1.1,
          v.z,
          glass,
          'roof',
          'Sawtooth roof glazing',
        );
        for (const sign of [-1, 1]) {
          const sh = new THREE.Shape();
          sh.moveTo(-pitch * 0.43, 0);
          sh.lineTo(pitch * 0.43, 0);
          sh.lineTo(pitch * 0.43, 2.2);
          sh.closePath();
          append(
            new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }),
            white,
            'roof',
            'Sawtooth opaque slopes',
            x,
            v.h,
            v.z + (sign * (v.d - 3)) / 2 - (sign === 1 ? 0.12 : 0),
          );
        }
      }
    }
    if (s.roof === 'A' || s.roof === 'B')
      screen(
        v.x,
        v.z - v.d * 0.12,
        v.w * 0.64,
        Math.min(13, v.d * 0.38),
        v.h + 0.05,
        s.roof === 'B' ? 2.7 : 2.1,
      );
    if (s.roof === 'A') {
      for (const zz of [-v.d * 0.37, v.d * 0.37]) {
        box(
          v.w * 0.83,
          0.25,
          1.65,
          v.x,
          v.h + 0.12,
          v.z + zz,
          concrete,
          'roof',
          'Roof planting trays',
        );
        box(
          v.w * 0.81,
          0.2,
          1.48,
          v.x,
          v.h + 0.31,
          v.z + zz,
          grass,
          'roof',
          'Low roof meadow strips',
        );
      }
    }
    if (s.roof === 'C' || s.roof === 'D')
      screen(v.x, v.z - v.d * 0.24, Math.max(5, v.w * 0.42), 5, v.h + 0.2, 1.9);
  }
  const entryX = s.concept === 'D' ? 0 : Math.min(12, L * 0.2),
    entryZ = s.concept === 'D' ? W * 0.02 : W / 2,
    cd = Math.max(1.5, s.canopyDepth),
    cw = s.concept === 'D' ? 14 : 11;
  box(
    cw + 0.6,
    0.72,
    cd,
    entryX,
    4.65,
    entryZ + cd / 2,
    copper,
    'canopy',
    'Copper entrance canopy',
  );
  box(
    cw,
    0.13,
    cd - 0.28,
    entryX,
    4.25,
    entryZ + cd / 2,
    dark,
    'canopy',
    'Recessed canopy soffit',
  );
  for (const sign of [-1, 1]) {
    box(
      0.13,
      4.08,
      0.13,
      entryX + sign * (cw / 2 - 0.25),
      2.1,
      entryZ + cd - 0.3,
      coping,
      'canopy',
      'Canopy columns',
    );
    box(
      0.18,
      4.1,
      0.18,
      entryX + sign * 2.15,
      2.1,
      entryZ + 0.14,
      copper,
      'canopy',
      'Entrance bronze jambs',
    );
  }
  box(
    4.1,
    3.85,
    0.11,
    entryX,
    2.12,
    entryZ + 0.01,
    glass,
    'canopy',
    'Entrance glazed doors',
  );
  box(
    0.085,
    3.85,
    0.17,
    entryX,
    2.12,
    entryZ + 0.11,
    copper,
    'canopy',
    'Entrance door stile',
  );
  for (const dx of [-0.24, 0.24])
    box(
      0.045,
      0.7,
      0.07,
      entryX + dx,
      1.4,
      entryZ + 0.22,
      aluminum,
      'canopy',
      'Door pull handles',
    );
  for (const dx of [-3, 0, 3])
    box(
      1.4,
      0.03,
      0.17,
      entryX + dx,
      4.17,
      entryZ + cd * 0.6,
      warm,
      'canopy',
      'Canopy downlights',
    );
  box(
    cw + 3,
    0.18,
    cd + 4,
    entryX,
    0.12,
    entryZ + (cd + 3) / 2,
    pavement,
    'landscape',
    'Entrance paving apron',
  );
  // A complete street block, with planted edges and visible rear operations.
  box(150, 0.4, 115, 0, -0.31, 3, pavement, 'landscape', 'Urban ground');
  box(
    150,
    0.08,
    13,
    0,
    -0.065,
    W / 2 + 17,
    asphalt,
    'landscape',
    'Wet street surface',
  );
  box(
    L + 19,
    0.2,
    W + 21,
    0,
    -0.01,
    -2,
    pavement,
    'landscape',
    'Site paving platform',
  );
  for (const sign of [-1, 1])
    box(
      150,
      0.18,
      0.2,
      0,
      0.03,
      W / 2 + 17 + sign * 6.5,
      concrete,
      'landscape',
      'Street curb',
    );
  for (let x = -72; x < 73; x += 9)
    box(
      3,
      0.008,
      0.12,
      x,
      -0.018,
      W / 2 + 17,
      white,
      'landscape',
      'Street dashed markings',
    );
  for (let x = -L / 2 - 5; x <= L / 2 + 5; x += 3)
    box(
      0.018,
      0.013,
      8,
      x,
      0.103,
      W / 2 + 6,
      dark,
      'landscape',
      'Paving expansion joints',
    );
  for (let x = -L / 2 + 3; x < L / 2; x += 8) {
    if (Math.abs(x - entryX) < cw * 0.65) continue;
    hedge(6.7, 2.05, x, W / 2 + 7.6);
    tree(
      x + (random() - 0.5) * 1.4,
      W / 2 + 7.6 + (random() - 0.5) * 0.5,
      0.76 + random() * 0.4,
    );
    for (let i = 0; i < 4; i++)
      box(
        1.7,
        0.055,
        0.095,
        x - 2,
        0.56,
        W / 2 + 4.82 + i * 0.11,
        timber,
        'landscape',
        'Street benches',
      );
    for (const xx of [-0.62, 0.62]) {
      box(
        0.045,
        0.42,
        0.37,
        x - 2 + xx,
        0.32,
        W / 2 + 5,
        dark,
        'landscape',
        'Bench legs',
      );
      box(
        0.045,
        0.09,
        0.42,
        x - 2 + xx,
        0.49,
        W / 2 + 5,
        dark,
        'landscape',
        'Bench legs',
      );
    }
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.3, 0, 0),
      new THREE.Vector3(-0.3, 0.55, 0),
      new THREE.Vector3(-0.24, 0.76, 0),
      new THREE.Vector3(0, 0.8, 0),
      new THREE.Vector3(0.24, 0.76, 0),
      new THREE.Vector3(0.3, 0.55, 0),
      new THREE.Vector3(0.3, 0, 0),
    ]);
    for (const dx of [1.7, 2.65])
      append(
        new THREE.TubeGeometry(curve, 14, 0.027, 5, false),
        coping,
        'landscape',
        'Cycle parking hoops',
        x + dx,
        0.12,
        W / 2 + 4.9,
        Math.PI / 2,
      );
  }
  for (const sign of [-1, 1])
    for (let z = -W / 2 + 4; z < W / 2; z += 10) {
      hedge(2.2, 6, sign * (L / 2 + 5), z);
      tree(
        sign * (L / 2 + 5) + (random() - 0.5) * 0.4,
        z + (random() - 0.5) * 1.1,
        0.78 + random() * 0.35,
      );
    }
  for (let i = 0; i < 7; i++)
    person(
      i < 3 ? entryX - 2 + i * 1.4 : -L * 0.36 + (i - 3) * L * 0.22,
      i < 3 ? entryZ + 3.3 + i * 0.3 : W / 2 + 4.6 + (i % 2) * 0.7,
      i,
    );
  if (s.concept === 'C')
    for (const x of [-L / 6, L / 6]) {
      hedge(2.3, W * 0.72, x, 0);
      tree(x, W * 0.29, 0.85);
    }
  if (s.concept === 'D') {
    hedge(L * 0.19, 7, -L * 0.1, W * 0.2);
    hedge(L * 0.13, 7, L * 0.12, W * 0.2);
    tree(-L * 0.15, W * 0.2, 1.05);
  }
  const rear = -W / 2 - 8.2;
  box(
    L + 6,
    0.12,
    13,
    0,
    0.04,
    rear,
    asphalt,
    'landscape',
    'Rear service court',
  );
  function fence(x: number, z: number, length: number, rotate = false) {
    const y = 1.32;
    box(
      length,
      0.08,
      0.08,
      x,
      2.55,
      z,
      coping,
      'landscape',
      'Security fence top rail',
      rotate ? Math.PI / 2 : 0,
    );
    for (let i = 0; i <= Math.round(length / 0.28); i++) {
      const u = -length / 2 + (i * length) / Math.round(length / 0.28);
      box(
        0.045,
        2.5,
        0.045,
        x + (rotate ? 0 : u),
        y,
        z + (rotate ? u : 0),
        dark,
        'landscape',
        'Security palisade fence',
      );
    }
    for (let i = 0; i <= Math.ceil(length / 3); i++) {
      const u = -length / 2 + (i * length) / Math.ceil(length / 3);
      box(
        0.09,
        2.7,
        0.09,
        x + (rotate ? 0 : u),
        1.4,
        z + (rotate ? u : 0),
        coping,
        'landscape',
        'Security fence posts',
      );
    }
  }
  fence(0, rear - 6, L + 10);
  for (const sign of [-1, 1]) fence(sign * (L / 2 + 5), -W / 2 - 3, 18, true);
  for (let i = 0; i < 4; i++) {
    const x = -L * 0.33 + i * 7.4;
    box(
      5.7,
      0.18,
      3.5,
      x,
      0.2,
      rear,
      concrete,
      'massing',
      'Service equipment pads',
    );
    box(
      4.8,
      2.45,
      2.5,
      x,
      1.52,
      rear,
      dark,
      'massing',
      'Enclosed backup generator',
    );
    for (let j = 0; j < 12; j++)
      box(
        0.05,
        1.5,
        0.07,
        x - 2.05 + j * 0.37,
        1.6,
        rear + 1.29,
        coping,
        'massing',
        'Generator cooling louvers',
      );
    cylinder(
      0.12,
      1.1,
      x + 1.3,
      3.25,
      rear,
      coping,
      'massing',
      'Generator exhaust',
    );
  }
  for (let i = 0; i < 3; i++) {
    const x = L * 0.24 + i * 3;
    box(
      2.1,
      2,
      1.6,
      x,
      1.16,
      rear,
      mat('#66736d', 0.73, 0.15),
      'massing',
      'Transformer cabinets',
    );
    box(0.8, 0.13, 1, x, 2.26, rear, coping, 'massing', 'Transformer caps');
  }
  for (const x of [-L * 0.39, L * 0.36]) {
    box(
      4,
      4.3,
      0.14,
      x,
      2.25,
      -W / 2 - 0.13,
      coping,
      'facade',
      'Rear loading doors',
    );
    for (let y = 0.6; y < 4.2; y += 0.27)
      box(
        3.85,
        0.035,
        0.07,
        x,
        y,
        -W / 2 - 0.24,
        dark,
        'facade',
        'Loading door joints',
      );
    for (const sign of [-1, 1])
      cylinder(
        0.09,
        1.2,
        x + sign * 2.5,
        0.7,
        -W / 2 - 1,
        copper,
        'landscape',
        'Service bollards',
      );
  }
  // Quiet neighboring warehouse silhouettes, kept outside the subject's footprint.
  for (const sign of [-1, 1]) {
    const x = sign * (L / 2 + 18),
      h = sign === 1 ? 7.2 : 8.8;
    box(
      17,
      h,
      30,
      x,
      h / 2,
      -9,
      concrete,
      'landscape',
      'Context warehouse volume',
    );
    box(
      17.5,
      0.3,
      30.5,
      x,
      h + 0.1,
      -9,
      coping,
      'landscape',
      'Context warehouse roof',
    );
    for (let i = 0; i < 5; i++) {
      box(
        2.1,
        3.5,
        0.06,
        x - 6 + i * 3,
        3.8,
        6.04,
        dark,
        'landscape',
        'Context warehouse windows',
      );
      box(
        0.06,
        3.5,
        0.07,
        x - 6 + i * 3,
        3.8,
        6.08,
        coping,
        'landscape',
        'Context warehouse mullions',
      );
    }
  }
  // Merge by named semantic feature + material, preserving correct normals and metre UVs.
  for (const [name, batch] of batches) {
    const ps: number[] = [],
      ns: number[] = [],
      us: number[] = [],
      indices: number[] = [];
    let offset = 0;
    for (const g of batch.parts) {
      const p = g.getAttribute('position'),
        n = g.getAttribute('normal'),
        u = g.getAttribute('uv');
      for (let i = 0; i < p.count; i++) {
        ps.push(p.getX(i), p.getY(i), p.getZ(i));
        ns.push(n.getX(i), n.getY(i), n.getZ(i));
        us.push(u?.getX(i) || 0, u?.getY(i) || 0);
      }
      if (g.index)
        for (let i = 0; i < g.index.count; i++)
          indices.push(g.index.getX(i) + offset);
      else for (let i = 0; i < p.count; i++) indices.push(i + offset);
      offset += p.count;
      g.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(ns, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(us, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.name = name.split(':')[0];
    mesh.userData.feature = batch.feature;
    mesh.userData.context =
      /^(Context warehouse|Urban ground|Wet street|Street curb|Street dashed)/.test(
        mesh.name,
      );
    mesh.userData.explodeWithParent = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  root.userData.sculptRuntime = {
    units: 'metres',
    front: '+Z south',
    east: '+X',
    siteBoundary: { width: 113, depth: 90 },
    massing: volumes,
    roofProfiles: getRoofProfiles(s),
    picking: 'mesh.userData.feature',
    approximation:
      'Single-view reference; rear and concealed equipment are schematic.',
  };
  return root;
}

export function disposeArchitecture(root: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = ownedMaterials.get(root) || new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  for (const m of materials) {
    for (const value of Object.values(m))
      if (value instanceof THREE.Texture) textures.add(value);
    m.dispose();
  }
  for (const t of textures) t.dispose();
  for (const g of geometries) g.dispose();
  ownedMaterials.delete(root);
  root.clear();
}
