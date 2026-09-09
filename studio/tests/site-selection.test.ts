import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SiteSelection,
  clampPoint,
  selectionRect,
  rectanglePolygon,
  selectedSite,
  centeredSite,
} from '../lib/site-selection';
import { siteAt, siteArea, fitsSite } from '../lib/site';
import { createDemo } from '../lib/spec';

void test('drag direction normalizes to the same bounded rectangle', () => {
  const a = { x: 100, y: 80 },
    b = { x: 20, y: 10 };
  assert.deepEqual(selectionRect(a, b), selectionRect(b, a));
  assert.deepEqual(selectionRect(a, b), {
    left: 20,
    top: 10,
    width: 80,
    height: 70,
  });
  assert.deepEqual(clampPoint({ x: -200, y: 999 }, 400, 300), { x: 0, y: 300 });
});
void test('only the owning pointer release commits once, movement does not finish', () => {
  const drag = new SiteSelection();
  drag.begin(1, { x: 20, y: 30 });
  assert.ok(drag.move(1, { x: 120, y: 100 }));
  assert.equal(drag.pointer, 1);
  assert.equal(drag.finish(2, { x: 140, y: 130 }), undefined);
  assert.equal(drag.pointer, 1);
  assert.deepEqual(drag.finish(1, { x: 140, y: 130 }), {
    left: 20,
    top: 30,
    width: 120,
    height: 100,
  });
  assert.equal(drag.finish(1, { x: 150, y: 150 }), undefined);
});
void test('clicks, thin rectangles, cancellation and additional pointers never commit', () => {
  for (const end of [
    { x: 0, y: 0 },
    { x: 9, y: 150 },
    { x: 150, y: 9 },
  ]) {
    const drag = new SiteSelection();
    drag.begin(1, { x: 0, y: 0 });
    assert.equal(drag.finish(1, end), undefined);
  }
  for (const cancel of [
    (drag: SiteSelection) => drag.cancel(),
    (drag: SiteSelection) => drag.begin(2, { x: 50, y: 50 }),
  ]) {
    const drag = new SiteSelection();
    drag.begin(1, { x: 0, y: 0 });
    drag.move(1, { x: 100, y: 100 });
    cancel(drag);
    assert.equal(drag.finish(1, { x: 100, y: 100 }), undefined);
  }
});
void test('projection produces a finite closed ring and preserves center/orientation metadata', () => {
  const shape = rectanglePolygon(
    { left: 20, top: 10, width: 80, height: 70 },
    ([x, y]) => [-122 + x / 100000, 45 - y / 100000],
  )!;
  assert.equal(shape.geometry.coordinates[0].length, 5);
  assert.deepEqual(
    shape.geometry.coordinates[0][0],
    shape.geometry.coordinates[0][4],
  );
  const site = selectedSite(shape, siteAt([-122, 45], 'Example'));
  assert.ok(siteArea(site) > 1);
  assert.ok(Math.abs(site.center[0] - -121.9994) < 1e-8);
  assert.ok(Math.abs(site.center[1] - 44.99955) < 1e-8);
  assert.ok(Number.isFinite(site.rotation));
});
void test('invalid geographic bounds and projection values are rejected', () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  assert.equal(
    rectanglePolygon(rect, () => [NaN, 45]),
    undefined,
  );
  assert.equal(
    rectanglePolygon(rect, () => [0, 86]),
    undefined,
  );
  assert.equal(
    rectanglePolygon(rect, ([x]) => [x ? 179 : -179, 40]),
    undefined,
  );
  assert.equal(
    rectanglePolygon({ ...rect, width: 0 }, () => [0, 0]),
    undefined,
  );
});
void test('search supplies context only near the searched place, distant drags get coordinates', () => {
  const portland = createDemo().site,
    sf = siteAt([-122.4194, 37.7749], 'San Francisco');
  const sfSelection = selectedSite(sf.polygon, portland, sf);
  assert.equal(sfSelection.name, 'San Francisco');
  assert.equal(sfSelection.location, 'San Francisco');
  const distant = siteAt([-74, 40.7], 'New York');
  const other = selectedSite(distant.polygon, portland, sf);
  assert.match(other.name, /40.7000, -74.0000/);
  assert.doesNotMatch(other.location, /Portland|San Francisco/);
});
void test('keyboard center selection fits the current building footprint', () => {
  const spec = createDemo();
  spec.length = 200;
  spec.width = 120;
  const site = centeredSite(
    spec,
    [-122.4194, 37.7749],
    siteAt([-122.4194, 37.7749], 'San Francisco'),
  );
  assert.equal(site.name, 'San Francisco');
  assert.ok(fitsSite({ ...spec, site }));
});
