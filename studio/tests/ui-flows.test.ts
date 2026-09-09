import test from 'node:test';
import assert from 'node:assert/strict';
import { watchContextLoss } from '../lib/scene-availability';
import { parseCommand, executeAction } from '../lib/commands';
import { createDemo } from '../lib/spec';
import { fixedDemoSpec } from '../lib/demo-catalog';

void test('daylight command changes only the hour and rejects out-of-range input', () => {
  const spec = fixedDemoSpec(createDemo());
  const command = parseCommand('Set daylight to 18', spec);
  assert.ok(command);
  const result = executeAction(spec, command);
  assert.equal(result.spec?.hour, 18);
  assert.equal(result.spec?.view, spec.view);
  assert.equal(result.spec?.concept, spec.concept);
  const invalid = parseCommand('Set daylight to 25', spec);
  assert.ok(invalid);
  assert.equal(executeAction(spec, invalid).spec, undefined);
  assert.match(executeAction(spec, invalid).message, /6.*21/);
});

void test('renderer loss invalidates a session once and cleanup isolates replacement sessions', () => {
  const canvas = new EventTarget();
  let handle: object | undefined = {};
  let failures = 0;
  const cleanup = watchContextLoss(canvas, () => {
    handle = undefined;
    failures++;
  });
  canvas.dispatchEvent(new Event('webglcontextlost'));
  canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(handle, undefined);
  assert.equal(failures, 1);
  cleanup();
  handle = {};
  canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.ok(handle);
  const detach = watchContextLoss(canvas, () => {
    failures++;
  });
  detach();
  canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(failures, 1);
});
