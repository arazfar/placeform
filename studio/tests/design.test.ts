import type { Mesh } from 'three';
import { encodeProjects, decodeProjects } from '../lib/persistence';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, validSpec, applyConcept } from '../lib/spec';
import { executeAction, parseCommand } from '../lib/commands';
import {
  getMassing,
  buildArchitecture,
  disposeArchitecture,
} from '../lib/architecture';
import { drawingSVG, sheets } from '../lib/drawings';
import {
  siteArea,
  footprint,
  siteAt,
  fitsSite,
  updateBoundary,
} from '../lib/site';
void test('voice tool action and typed fallback share validated geometry edits', () => {
  const s = createDemo();
  const a = parseCommand('Deepen the fins to 1.2 metres', s);
  assert.equal(a?.type, 'set');
  const r = executeAction(s, a!);
  assert.equal(r.spec?.finDepth, 1.2);
  assert.equal(s.finDepth, 0.85);
  assert.ok(validSpec(r.spec));
});
void test('feature locks block direct edits and mixing atomically', () => {
  const s = createDemo();
  s.locks = ['facade'];
  assert.equal(
    executeAction(s, { type: 'set', parameter: 'finDepth', value: 1.5 }).spec,
    undefined,
  );
  assert.equal(
    executeAction(s, { type: 'mix', massing: 'B', facade: 'C' }).spec,
    undefined,
  );
  assert.equal(applyConcept(s, 'D').material, 'A');
  assert.equal(applyConcept(s, 'D').finDepth, 0.85);
});
void test('mixed references resolve massing facade and landscape, roof is preserved', () => {
  const s = createDemo(),
    a = parseCommand('Use A’s massing, B’s facade, and C’s landscape', s)!;
  assert.equal(a.facade, 'B');
  assert.equal(a.landscape, 'C');
  const r = executeAction(s, a).spec!;
  assert.equal(r.material, 'B');
  assert.equal(r.landscape, 'C');
  assert.equal(r.roof, 'A');
});
void test('unsupported and ambiguous commands do not mutate geometry', () => {
  const s = createDemo();
  assert.equal(parseCommand('make that nicer', s), null);
  assert.equal(
    executeAction(s, { type: 'set', parameter: 'height', value: NaN }).spec,
    undefined,
  );
  assert.equal(
    executeAction(s, { type: 'set', parameter: 'height', value: 100 }).spec,
    undefined,
  );
  assert.equal(executeAction(s, { type: 'view', hour: 25 }).spec, undefined);
  assert.ok(
    executeAction(s, { type: 'generate', prompt: 'arched courtyard' })
      .generation,
  );
});
void test('site persists geospatial footprint and correct dimensions', () => {
  const s = createDemo();
  assert.ok(siteArea(s.site) > 9000 && siteArea(s.site) < 12000);
  assert.ok(fitsSite(s));
  const ring = footprint(s).geometry.coordinates[0];
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring[4]);
  const tiny = siteAt(s.site.center, 'small');
  tiny.polygon.geometry.coordinates[0] =
    tiny.polygon.geometry.coordinates[0].map((p) => [
      s.site.center[0] + (p[0] - s.site.center[0]) * 0.1,
      s.site.center[1] + (p[1] - s.site.center[1]) * 0.1,
    ]);
  assert.equal(fitsSite({ ...s, site: tiny }), false);
});
void test('schematic drawings use the current specification and XML-escape titles', () => {
  const s = createDemo();
  s.finDepth = 1.2;
  s.length = 90;
  s.name = '<test & title>';
  for (const sh of sheets) {
    const svg = drawingSVG(s, sh.id);
    assert.ok(svg.includes('SCHEMATIC DESIGN'));
    assert.ok(svg.includes('viewBox="0 0 1680 1188"'));
    assert.ok(!svg.includes('<test & title>'));
    assert.ok(!svg.includes('NaN'));
  }
  assert.ok(drawingSVG(s, 'A02').includes('90.00 m'));
  assert.ok(drawingSVG(s, 'A02').includes('1.20 m'));
});
void test('all massing recipes build valid metre-scale geometry and matching footprints', () => {
  const s = createDemo();
  for (const concept of ['A', 'B', 'C', 'D'] as const) {
    const recipe = applyConcept(s, concept),
      model = buildArchitecture(recipe),
      boxes = getMassing(recipe);
    assert.equal(model.userData.spec.length, recipe.length);
    assert.ok(boxes.every((b) => b.w > 0 && b.d > 0 && b.h > 0));
    assert.ok(model.children.length > 40);
    for (const mesh of model.children as Mesh[]) {
      assert.ok(mesh.userData.feature);
      const p = mesh.geometry?.getAttribute('position');
      if (p)
        for (let i = 0; i < p.count; i++)
          assert.ok(
            Number.isFinite(p.getX(i)) &&
              Number.isFinite(p.getY(i)) &&
              Number.isFinite(p.getZ(i)),
          );
    }
    disposeArchitecture(model);
    assert.equal(model.children.length, 0);
  }
});
void test('invalid import rejected', () => {
  const s = createDemo();
  assert.ok(validSpec(s));
  assert.equal(validSpec({ ...s, finDepth: Infinity }), false);
  assert.equal(validSpec({ ...s, roof: 'Z' }), false);
  assert.equal(validSpec({ ...s, locks: ['secret'] }), false);
  assert.equal(
    validSpec({ ...s, site: { ...s.site, center: [NaN, 0] } }),
    false,
  );
});

void test('massing recipe remains unchanged under a massing lock', () => {
  const s = createDemo();
  s.locks = ['massing'];
  assert.deepEqual(getMassing(applyConcept(s, 'D')), getMassing(s));
});
void test('long-axis bearing is independent of polygon start and winding', () => {
  const s = createDemo(),
    ring = s.site.polygon.geometry.coordinates[0];
  const reversed = {
    ...s.site.polygon,
    geometry: {
      ...s.site.polygon.geometry,
      coordinates: [[...ring].reverse()],
    },
  };
  assert.ok(Math.abs(updateBoundary(s.site, reversed).rotation - 90) < 0.01);
});

void test('imported images are deduplicated across undo history and restored losslessly', () => {
  const project = createDemo();
  project.assets = { A: 'data:image/jpeg;base64,abcd' };
  const raw = encodeProjects({
    active: project.id,
    projects: [
      { project, past: [project, project], future: [project], saved: 'now' },
    ],
  });
  assert.equal(raw.match(/base64,abcd/g)?.length, 1);
  const restored = decodeProjects(raw);
  assert.equal(restored.projects[0].past[1].assets.A, project.assets.A);
  assert.ok(validSpec(restored.projects[0].project));
});

void test('generation fingerprints reject site/design drift but permit camera changes', async () => {
  const { generationFingerprint } = await import('../lib/generation');
  const s = createDemo();
  assert.equal(
    generationFingerprint(s, 'image'),
    generationFingerprint(
      { ...s, view: 'north', hour: 19, revision: 99 },
      'image',
    ),
  );
  assert.notEqual(
    generationFingerprint(s, 'image'),
    generationFingerprint({ ...s, finDepth: 1.5 }, 'image'),
  );
  assert.notEqual(
    generationFingerprint(s, 'research'),
    generationFingerprint(
      { ...s, site: { ...s.site, center: [-122, 45] } },
      'research',
    ),
  );
});
void test('AI proposals apply atomically, respect locks, and reject out-of-range geometry', async () => {
  const { applyGeneration } = await import('../lib/generation');
  const s = createDemo();
  s.locks = ['facade'];
  assert.throws(
    () =>
      applyGeneration(
        s,
        'design',
        {
          message: 'test',
          actions: [
            { type: 'set', parameter: 'height', value: 20 },
            { type: 'set', parameter: 'finDepth', value: 1.5 },
          ],
        },
        'A',
      ),
    /locked/,
  );
  assert.equal(s.height, 16);
  assert.throws(
    () =>
      applyGeneration(
        s,
        'design',
        {
          message: 'test',
          actions: [{ type: 'set', parameter: 'height', value: 1000 }],
        },
        'A',
      ),
    /between/,
  );
  assert.equal(
    applyGeneration(
      s,
      'design',
      {
        message: 'lower',
        actions: [{ type: 'set', parameter: 'height', value: 12 }],
      },
      'A',
    ).height,
    12,
  );
});
void test('generated concepts require complete safe palettes and survive project storage', async () => {
  const { concepts } = await import('../lib/spec');
  const { applyGeneration, validateResult } = await import('../lib/generation');
  const s = applyGeneration(
    createDemo(),
    'concepts',
    { directions: concepts },
    'A',
  );
  assert.ok(validSpec(s));
  const encoded = encodeProjects({
    projects: [{ project: s, past: [], future: [], saved: 'now' }],
  });
  assert.deepEqual(
    decodeProjects(encoded).projects[0].project.directions,
    concepts,
  );
  assert.throws(
    () => validateResult('concepts', { directions: [concepts[0]] }),
    /incomplete/,
  );
  const bad = structuredClone(s);
  bad.directions![0].colors[0] = 'url(https://example.com)';
  assert.equal(validSpec(bad), false);
  assert.throws(
    () =>
      applyGeneration(
        { ...s, locks: ['facade'] },
        'concepts',
        { directions: concepts },
        'A',
      ),
    /Unlock/,
  );
});
