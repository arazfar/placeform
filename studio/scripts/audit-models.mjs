/** Independent integration audit. Writes QA evidence under outputs/model-package/qa. */
import * as THREE from 'three';
import { buildDemoModel, setExplode } from '../lib/demo-models';
import { disposeArchitecture } from '../lib/architecture';
import {
  terraces,
  halls,
  pavilions,
  ribbons,
  duneCourts,
  duneHeight,
  ribbonSurface,
} from '../lib/models/reference-data';
import { roofSampler } from '../lib/models/geometry';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const DIR = 'outputs/model-package/qa',
  PROJECT = process.cwd();
mkdirSync(DIR, { recursive: true });
const sourceNames = [
  'lib/demo-models.ts',
  'lib/models/geometry.ts',
  'lib/models/reference-data.ts',
  'lib/models/details.ts',
  'lib/models/materials.ts',
  'lib/models/textures.ts',
  'lib/models/landscape.ts',
  'lib/architecture.ts',
];
const sha = (data) => createHash('sha256').update(data).digest('hex');
const sourceHashes = () =>
  Object.fromEntries(
    sourceNames.map((path) => [path, sha(readFileSync(PROJECT + '/' + path))]),
  );
const report = {
  createdAt: new Date().toISOString(),
  sourceHashes: sourceHashes(),
  method:
    'Actual buildDemoModel A/B/C/D, no document/canvas/WebGL mock; all geometry and owned-resource events are inspected. Shape shell thickness means project-authored vertical separation, not normal-offset physical thickness.',
  checks: [],
  models: [],
  shells: [],
  courtyards: [],
  disposal: [],
  warnings: [],
};
function check(model, name, condition, evidence) {
  report.checks.push({ model, name, passed: condition, evidence });
}
function allMeshes(root) {
  const out = [];
  root.traverse((o) => {
    if (o.isMesh) out.push(o);
  });
  return out;
}
function textureSet(materials) {
  const textures = new Set();
  for (const m of materials)
    for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
  return textures;
}
function resources(root) {
  const meshes = allMeshes(root),
    geometries = new Set(meshes.map((m) => m.geometry)),
    materials = new Set(
      meshes.flatMap((m) =>
        Array.isArray(m.material) ? m.material : [m.material],
      ),
    );
  return { geometries, materials, textures: textureSet(materials) };
}
function hashArray(h, array) {
  h.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
}
function fingerprint(root) {
  const h = createHash('sha256');
  root.traverse((o) => {
    h.update(
      JSON.stringify([
        o.name,
        o.type,
        o.userData.feature,
        o.userData.partId,
        o.position.toArray(),
        o.rotation.toArray(),
        o.scale.toArray(),
      ]),
    );
    if (o.isLight)
      h.update(
        JSON.stringify([o.color.toArray(), o.intensity, o.distance, o.decay]),
      );
    if (!o.isMesh) return;
    for (const [name, attr] of Object.entries(o.geometry.attributes).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      h.update(name);
      hashArray(h, attr.array);
    }
    if (o.geometry.index) hashArray(h, o.geometry.index.array);
    h.update(JSON.stringify(o.geometry.groups));
    if (o.isInstancedMesh) {
      h.update(String(o.count));
      hashArray(h, o.instanceMatrix.array);
      if (o.instanceColor) hashArray(h, o.instanceColor.array);
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      h.update(
        JSON.stringify([
          m.name,
          m.type,
          m.color?.toArray(),
          m.roughness,
          m.metalness,
          m.opacity,
          m.side,
          m.emissive?.toArray(),
          m.emissiveIntensity,
        ]),
      );
      for (const key of ['map', 'roughnessMap', 'normalMap', 'aoMap']) {
        const t = m[key];
        if (t) {
          h.update(
            JSON.stringify([
              key,
              t.name,
              t.colorSpace,
              t.wrapS,
              t.wrapT,
              t.image?.width,
              t.image?.height,
            ]),
          );
          if (t.image?.data) hashArray(h, t.image.data);
        }
      }
    }
  });
  return h.digest('hex');
}
function shellAudit(model, mesh) {
  const g = mesh.geometry,
    p = g.getAttribute('position'),
    normal = g.getAttribute('normal'),
    ix = g.getIndex(),
    topCount = g.userData.topCount;
  const shell = {
    model,
    name: mesh.name,
    triangles: ix.count / 3,
    vertices: p.count,
    topTriangles: topCount / 3,
    expectedThickness: g.userData.thickness,
  };
  const N = ix.getX(topCount) - ix.getX(0),
    keys = Array.from({ length: p.count }, (_, i) =>
      [p.getX(i), p.getY(i), p.getZ(i)]
        .map((v) => Math.round(v * 1e6))
        .join(','),
    ),
    edges = new Map();
  let windingTop = 0,
    windingUnder = 0,
    opposedNormals = 0,
    minimumAngle = 180,
    needle = 0,
    volume = 0,
    maxThicknessError = 0,
    maxThicknessXZError = 0;
  for (let i = 0; i < N; i++) {
    maxThicknessError = Math.max(
      maxThicknessError,
      Math.abs(p.getY(i) - p.getY(i + N) - g.userData.thickness),
    );
    maxThicknessXZError = Math.max(
      maxThicknessXZError,
      Math.abs(p.getX(i) - p.getX(i + N)),
      Math.abs(p.getZ(i) - p.getZ(i + N)),
    );
  }
  for (let i = 0; i < ix.count; i += 3) {
    const ids = [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)],
      [a, b, c] = ids.map((j) => new THREE.Vector3().fromBufferAttribute(p, j)),
      n = b.clone().sub(a).cross(c.clone().sub(a));
    volume += a.dot(b.clone().cross(c)) / 6;
    if (i < topCount && n.y <= 0) windingTop++;
    if (i >= topCount && i < 2 * topCount && n.y >= 0) windingUnder++;
    if (i < topCount) {
      const sn = ids.reduce(
        (a, j) => a.add(new THREE.Vector3().fromBufferAttribute(normal, j)),
        new THREE.Vector3(),
      );
      if (n.dot(sn) < -1e-10) opposedNormals++;
      const vs = [a, b, c],
        angle = Math.min(
          ...vs.map(
            (v, j) =>
              (vs[(j + 1) % 3]
                .clone()
                .sub(v)
                .angleTo(vs[(j + 2) % 3].clone().sub(v)) *
                180) /
              Math.PI,
          ),
        );
      minimumAngle = Math.min(minimumAngle, angle);
      if (angle < 1) needle++;
    }
    for (let e = 0; e < 3; e++) {
      const a = keys[ids[e]],
        b = keys[ids[(e + 1) % 3]],
        forward = a < b,
        key = forward ? a + '|' + b : b + '|' + a;
      const item = edges.get(key) || { count: 0, direction: 0 };
      item.count++;
      item.direction += forward ? 1 : -1;
      edges.set(key, item);
    }
  }
  const badEdges = [...edges.values()].filter((e) => e.count !== 2),
    wrongOrientation = [...edges.values()].filter(
      (e) => e.count === 2 && e.direction !== 0,
    );
  Object.assign(shell, {
    weldedNonmanifoldEdges: badEdges.length,
    weldedWindingErrors: wrongOrientation.length,
    reversedTopFaces: windingTop,
    reversedUndersideFaces: windingUnder,
    signedVolume: volume,
    maximumVerticalThicknessError: maxThicknessError,
    maximumPairedXZError: maxThicknessXZError,
    topFacesOpposingShadingNormals: opposedNormals,
    minimumTriangleAngleDegrees: minimumAngle,
    topTrianglesBelowOneDegree: needle,
  });
  report.shells.push(shell);
  check(
    model,
    mesh.name + ' closed welded topology',
    badEdges.length === 0 && wrongOrientation.length === 0,
    shell,
  );
  check(
    model,
    mesh.name + ' outward roof/underside winding',
    windingTop === 0 && windingUnder === 0 && volume > 0,
    { windingTop, windingUnder, volume },
  );
  check(
    model,
    mesh.name + ' uniform authored vertical thickness',
    maxThicknessError < 2e-5 && maxThicknessXZError < 1e-6,
    { maxThicknessError, maxThicknessXZError, N },
  );
  check(
    model,
    mesh.name + ' analytic shading normals agree with facets',
    opposedNormals === 0,
    { opposedNormals, needle, minimumAngle },
  );
  check(
    model,
    mesh.name + ' three contiguous material regions',
    g.groups.length === 3 &&
      g.groups[0].start === 0 &&
      g.groups[0].count === topCount &&
      g.groups[1].start === topCount &&
      g.groups[1].count === topCount &&
      g.groups[2].start === 2 * topCount &&
      g.groups.reduce((n, x) => n + x.count, 0) === ix.count,
    g.groups,
  );
}
function disposeAudit(model, root, label) {
  const r = resources(root),
    counts = new Map();
  for (const set of Object.values(r))
    for (const o of set) {
      counts.set(o, 0);
      o.addEventListener('dispose', () =>
        counts.set(o, (counts.get(o) || 0) + 1),
      );
    }
  disposeArchitecture(root);
  const missed = [...counts.values()].filter((n) => n === 0).length,
    duplicates = [...counts.values()].filter((n) => n !== 1).length;
  disposeArchitecture(root);
  const afterSecond = [...counts.values()].filter((n) => n !== 1).length;
  const result = {
    model,
    label,
    geometries: r.geometries.size,
    materials: r.materials.size,
    textures: r.textures.size,
    missed,
    duplicateOrMissingEvents: duplicates,
    eventsChangedBySecondDispose: afterSecond,
    childrenAfterDispose: root.children.length,
  };
  report.disposal.push(result);
  check(
    model,
    label + ' disposes every owned resource exactly once and clears hierarchy',
    missed === 0 &&
      duplicates === 0 &&
      afterSecond === 0 &&
      root.children.length === 0,
    result,
  );
}
for (const id of ['A', 'B', 'C', 'D']) {
  const started = performance.now(),
    root = buildDemoModel(id);
  root.updateMatrixWorld(true);
  const meshes = allMeshes(root),
    res = resources(root);
  let triangles = 0,
    groups = 0,
    estimatedCalls = 0,
    invalidIndices = 0,
    nonfinite = 0,
    degenerate = 0,
    nearDegenerate = 0,
    invalidNormals = 0,
    invalidInstanceMatrices = 0;
  const missingAttributes = [];
  const degenMeshes = [],
    features = new Set();
  for (const mesh of meshes) {
    const g = mesh.geometry,
      p = g.getAttribute('position'),
      ix = g.getIndex(),
      n = g.getAttribute('normal'),
      uv = g.getAttribute('uv'),
      count = ix ? ix.count : p.count;
    features.add(mesh.userData.feature);
    if (!p || !n || !uv) missingAttributes.push(mesh.name);
    for (const a of Object.values(g.attributes))
      for (const v of a.array) if (!Number.isFinite(v)) nonfinite++;
    if (n)
      for (let i = 0; i < n.count; i++) {
        const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
        if (l < 0.98 || l > 1.02) invalidNormals++;
      }
    let localDegen = 0;
    for (let i = 0; i < count; i += 3) {
      const ids = ix
        ? [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)]
        : [i, i + 1, i + 2];
      if (ids.some((j) => !Number.isInteger(j) || j < 0 || j >= p.count)) {
        invalidIndices++;
        continue;
      }
      const [a, b, c] = ids.map((j) =>
          new THREE.Vector3().fromBufferAttribute(p, j),
        ),
        area2 = b.sub(a).cross(c.sub(a)).length();
      if (area2 === 0) {
        degenerate++;
        localDegen++;
      } else if (area2 < 1e-10) nearDegenerate++;
    }
    if (localDegen) degenMeshes.push({ mesh: mesh.name, count: localDegen });
    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(i, matrix);
        if (
          !matrix.elements.every(Number.isFinite) ||
          matrix.determinant() <= 0
        )
          invalidInstanceMatrices++;
      }
    }
    const effectiveGroups = Array.isArray(mesh.material)
      ? g.groups
      : [{ materialIndex: 0 }];
    groups += effectiveGroups.length;
    for (const group of effectiveGroups) {
      const mat = Array.isArray(mesh.material)
        ? mesh.material[group.materialIndex]
        : mesh.material;
      estimatedCalls +=
        mat.transparent && mat.side === THREE.DoubleSide && !mat.forceSinglePass
          ? 2
          : 1;
    }
    triangles += (count / 3) * (mesh.isInstancedMesh ? mesh.count : 1);
    if (g.userData.closedShell) shellAudit(id, mesh);
  }
  const bounds = root.userData.sculptRuntime.architecturalBounds,
    size = bounds.max.map((x, i) => x - bounds.min[i]);
  const result = {
    id,
    stage: root.userData.stage,
    buildMs: performance.now() - started,
    meshes: meshes.length,
    assemblies: root.children.length,
    triangles,
    materialGroupCalls: groups,
    estimatedMainPassCalls: estimatedCalls,
    nonfinite,
    invalidIndices,
    degenerate,
    nearDegenerate,
    invalidNormals,
    invalidInstanceMatrices,
    missingAttributes,
    degenMeshes,
    architecturalBounds: bounds,
    architecturalSize: size,
    features: [...features].sort((a, b) => a.localeCompare(b)),
    textureSizes: [
      ...new Set(
        [...res.textures].map((t) => `${t.image?.width}x${t.image?.height}`),
      ),
    ],
  };
  check(
    id,
    'finite position/normal/UV/other attributes and valid triangle indices',
    nonfinite === 0 && invalidIndices === 0 && missingAttributes.length === 0,
    { nonfinite, invalidIndices, missingAttributes },
  );
  check(
    id,
    'nondegenerate actual triangles',
    degenerate === 0 && nearDegenerate === 0,
    { degenerate, nearDegenerate, degenMeshes },
  );
  check(
    id,
    'normalized normals and nonsingular positive instance transforms',
    invalidNormals === 0 && invalidInstanceMatrices === 0,
    { invalidNormals, invalidInstanceMatrices },
  );
  check(
    id,
    'interactive complete-scene triangle and main-pass budgets',
    triangles <= 600000 && estimatedCalls <= 250,
    { triangles, estimatedCalls, materialGroupCalls: groups },
  );
  check(
    id,
    'measured architectural bounds fit nominal 112 x 84 m and 16 m height',
    size[0] <= 112.01 && size[2] <= 84.01 && bounds.max[1] <= 16.01,
    { bounds, size },
  );
  const parts = root.userData.sculptRuntime.parts,
    partIds = root.children.map((p) => p.userData.partId),
    missingParts = parts.filter(
      (p) => !root.children.some((child) => child.userData.partId === p.id),
    ),
    unownedMeshes = meshes.filter(
      (m) =>
        !m.name ||
        !m.userData.feature ||
        m.userData.partId !== m.parent.userData.partId ||
        m.userData.explodeWithParent !== true,
    );
  const expected =
    id === 'A'
      ? terraces.map((_, i) => `Terrace ${i + 1} sandstone and garden`)
      : id === 'B'
        ? ribbons.map((_, i) => `Ribbon ${i + 1} folded hall`)
        : id === 'C'
          ? [
              'Continuous dune roof and glazed halls',
              ...duneCourts.map((c) => `Garden court · ${c.id}`),
            ]
          : [
              ...halls.map((h) => `Technical hall ${h.id}`),
              ...pavilions.map((_, i) => `Lantern pavilion ${i + 1}`),
            ];
  const missingExpected = expected.filter(
    (name) => !root.children.some((p) => p.name === name),
  );
  check(
    id,
    'unique semantic parts cover geometry and expected authored assemblies',
    new Set(partIds).size === partIds.length &&
      missingParts.length === 0 &&
      unownedMeshes.length === 0 &&
      missingExpected.length === 0,
    {
      partCount: partIds.length,
      missingParts,
      unownedMeshes: unownedMeshes.map((m) => m.name),
      missingExpected,
    },
  );
  if (
    !root.userData.sculptRuntime.entrance &&
    !root.userData.sculptRuntime.entrances &&
    !root.userData.sculptRuntime.landmarks
  )
    report.warnings.push({
      id,
      issue:
        'Runtime metadata has no entrance landmarks; accepted plan requested entrance landmarks in addition to measured bounds and rest transforms.',
    });
  const centers = root.children.map((p) =>
      new THREE.Box3().setFromObject(p).getCenter(new THREE.Vector3()),
    ),
    worldBefore = root.children.map((p) => p.matrixWorld.clone()),
    localMeshBefore = meshes.map((m) => m.matrix.clone()),
    architectureCenter = new THREE.Vector3()
      .addVectors(
        new THREE.Vector3(...bounds.min),
        new THREE.Vector3(...bounds.max),
      )
      .multiplyScalar(0.5);
  setExplode(root, 1);
  let explodeError = 0;
  root.children.forEach((part, i) => {
    const center = new THREE.Box3()
        .setFromObject(part)
        .getCenter(new THREE.Vector3()),
      expected = centers[i]
        .clone()
        .add(centers[i].clone().sub(architectureCenter));
    explodeError = Math.max(explodeError, center.distanceTo(expected));
  });
  const childrenMovedLocally = meshes.some(
    (m, i) => !m.matrix.equals(localMeshBefore[i]),
  );
  setExplode(root, 0);
  const restorationError = root.children.reduce(
    (worst, p, i) =>
      Math.max(
        worst,
        ...p.matrixWorld.elements.map((v, j) =>
          Math.abs(v - worldBefore[i].elements[j]),
        ),
      ),
    0,
  );
  check(
    id,
    'exploded inspection expands assembly centers and restores exact rest transforms',
    explodeError < 1e-4 && restorationError < 1e-10 && !childrenMovedLocally,
    { explodeError, restorationError, childrenMovedLocally },
  );
  if (id === 'C') {
    const actualRoofMeshes = meshes.filter(
        (m) => m.userData.feature === 'roof',
      ),
      shell = actualRoofMeshes.find((m) => m.geometry.userData.closedShell),
      names = root.userData.reference.courtyards.map((c) => c.id);
    check(
      id,
      'runtime courtyard inventory matches shell holes and authored court IDs',
      names.length === duneCourts.length &&
        shell.geometry.userData.holes.length === duneCourts.length &&
        duneCourts.every((c) => names.includes(c.id)),
      {
        runtimeIds: names,
        shellHoleCount: shell.geometry.userData.holes.length,
      },
    );
    const ray = new THREE.Raycaster(
      new THREE.Vector3(),
      new THREE.Vector3(0, -1, 0),
    );
    for (const court of duneCourts) {
      const points = [
        court.center,
        ...[0.3, 0.65].flatMap((scale) =>
          court.outline
            .filter((_, i) => i % 8 === 0)
            .map(([x, z]) => [
              court.center[0] + (x - court.center[0]) * scale,
              court.center[1] + (z - court.center[1]) * scale,
            ]),
        ),
      ];
      const blocked = [];
      for (const [x, z] of points) {
        ray.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObjects(actualRoofMeshes);
        if (hits.length)
          blocked.push({ x, z, mesh: hits[0].object.name, y: hits[0].point.y });
      }
      const r = { id: court.id, samples: points.length, blocked };
      report.courtyards.push(r);
      check(
        id,
        court.id + ' roof opening unobstructed by roof or attached seams',
        blocked.length === 0,
        r,
      );
    }
    const g = shell.geometry,
      p = g.getAttribute('position'),
      ix = g.getIndex();
    const control = Array.from({ length: 3 }, (_, j) =>
      new THREE.Vector3().fromBufferAttribute(p, ix.getX(j)),
    )
      .reduce((a, b) => a.add(b), new THREE.Vector3())
      .multiplyScalar(1 / 3);
    ray.set(
      new THREE.Vector3(control.x, 40, control.z),
      new THREE.Vector3(0, -1, 0),
    );
    check(
      id,
      'courtyard ray positive control hits an actual roof triangle',
      ray.intersectObjects([shell]).length > 0,
      { control: control.toArray() },
    );
  }
  if (id === 'B' || id === 'C') {
    const shells = meshes.filter(
      (m) => m.geometry.userData.closedShell && m.userData.feature === 'roof',
    );
    const ray = new THREE.Raycaster(
      new THREE.Vector3(),
      new THREE.Vector3(0, -1, 0),
    );
    let maxError = 0,
      samples = 0,
      misses = 0;
    for (const [i, shell] of shells.entries()) {
      const fallback =
          id === 'B' ? ribbonSurface(ribbons[i]).height : duneHeight,
        sampler = roofSampler(shell.geometry, fallback),
        g = shell.geometry,
        p = g.getAttribute('position'),
        ix = g.getIndex();
      for (
        let j = 0;
        j < g.userData.topCount;
        j += Math.max(3, Math.floor(g.userData.topCount / 90 / 3) * 3)
      ) {
        const v = Array.from({ length: 3 }, (_, k) =>
          new THREE.Vector3().fromBufferAttribute(p, ix.getX(j + k)),
        )
          .reduce((a, b) => a.add(b), new THREE.Vector3())
          .multiplyScalar(1 / 3);
        ray.set(new THREE.Vector3(v.x, 40, v.z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(shell);
        if (!hits.length) {
          misses++;
          continue;
        }
        maxError = Math.max(
          maxError,
          Math.abs(sampler(v.x, v.z) - hits[0].point.y),
        );
        samples++;
      }
    }
    check(
      id,
      'current roofSampler agrees with actual shell ray heights',
      misses === 0 && maxError < 1e-4,
      { samples, misses, maxError },
    );
  }
  let aliasedMaps = 0,
    badColorSpaces = 0,
    unserializableTextures = 0;
  for (const mat of res.materials) {
    const maps = [mat.map, mat.roughnessMap, mat.normalMap, mat.aoMap].filter(
      Boolean,
    );
    if (new Set(maps).size !== maps.length) aliasedMaps++;
    if (mat.map && mat.map.colorSpace !== THREE.SRGBColorSpace)
      badColorSpaces++;
    for (const key of ['roughnessMap', 'normalMap', 'aoMap'])
      if (mat[key] && mat[key].colorSpace !== THREE.NoColorSpace)
        badColorSpaces++;
    for (const t of maps)
      if (!t.image?.data || !t.image.width || !t.image.height)
        unserializableTextures++;
  }
  check(
    id,
    'independent PBR textures have explicit color spaces and embedded pixel data',
    aliasedMaps === 0 && badColorSpaces === 0 && unserializableTextures === 0,
    {
      aliasedMaps,
      badColorSpaces,
      unserializableTextures,
      textures: res.textures.size,
    },
  );
  result.fingerprint = fingerprint(root);
  const second = buildDemoModel(id);
  result.secondFingerprint = fingerprint(second);
  check(
    id,
    'independent rebuild deterministic geometry/material/instance fingerprint',
    result.fingerprint === result.secondFingerprint,
    { first: result.fingerprint, second: result.secondFingerprint },
  );
  disposeAudit(id, second, 'repeat build');
  disposeAudit(id, root, 'original build');
  report.models.push(result);
}
report.sourceHashesAfter = sourceHashes();
report.sourcesChangedDuringAudit = Object.keys(report.sourceHashes).filter(
  (key) => report.sourceHashes[key] !== report.sourceHashesAfter[key],
);
report.summary = {
  passed: report.checks.filter((c) => c.passed).length,
  failed: report.checks.filter((c) => !c.passed).length,
  warnings: report.warnings.length,
};
writeFileSync(DIR + '/geometry.json', JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      summary: report.summary,
      models: report.models,
      failedChecks: report.checks.filter((c) => !c.passed),
      warnings: report.warnings,
      sourcesChangedDuringAudit: report.sourcesChangedDuringAudit,
    },
    null,
    2,
  ),
);
process.exitCode = report.summary.failed ? 1 : 0;
