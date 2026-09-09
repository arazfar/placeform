import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildDemoModel } from '../lib/demo-models';
import { fixedDemoSpec } from '../lib/demo-catalog';
import { createDemo } from '../lib/spec';
import {
  snapshotModel,
  disposeSnapshot,
  filmIdentity,
  sameFilmIdentity,
} from '../lib/cinematic-model';
import {
  analyzeModel,
  planSequence,
  shotPose,
  evaluateSequence,
  clearPose,
  cameraForPose,
  targetVisible,
} from '../lib/cinematic-sequence';
import {
  recoverModelFilms,
  parseModelFilms,
  type ModelFilmJob,
} from '../lib/model-films';
import { filmCodec } from '../lib/cinematic-renderer';
import { disposeArchitecture } from '../lib/architecture';

for (const concept of ['A', 'B', 'C', 'D'] as const) {
  void test(`${concept}: geometry-adapted paths remain clear and wide shots keep architecture framed`, () => {
    const spec = fixedDemoSpec(createDemo(), concept),
      model = buildDemoModel(concept);
    const snapshot = snapshotModel(model, spec),
      analysis = analyzeModel(snapshot.model),
      sequence = planSequence(snapshot);
    assert.equal(sequence.frames, sequence.seconds * sequence.fps);
    assert.equal(sequence.source.concept, concept);
    assert.ok(
      analysis.obstacles.length > model.children.length,
      'individual instances contribute obstacles',
    );
    assert.ok(
      analysis.bounds.min.y > -1,
      'landscape plinth excluded from architectural bounds',
    );
    for (const shot of sequence.shots) {
      for (let frame = 0; frame <= 144; frame++) {
        const pose = shotPose(shot, frame / 144);
        assert.ok(
          Number.isFinite(pose.position.length() + pose.target.length()),
        );
        assert.ok(
          clearPose(pose, analysis.obstacles),
          `${shot.id} frame ${frame} clips geometry`,
        );
        if (shot.focus)
          assert.ok(
            targetVisible(pose, snapshot.model),
            `detail target obscured at ${frame}`,
          );
        if (!shot.focus) {
          const camera = cameraForPose(pose);
          for (const x of [analysis.bounds.min.x, analysis.bounds.max.x])
            for (const y of [analysis.bounds.min.y, analysis.bounds.max.y])
              for (const z of [analysis.bounds.min.z, analysis.bounds.max.z]) {
                const ndc = new THREE.Vector3(x, y, z).project(camera);
                assert.ok(
                  Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9,
                  `${shot.id} crops architecture`,
                );
              }
        }
      }
      const first = shotPose(shot, 0).position,
        next = shotPose(shot, 1 / 144).position;
      const middle = shotPose(shot, 0.5).position,
        middleNext = shotPose(shot, 0.5 + 1 / 144).position;
      assert.ok(
        first.distanceTo(next) < middle.distanceTo(middleNext) / 30,
        'eased acceleration',
      );
    }
    disposeSnapshot(snapshot);
    disposeArchitecture(model);
  });
}
void test('rotation transforms the same planned paths and materials survive source disposal', () => {
  const spec = fixedDemoSpec(createDemo(), 'B'),
    model = buildDemoModel('B');
  const plain = snapshotModel(model, spec),
    base = planSequence(plain);
  model.rotation.y = 0.8;
  spec.site.rotation = 90 - (0.8 * 180) / Math.PI;
  const snapshot = snapshotModel(model, spec),
    sequence = planSequence(snapshot);
  let originalMesh!: THREE.Mesh;
  model.traverse((object) => {
    if (!originalMesh && object instanceof THREE.Mesh) originalMesh = object;
  });
  const ownedMesh = snapshot.model.getObjectByName(
    originalMesh.name,
  ) as THREE.Mesh;
  assert.notEqual(ownedMesh.geometry, originalMesh.geometry);
  assert.notEqual(ownedMesh.material, originalMesh.material);
  assert.deepEqual(
    (ownedMesh.material as THREE.MeshStandardMaterial).color,
    (originalMesh.material as THREE.MeshStandardMaterial).color,
  );
  const expected = new THREE.Vector3(...base.shots[0].points[0]).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    0.8,
  );
  assert.ok(
    expected.distanceTo(new THREE.Vector3(...sequence.shots[0].points[0])) <
      1e-8,
  );
  disposeArchitecture(model);
  assert.ok(ownedMesh.geometry.getAttribute('position').count);
  spec.concept = 'D';
  assert.equal(snapshot.spec.concept, 'B');
  assert.equal(sameFilmIdentity(snapshot.identity, filmIdentity(spec)), false);
  disposeSnapshot(plain);
  disposeSnapshot(snapshot);
});
void test('timeline dissolves only at shot boundaries and holds the final frame', () => {
  const model = buildDemoModel('D'),
    snapshot = snapshotModel(model, fixedDemoSpec(createDemo(), 'D')),
    sequence = planSequence(snapshot);
  for (const boundary of [144, 288, 432]) {
    assert.equal(evaluateSequence(sequence, boundary - 7).second, undefined);
    assert.equal(evaluateSequence(sequence, boundary - 6).mix, 0);
    assert.equal(evaluateSequence(sequence, boundary).mix, 0.5);
    assert.equal(evaluateSequence(sequence, boundary + 6).second, undefined);
  }
  assert.deepEqual(
    evaluateSequence(sequence, 565).first.position,
    evaluateSequence(sequence, 575).first.position,
  );
  disposeSnapshot(snapshot);
  disposeArchitecture(model);
});
void test('reload interrupts only unfinished local renders without changing source provenance', () => {
  const model = buildDemoModel('A'),
    snapshot = snapshotModel(model, fixedDemoSpec(createDemo()));
  const job: ModelFilmJob = {
    kind: 'three-model',
    id: 'test',
    createdAt: 'now',
    status: 'rendering',
    spec: snapshot.spec,
    sequence: planSequence(snapshot),
  };
  const completed: ModelFilmJob = {
    ...job,
    id: 'complete',
    status: 'completed',
  };
  const recovered = recoverModelFilms([job, completed]);
  assert.deepEqual(parseModelFilms(JSON.stringify([completed])), [completed]);
  assert.throws(() =>
    parseModelFilms(
      JSON.stringify([{ ...job, spec: { ...job.spec, concept: 'B' } }]),
    ),
  );
  assert.throws(() => parseModelFilms('[null]'));
  assert.throws(() =>
    parseModelFilms(
      '[{"kind":"three-model","id":"broken","spec":{},"sequence":{}}]',
    ),
  );
  assert.equal(recovered[0].status, 'interrupted');
  assert.equal(recovered[0].sequence, job.sequence);
  assert.equal(recovered[1], completed);
  disposeSnapshot(snapshot);
  disposeArchitecture(model);
});

void test('codec preflight prefers MP4, explicitly falls back to WebM and rejects unsupported encoders', async () => {
  assert.equal((await filmCodec(async () => true)).extension, 'mp4');
  assert.equal(
    (await filmCodec(async (codec) => codec === 'vp9')).extension,
    'webm',
  );
  await assert.rejects(
    filmCodec(async () => false),
    /cannot encode/,
  );
});
