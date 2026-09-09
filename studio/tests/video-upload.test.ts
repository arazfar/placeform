import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readVideoReference,
  MAX_VIDEO_REFERENCE_BYTES as MAX,
} from '../lib/video-upload';
import { AIandVideo, AIandError } from '../lib/aiand-video';
import {
  videoJSON,
  VideoRequestError,
  submitCinematic,
} from '../lib/video-client';

function request(size: number, type = 'image/png', length?: number) {
  let remaining = size;
  let first = true;
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!remaining) return controller.close();
      const chunk = new Uint8Array(Math.min(remaining, 65536));
      if (first && chunk.length >= 8)
        chunk.set([137, 80, 78, 71, 13, 10, 26, 10]);
      first = false;
      remaining -= chunk.length;
      controller.enqueue(chunk);
    },
    cancel() {
      canceled = true;
    },
  });
  return {
    req: new Request('http://localhost/api/video', {
      method: 'POST',
      headers: {
        'content-type': type,
        ...(length === undefined ? {} : { 'content-length': String(length) }),
      },
      body,
      duplex: 'half',
    } as RequestInit),
    canceled: () => canceled,
  };
}

void test('binary references above 1 MiB and at 30 MiB preserve bytes and provider multipart', async () => {
  for (const size of [1048577, MAX]) {
    const file = await readVideoReference(request(size).req);
    assert.equal(file.size, size);
    let uploaded = false;
    const api = new AIandVideo('test-key', async (_url, init) => {
      const form = init?.body as FormData;
      const reference = form.get('file') as File;
      assert.equal(reference.size, size);
      assert.equal(reference.type, 'image/png');
      assert.equal(form.get('purpose'), 'vision');
      assert.deepEqual(await reference.arrayBuffer(), await file.arrayBuffer());
      uploaded = true;
      return Response.json({ id: 'file-test' });
    });
    await api.upload(file);
    assert.equal(uploaded, true);
  }
});

void test('oversized streams are rejected and canceled with missing or inaccurate lengths', async () => {
  for (const length of [undefined, 1, MAX + 1]) {
    const probe = request(MAX + 1, 'image/png', length);
    await assert.rejects(
      readVideoReference(probe.req),
      (e: unknown) => e instanceof AIandError && e.status === 413,
    );
    assert.equal(probe.canceled(), true);
  }
});

void test('unsupported types, empty images and invalid signatures never reach provider', async () => {
  await assert.rejects(
    readVideoReference(request(10, 'text/plain').req),
    (e: unknown) => e instanceof AIandError && e.status === 415,
  );
  const api = new AIandVideo('test-key', async () => {
    throw new Error('Provider must not be called');
  });
  for (const size of [0, 3]) {
    await assert.rejects(
      api.upload(await readVideoReference(request(size).req)),
      (e: unknown) => e instanceof AIandError && e.code === 'invalid_reference',
    );
  }
});

void test('video responses handle non-JSON errors and malformed successes', async (t) => {
  const cases = [
    {
      body: 'Payload Too Large',
      status: 413,
      message: /30 MiB/,
      uncertain: false,
    },
    {
      body: '<html>Bad gateway</html>',
      status: 502,
      message: /HTTP 502/,
      uncertain: true,
    },
    {
      body: JSON.stringify({ error: 'Gateway failed' }),
      status: 502,
      message: /Gateway failed/,
      uncertain: true,
    },
    { body: '', status: 200, message: /unreadable/, uncertain: true },
    { body: '{bad', status: 200, message: /unreadable/, uncertain: true },
    { body: 'null', status: 200, message: /unreadable/, uncertain: true },
    { body: '[]', status: 200, message: /unreadable/, uncertain: true },
    {
      body: JSON.stringify({
        error: 'Check history',
        code: 'unknown',
        uncertain: true,
      }),
      status: 502,
      message: /Check history/,
      uncertain: true,
    },
    {
      body: JSON.stringify({
        error: 'Accept terms',
        code: 'terms',
        uncertain: false,
      }),
      status: 403,
      message: /Accept terms/,
      uncertain: false,
    },
  ];
  for (const c of cases) {
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response(c.body, { status: c.status }),
    );
    await assert.rejects(videoJSON('/api/video'), (e: unknown) => {
      assert.ok(e instanceof VideoRequestError);
      assert.match(e.message, c.message);
      assert.equal(e.status, c.status);
      assert.equal(e.uncertain, c.uncertain);
      if (c.body.includes('"code"'))
        assert.equal(e.code, JSON.parse(c.body).code);
      return true;
    });
    t.mock.restoreAll();
  }
});

void test('references upload sequentially before one generation; upload failures prevent submission', async (t) => {
  for (const failAt of [-1, 0, 1]) {
    let requests = 0;
    let submitting = false;
    const images = [
      new Blob(['first'], { type: 'image/png' }),
      new Blob(['last'], { type: 'image/png' }),
    ];
    t.mock.method(
      globalThis,
      'fetch',
      async (_url: string, init: RequestInit) => {
        const index = requests++;
        if (index < 2) {
          assert.equal(submitting, false);
          assert.equal(init.body, images[index]);
          assert.equal(
            new Headers(init.headers).get('content-type'),
            'image/png',
          );
          if (index === failAt)
            return new Response('Payload Too Large', { status: 413 });
          return Response.json({ id: `file-${index}` });
        }
        assert.equal(submitting, true);
        const data = JSON.parse(init.body as string);
        assert.equal(data.firstFrame, 'file-0');
        assert.equal(data.lastFrame, 'file-1');
        return Response.json({ id: 'video-test', status: 'queued' });
      },
    );
    const pending = submitCinematic(
      images,
      { prompt: 'A test film', seconds: 10, expectedRate: '0.08' },
      () => {},
      () => {
        submitting = true;
      },
    );
    if (failAt < 0) {
      assert.equal((await pending).status, 'queued');
      assert.equal(requests, 3);
    } else {
      await assert.rejects(pending, VideoRequestError);
      assert.equal(requests, failAt + 1);
      assert.equal(submitting, false);
    }
    t.mock.restoreAll();
  }
});
