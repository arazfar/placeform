import assert from 'node:assert/strict';
import test from 'node:test';
import { videoReadiness, type VideoCatalog } from '../lib/video-readiness';

function connected(): VideoCatalog {
  return {
    model: {
      id: 'minimaxai/minimax-h3',
      pricing: [
        { resolution: '768p', per_second: '0.080000', currency: 'usd' },
      ],
    },
    agreement: { accepted: true, version: '2026-08-21.1' },
    checkedAt: new Date().toISOString(),
  };
}

void test('live accepted account can generate without a manual connection step', () => {
  assert.equal(videoReadiness(connected()), null);
});
void test('missing model, unknown agreement, and unaccepted terms prevent generation', () => {
  assert.match(videoReadiness(null)!, /connection/);
  assert.match(videoReadiness({ ...connected(), model: null })!, /unavailable/);
  assert.match(
    videoReadiness({ ...connected(), agreement: null })!,
    /could not be checked/,
  );
  assert.match(
    videoReadiness({
      ...connected(),
      agreement: { accepted: false, version: 'new' },
    })!,
    /Accept/,
  );
});
void test('invalid or missing live prices cannot enable a paid submission', () => {
  for (const rate of ['', ' ', 'NaN', 'Infinity', '-0.08']) {
    const catalog = connected();
    catalog.model!.pricing[0].per_second = rate;
    assert.match(videoReadiness(catalog)!, /valid live video price/);
  }
  const catalog = connected();
  catalog.model!.pricing = [];
  assert.match(videoReadiness(catalog)!, /valid live video price/);
});
