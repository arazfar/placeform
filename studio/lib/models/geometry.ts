import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Feature } from '../spec';
export type P2 = [number, number];
export type P3 = [number, number, number];
export type Height = (x: number, z: number) => number;
export function seeded(seed = 84217) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function smoothContour(points: P2[], samples = 128): P2[] {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  return Array.from({ length: samples }, (_, i) => {
    const p = curve.getPoint(i / samples);
    return [p.x, p.z];
  });
}
export function inside(point: P2, polygon: P2[]) {
  let result = false;
  const [x, z] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[i],
      [bx, bz] = polygon[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      result = !result;
  }
  return result;
}
export function ellipse(
  x: number,
  z: number,
  rx: number,
  rz: number,
  angle = 0,
  n = 56,
): P2[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2,
      a = rx * Math.cos(t) * (1 + 0.075 * Math.sin(t)),
      b = rz * Math.sin(t) * (1 + 0.1 * Math.cos(t * 2));
    return [
      x + a * Math.cos(angle) - b * Math.sin(angle),
      z + a * Math.sin(angle) + b * Math.cos(angle),
    ];
  });
}
export function worldUV(g: THREE.BufferGeometry, scale = 1) {
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal'),
    uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)),
      ny = Math.abs(n.getY(i)),
      nz = Math.abs(n.getZ(i));
    uv[i * 2] = (nx > ny && nx > nz ? p.getZ(i) : p.getX(i)) / scale;
    uv[i * 2 + 1] = (ny >= nx && ny >= nz ? p.getZ(i) : p.getY(i)) / scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function improveTriangles(points: P2[], faces: number[][], passes = 12) {
  const cross = (a: number, b: number, c: number) =>
    (points[b][0] - points[a][0]) * (points[c][1] - points[a][1]) -
    (points[b][1] - points[a][1]) * (points[c][0] - points[a][0]);
  const q = (a: number, b: number, c: number) => {
    const d = (i: number, j: number) =>
      (points[i][0] - points[j][0]) ** 2 + (points[i][1] - points[j][1]) ** 2;
    return Math.abs(cross(a, b, c)) / Math.max(d(a, b), d(b, c), d(c, a));
  };
  for (let pass = 0; pass < passes; pass++) {
    const edges = new Map<string, { a: number; b: number; faces: number[] }>();
    faces.forEach((f, fi) => {
      for (let i = 0; i < 3; i++) {
        const a = f[i],
          b = f[(i + 1) % 3],
          key = a < b ? `${a}:${b}` : `${b}:${a}`,
          e = edges.get(key);
        if (e) e.faces.push(fi);
        else edges.set(key, { a, b, faces: [fi] });
      }
    });
    const touched = new Set<number>();
    let changes = 0;
    for (const { a, b, faces: incident } of edges.values()) {
      if (incident.length !== 2 || incident.some((f) => touched.has(f)))
        continue;
      const [i, j] = incident,
        c = faces[i].find((v) => v !== a && v !== b)!,
        d = faces[j].find((v) => v !== a && v !== b)!;
      if (
        cross(a, b, c) * cross(a, b, d) >= -1e-12 ||
        cross(c, d, a) * cross(c, d, b) >= -1e-12
      )
        continue;
      const old = Math.min(q(a, b, c), q(a, b, d)),
        next = Math.min(q(c, d, a), q(c, d, b));
      if (next <= old + 1e-7) continue;
      faces[i] = [c, d, a];
      faces[j] = [d, c, b];
      touched.add(i);
      touched.add(j);
      changes++;
    }
    if (!changes) break;
  }
}
/** Boundary-constrained adaptive tessellation with edge quality improvement between splits. */
function triangulate(outer: P2[], holes: P2[][], maxEdge: number) {
  const points = [...outer, ...holes.flat()].map((p) => [...p] as P2);
  let faces = THREE.ShapeUtils.triangulateShape(
    outer.map((p) => new THREE.Vector2(...p)),
    holes.map((h) => h.map((p) => new THREE.Vector2(...p))),
  );
  improveTriangles(points, faces, 24);
  for (let pass = 0; pass < 13; pass++) {
    const split = new Map<string, number>();
    for (const f of faces)
      for (let i = 0; i < 3; i++) {
        const a = f[i],
          b = f[(i + 1) % 3],
          pa = points[a],
          pb = points[b];
        if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > maxEdge) {
          const k = a < b ? `${a}:${b}` : `${b}:${a}`;
          if (!split.has(k)) {
            split.set(k, points.length);
            points.push([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]);
          }
        }
      }
    if (!split.size) break;
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const mid = (u: number, v: number) =>
        split.get(u < v ? `${u}:${v}` : `${v}:${u}`);
      const ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      if (ab !== undefined && bc !== undefined && ca !== undefined)
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      else if (ab !== undefined && bc !== undefined)
        next.push([b, bc, ab], [a, ab, c], [ab, bc, c]);
      else if (bc !== undefined && ca !== undefined)
        next.push([c, ca, bc], [b, bc, a], [bc, ca, a]);
      else if (ca !== undefined && ab !== undefined)
        next.push([a, ab, ca], [c, ca, b], [ca, ab, b]);
      else if (ab !== undefined) next.push([a, ab, c], [ab, b, c]);
      else if (bc !== undefined) next.push([b, bc, a], [bc, c, a]);
      else if (ca !== undefined) next.push([c, ca, b], [ca, a, b]);
      else next.push([a, b, c]);
    }
    faces = next;
    improveTriangles(points, faces, 16);
  }
  improveTriangles(points, faces, 32);
  return { points, faces };
}
/** One closed shell, with independent top / underside / perimeter material groups and UVs. */
export function roofShell(
  outer: P2[],
  holes: P2[][],
  height: Height,
  thickness = 0.32,
  maxEdge = 2.4,
) {
  const { points, faces } = triangulate(outer, holes, maxEdge);
  return tessellatedShell(points, faces, holes, height, thickness);
}
export function ribbonShell(
  front: P2[],
  rear: P2[],
  height: Height,
  thickness = 0.36,
) {
  const points: P2[] = [],
    faces: number[][] = [],
    cols = front.length,
    rows = 16;
  for (let v = 0; v <= rows; v++)
    for (let u = 0; u < cols; u++)
      points.push([
        THREE.MathUtils.lerp(front[u][0], rear[u][0], v / rows),
        THREE.MathUtils.lerp(front[u][1], rear[u][1], v / rows),
      ]);
  for (let v = 0; v < rows; v++)
    for (let u = 0; u < cols - 1; u++) {
      const a = v * cols + u,
        b = a + 1,
        c = a + cols,
        d = c + 1;
      faces.push([a, b, c], [b, d, c]);
    }
  return tessellatedShell(points, faces, [], height, thickness);
}
function tessellatedShell(
  points: P2[],
  faces: number[][],
  holes: P2[][],
  height: Height,
  thickness: number,
) {
  const N = points.length;
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (let layer = 0; layer < 2; layer++)
    for (const [x, z] of points) {
      pos.push(x, height(x, z) - layer * thickness, z);
      uv.push(x, z);
    }
  for (const [a, b, c] of faces) {
    const p = points[a],
      q = points[b],
      r = points[c],
      positive = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    idx.push(a, positive > 0 ? c : b, positive > 0 ? b : c);
  }
  const topCount = idx.length;
  for (let i = 0; i < topCount; i += 3)
    idx.push(idx[i] + N, idx[i + 2] + N, idx[i + 1] + N);
  // The refined top boundary is extracted from face incidence, including inserted vertices.
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < topCount; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = idx[i + j],
        b = idx[i + ((j + 1) % 3)],
        k = a < b ? `${a}:${b}` : `${b}:${a}`;
      const e = edges.get(k);
      if (e) e.count++;
      else edges.set(k, { a, b, count: 1 });
    }
  for (const e of edges.values())
    if (e.count === 1) {
      const { a, b } = e;
      const start = pos.length / 3;
      for (const v of [a, b, b + N, a + N])
        pos.push(...pos.slice(v * 3, v * 3 + 3));
      const len = Math.hypot(
        points[a][0] - points[b][0],
        points[a][1] - points[b][1],
      );
      uv.push(0, thickness, len, thickness, len, 0, 0, 0);
      idx.push(start, start + 2, start + 1, start, start + 3, start + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, topCount, 0);
  g.addGroup(topCount, topCount, 1);
  g.addGroup(topCount * 2, idx.length - topCount * 2, 2);
  g.computeVertexNormals();
  const normals = g.getAttribute('normal');
  for (let i = 0; i < N; i++) {
    const [x, z] = points[i],
      eps = 0.015;
    const normal = new THREE.Vector3(
      -(height(x + eps, z) - height(x - eps, z)) / (2 * eps),
      1,
      -(height(x, z + eps) - height(x, z - eps)) / (2 * eps),
    ).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
    normals.setXYZ(i + N, -normal.x, -normal.y, -normal.z);
  }
  g.userData = {
    closedShell: true,
    thickness,
    topCount,
    holes: holes.map((h) => h.map((p) => [...p])),
  };
  return g;
}
/** Piecewise-linear roof height, so facade heads and seams meet the actual exported mesh. */
export function roofSampler(g: THREE.BufferGeometry, fallback: Height): Height {
  const p = g.getAttribute('position'),
    index = g.getIndex()!,
    cells = new Map<string, number[]>(),
    cell = 2;
  for (let i = 0; i < g.userData.topCount; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)],
      xs = ids.map((id) => p.getX(id)),
      zs = ids.map((id) => p.getZ(id));
    for (
      let x = Math.floor(Math.min(...xs) / cell);
      x <= Math.floor(Math.max(...xs) / cell);
      x++
    )
      for (
        let z = Math.floor(Math.min(...zs) / cell);
        z <= Math.floor(Math.max(...zs) / cell);
        z++
      ) {
        const key = `${x}:${z}`,
          list = cells.get(key) || [];
        list.push(i);
        cells.set(key, list);
      }
  }
  return (x, z) => {
    const faces =
      cells.get(`${Math.floor(x / cell)}:${Math.floor(z / cell)}`) || [];
    let nearest = Infinity,
      best = fallback(x, z);
    for (const i of faces) {
      const a = index.getX(i),
        b = index.getX(i + 1),
        c = index.getX(i + 2),
        ax = p.getX(a),
        az = p.getZ(a),
        bx = p.getX(b),
        bz = p.getZ(b),
        cx = p.getX(c),
        cz = p.getZ(c),
        den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-10) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den,
        v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den,
        w = 1 - u - v,
        penalty = Math.max(0, -u, -v, -w),
        y = u * p.getY(a) + v * p.getY(b) + w * p.getY(c);
      if (penalty < 1e-5) return y;
      if (penalty < nearest) {
        nearest = penalty;
        best = y;
      }
    }
    return nearest < 0.01 ? best : fallback(x, z);
  };
}
export class AssemblyBuilder {
  root = new THREE.Group();
  random = seeded();
  private solids = new Map<
    string,
    {
      parent: THREE.Group;
      mat: THREE.Material;
      feature: Feature;
      geometries: THREE.BufferGeometry[];
    }
  >();
  private instances = new Map<
    string,
    {
      parent: THREE.Group;
      mat: THREE.Material;
      feature: Feature;
      geo: THREE.BufferGeometry;
      matrices: THREE.Matrix4[];
      name: string;
    }
  >();
  cube = new THREE.BoxGeometry(1, 1, 1);
  crown = new THREE.IcosahedronGeometry(1, 1);
  foliage = new THREE.PlaneGeometry(1, 1);
  shrub = new THREE.IcosahedronGeometry(1, 0);
  cylinder = new THREE.CylinderGeometry(0.7, 1, 1, 7);
  part(name: string, feature: Feature = 'massing') {
    const g = new THREE.Group();
    g.name = name;
    g.userData = {
      partId: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      feature,
    };
    this.root.add(g);
    return g;
  }
  mesh(
    parent: THREE.Group,
    name: string,
    g: THREE.BufferGeometry,
    mat: THREE.Material | THREE.Material[],
    feature: Feature,
  ) {
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.userData = {
      feature,
      partId: parent.userData.partId,
      explodeWithParent: true,
    };
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  add(
    parent: THREE.Group,
    g: THREE.BufferGeometry,
    mat: THREE.Material,
    feature: Feature = 'massing',
  ) {
    const key = `${parent.uuid}:${mat.uuid}:${feature}`;
    let b = this.solids.get(key);
    if (!b) {
      b = { parent, mat, feature, geometries: [] };
      this.solids.set(key, b);
    }
    b.geometries.push(g);
  }
  box(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    feature: Feature = 'massing',
    angle = 0,
  ) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(angle);
    g.translate(x, y, z);
    this.add(parent, worldUV(g), mat, feature);
  }
  slab(
    parent: THREE.Group,
    outline: P2[],
    y: number,
    h: number,
    mat: THREE.Material,
    feature: Feature = 'massing',
  ) {
    const shape = new THREE.Shape(
      outline.map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: h,
      bevelEnabled: false,
      steps: 1,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    this.add(parent, worldUV(g), mat, feature);
  }
  instance(
    parent: THREE.Group,
    name: string,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    p: P3,
    s: P3,
    feature: Feature = 'landscape',
    rotation = new THREE.Euler(),
  ) {
    const key = `${parent.uuid}:${name}:${mat.uuid}`;
    let b = this.instances.get(key);
    if (!b) {
      b = { parent, name, geo, mat, feature, matrices: [] };
      this.instances.set(key, b);
    }
    b.matrices.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...p),
        new THREE.Quaternion().setFromEuler(rotation),
        new THREE.Vector3(...s),
      ),
    );
  }
  beam(
    parent: THREE.Group,
    a: P3,
    b: P3,
    width: number,
    mat: THREE.Material,
    feature: Feature = 'facade',
  ) {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      v = bv.clone().sub(av);
    const g = new THREE.CylinderGeometry(width, width, v.length(), 5, 1);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        v.normalize(),
      ),
    );
    g.translate(...av.add(bv).multiplyScalar(0.5).toArray());
    this.add(parent, g, mat, feature);
  }
  finish() {
    for (const b of this.solids.values()) {
      const converted = b.geometries.map((g) =>
        g.index ? g.toNonIndexed() : g,
      );
      const geo = mergeGeometries(converted, false)!;
      this.mesh(
        b.parent,
        `${b.parent.name} · ${b.feature} · ${b.mat.name}`,
        geo,
        b.mat,
        b.feature,
      );
      for (const g of new Set([...b.geometries, ...converted])) g.dispose();
    }
    for (const b of this.instances.values()) {
      const m = new THREE.InstancedMesh(b.geo, b.mat, b.matrices.length);
      m.name = `${b.parent.name} · ${b.name}`;
      m.userData = {
        feature: b.feature,
        partId: b.parent.userData.partId,
        explodeWithParent: true,
      };
      b.matrices.forEach((matrix, i) => m.setMatrixAt(i, matrix));
      m.castShadow = true;
      m.receiveShadow = true;
      m.computeBoundingBox();
      m.computeBoundingSphere();
      b.parent.add(m);
    }
    this.root.updateMatrixWorld(true);
    const parts = this.root.children.map((p) => {
      const bounds = new THREE.Box3().setFromObject(p),
        center = bounds.getCenter(new THREE.Vector3());
      p.userData.restPosition = p.position.toArray();
      p.userData.restTransform = {
        position: p.position.toArray(),
        quaternion: p.quaternion.toArray(),
        scale: p.scale.toArray(),
      };
      p.userData.center = center.toArray();
      return {
        id: p.userData.partId,
        name: p.name,
        center: center.toArray(),
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      };
    });
    const architecture = new THREE.Box3();
    for (const p of this.root.children)
      if (p.userData.feature !== 'landscape')
        architecture.union(new THREE.Box3().setFromObject(p));
    this.root.userData.sculptRuntime = {
      units: 'metres',
      front: '+Z',
      parts,
      architecturalBounds: {
        min: architecture.min.toArray(),
        max: architecture.max.toArray(),
      },
      approximate: true,
      picking: 'mesh.userData.feature; assembly partId',
      explosion: 'setExplode amount scales assembly layout about model center',
    };
    // Dispose unused prototypes; attached instance geometries are owned by the root.
    for (const g of [
      this.cube,
      this.crown,
      this.shrub,
      this.cylinder,
      this.foliage,
    ])
      if (![...this.instances.values()].some((b) => b.geo === g)) g.dispose();
    return this.root;
  }
}
export function setExplode(root: THREE.Group, amount: number) {
  const center = new THREE.Vector3();
  const bounds = root.userData.sculptRuntime?.architecturalBounds;
  if (bounds)
    center
      .addVectors(
        new THREE.Vector3(...bounds.min),
        new THREE.Vector3(...bounds.max),
      )
      .multiplyScalar(0.5);
  for (const part of root.children) {
    if (!part.userData.center) continue;
    part.position
      .fromArray(part.userData.restPosition)
      .add(
        new THREE.Vector3(...part.userData.center)
          .sub(center)
          .multiplyScalar(Math.max(0, Math.min(amount, 2))),
      );
  }
  root.updateMatrixWorld(true);
}
