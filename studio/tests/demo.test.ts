import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import { createDemo, conceptImage, canOpenModel, validSpec } from '../lib/spec';
import {
  demoConcepts,
  fixedDemoSpec,
  DEMO_STORAGE_KEY,
} from '../lib/demo-catalog';
import { buildDemoModel } from '../lib/demo-models';
import { disposeArchitecture } from '../lib/architecture';
import { videoReferences } from '../lib/video-reference';
import { encodeProjects, decodeProjects } from '../lib/persistence';

void test('fixed catalog survives restoration and ignores stale assets, directions and mixed geometry', () => {
  for (const c of demoConcepts) {
    const old = {
      ...createDemo(),
      assets: { A: 'data:image/png;base64,old' },
      length: 33,
      locks: ['massing' as const],
    };
    const s = fixedDemoSpec(old, c.id);
    assert.equal(conceptImage(s, c.id), c.image);
    assert.equal(s.material, c.id);
    assert.equal(s.roof, c.id);
    assert.equal(s.length, 112);
    assert.ok(canOpenModel(s));
    assert.ok(validSpec(s));
    const restored = decodeProjects(
      encodeProjects({
        active: s.id,
        projects: [{ project: s, past: [], future: [], saved: 'now' }],
      }),
    );
    assert.equal(
      conceptImage(fixedDemoSpec(restored.projects[0].project), c.id),
      c.image,
    );
    assert.ok(readFileSync(`public${c.image}`).length > 1_000_000);
  }
  assert.notEqual(DEMO_STORAGE_KEY, 'projects-v2');
});

void test('four models have distinct solid geometry, semantic parts, finite bounds and disposable resources', () => {
  const signatures = new Set<string>();
  for (const c of demoConcepts) {
    const root = buildDemoModel(c.id);
    root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(root),
      size = bounds.getSize(new Vector3());
    assert.ok(size.x > 100 && size.x < 160 && size.z > 90 && size.y > 8);
    let vertices = 0;
    root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      assert.ok(o.name && o.userData.feature);
      const p = o.geometry.getAttribute('position');
      vertices += p.count;
      for (let i = 0; i < p.count; i++)
        assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)));
    });
    signatures.add(`${root.children.length}:${vertices}`);
    const again = buildDemoModel(c.id);
    assert.deepEqual(
      root.children.map((o) => o.name),
      again.children.map((o) => o.name),
    );
    disposeArchitecture(again);
    disposeArchitecture(root);
    assert.equal(root.children.length, 0);
  }
  assert.equal(signatures.size, 4);
});

void test('Civic Dune courtyard is an actual roof opening', () => {
  const root = buildDemoModel('C');
  root.updateMatrixWorld(true);
  const roofs = root.children.filter((o) =>
    o.name.startsWith('Continuous dune roof'),
  );
  const ray = new Raycaster(new Vector3(0, 30, 26), new Vector3(0, -1, 0));
  assert.equal(ray.intersectObjects(roofs).length, 0);
  ray.set(new Vector3(0, 30, 38), new Vector3(0, -1, 0));
  assert.ok(ray.intersectObjects(roofs).length > 0);
  disposeArchitecture(root);
});

void test('video accepts one concept frame or two model frames and rejects malformed IDs', () => {
  assert.deepEqual(videoReferences('file-start'), [
    { file_id: 'file-start', role: 'first_frame' },
  ]);
  assert.equal(videoReferences('file-start', 'file-end')?.length, 2);
  for (const [first, last] of [
    [undefined, undefined],
    ['https://example.com', undefined],
    ['file-ok', ''],
    ['file-ok', null],
    ['file-ok', 'invalid'],
  ])
    assert.equal(videoReferences(first, last), null);
});
