/* oxlint-disable typescript/unbound-method -- This test saves prototype functions for injection and restores them; invocations use .call/.apply. */
// Read-only app regression driver. Run against the already-open development page.
// It uses small PNGs, does not download files, and restores the starting concept.
export default async function browserRegression(page) {
  const concepts = {
    A: 'A Terrace Commons Stepped garden terraces',
    B: 'B Folded Horizon Folded metal ribbons',
    C: 'C Civic Dune Curved roofs with open courts',
    D: 'D Lantern Spine Flat roofs and screened plant',
  };
  const results = [];
  await page.waitForFunction(() => !!window.__PLACEFORM_SCENE);
  const initial = await page.evaluate(() => window.__PLACEFORM_SCENE.concept);
  const select = async (id) => {
    await page.getByRole('tab', { name: 'Concepts', exact: true }).click();
    await page.getByRole('button', { name: concepts[id], exact: true }).click();
    await page.getByRole('tab', { name: '3D model', exact: true }).click();
    await page.waitForFunction(
      (id) => window.__PLACEFORM_SCENE?.concept === id,
      id,
    );
  };
  try {
    results.push(
      await page.evaluate(async () => {
        const api = window.__PLACEFORM_SCENE;
        api.play();
        const before = api.diagnostics();
        const original = HTMLCanvasElement.prototype.toBlob;
        const completion = [];
        let failures = 0;
        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
          if (this.width === 321 && this.height === 181 && failures++ === 0) {
            callback(null);
            return;
          }
          return original.call(this, callback, ...args);
        };
        let settled;
        try {
          const first = api
            .capture('perspective', 19, { width: 321, height: 181 })
            .then(
              () => {
                completion.push('unexpected success');
              },
              (error) => {
                completion.push('failure');
                return error.message;
              },
            );
          const second = api
            .capture('reverse', 15, { width: 322, height: 182 })
            .then(async (blob) => {
              completion.push('success');
              const image = await createImageBitmap(blob);
              const dimensions = [image.width, image.height];
              image.close();
              return dimensions;
            });
          settled = await Promise.all([first, second]);
        } finally {
          HTMLCanvasElement.prototype.toBlob = original;
        }
        const after = api.diagnostics();
        const same = (key) =>
          before[key].every((v, i) => Math.abs(v - after[key][i]) < 0.000001);
        if (completion.join(',') !== 'failure,success')
          throw new Error('Queue did not recover in order: ' + completion);
        if (!String(settled[0]).includes('encode'))
          throw new Error('PNG failure injection did not reach encoding');
        if (settled[1].join(',') !== '322,182')
          throw new Error('Queued PNG has wrong dimensions');
        if (after.busy || !same('camera') || !same('target') || !same('size'))
          throw new Error('Capture failure did not restore live state');
        return {
          test: 'PNG failure, queue recovery, and exact state restoration',
          passed: true,
          completion,
        };
      }),
    );

    results.push(
      await page.evaluate(async () => {
        const api = window.__PLACEFORM_SCENE;
        api.play();
        const before = api.diagnostics();
        const OriginalRecorder = window.MediaRecorder;
        const originalStream = HTMLCanvasElement.prototype.captureStream;
        if (!OriginalRecorder || !originalStream)
          return {
            test: 'Recorder construction failure',
            skipped: 'Browser has no recording API',
          };
        const tracks = [];
        HTMLCanvasElement.prototype.captureStream = function (...args) {
          const stream = originalStream.apply(this, args);
          tracks.push(...stream.getTracks());
          return stream;
        };
        window.MediaRecorder = class {
          static isTypeSupported() {
            return true;
          }
          constructor() {
            throw new Error('Injected recorder failure');
          }
        };
        let message = '';
        try {
          await api.record(
            {
              id: 'test',
              name: 'Test',
              description: '',
              seconds: 0.1,
              from: [86, 73, 151],
              to: [88, 73, 151],
              target: [0, 4.5, 0],
            },
            () => {},
          );
        } catch (error) {
          message = error.message;
        } finally {
          window.MediaRecorder = OriginalRecorder;
          HTMLCanvasElement.prototype.captureStream = originalStream;
        }
        const after = api.diagnostics();
        const same = (key) =>
          before[key].every((v, i) => Math.abs(v - after[key][i]) < 0.000001);
        if (!message.includes('Injected recorder failure'))
          throw new Error(
            'Recorder failure injection was not reached: ' + message,
          );
        if (tracks.some((track) => track.readyState !== 'ended'))
          throw new Error('Recording failure leaked a media track');
        if (after.busy || !same('camera') || !same('target') || !same('size'))
          throw new Error('Recording failure did not restore live state');
        return {
          test: 'Recorder construction failure restores state and stops tracks',
          passed: true,
          stoppedTracks: tracks.length,
        };
      }),
    );

    await page.getByRole('tab', { name: /Film/ }).click();
    const hideTools = page.getByRole('button', {
      name: 'Hide model tools',
      exact: true,
    });
    if (await hideTools.isVisible()) await hideTools.click();
    await page.waitForFunction(
      () => window.__PLACEFORM_SCENE?.diagnostics().visible === false,
    );
    results.push(
      await page.evaluate(async () => {
        const api = window.__PLACEFORM_SCENE;
        api.play();
        const frames = await api.frames(
          {
            id: 'test',
            name: 'Test',
            description: '',
            seconds: 0.1,
            from: [86, 73, 151],
            to: [-118, 75, -146],
            target: [0, 4.5, 0],
          },
          { width: 320, height: 180 },
        );
        const inspect = async (blob) => {
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          const colors = new Set();
          for (let i = 0; i < pixels.length; i += 64)
            colors.add([pixels[i], pixels[i + 1], pixels[i + 2]].join(','));
          bitmap.close();
          return {
            width: canvas.width,
            height: canvas.height,
            colors: colors.size,
            bytes: blob.size,
          };
        };
        const samples = await Promise.all([
          inspect(frames.first),
          inspect(frames.last),
        ]);
        if (
          samples.some(
            (s) =>
              s.width !== 320 ||
              s.height !== 180 ||
              s.colors < 20 ||
              s.bytes < 1000,
          )
        )
          throw new Error(
            'Hidden Film frame is blank or incorrectly sized: ' +
              JSON.stringify(samples),
          );
        const after = api.diagnostics();
        if (after.busy || after.visible)
          throw new Error('Hidden Film capture failed to restore idle state');
        return { test: 'Hidden Film first/last frames', passed: true, samples };
      }),
    );

    await select(initial);
    await page.evaluate(() => {
      const api = window.__PLACEFORM_SCENE;
      api.play();
      window.__sceneProbeOldAPI = api;
      window.__sceneProbeOriginalToBlob = HTMLCanvasElement.prototype.toBlob;
      window.__sceneProbeRelease = null;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
        return window.__sceneProbeOriginalToBlob.call(
          this,
          (blob) => {
            if (
              this.width === 329 &&
              this.height === 189 &&
              !window.__sceneProbeRelease
            )
              window.__sceneProbeRelease = () => callback(blob);
            else callback(blob);
          },
          ...args,
        );
      };
      window.__sceneProbePending = Promise.allSettled([
        api.capture('perspective', 15, { width: 329, height: 189 }),
        api.capture('reverse', 15, { width: 330, height: 190 }),
      ]);
    });
    await page.waitForFunction(
      () => typeof window.__sceneProbeRelease === 'function',
    );
    const replacement = initial === 'B' ? 'A' : 'B';
    await select(replacement);
    results.push(
      await page.evaluate(async () => {
        window.__sceneProbeRelease();
        const settled = await window.__sceneProbePending;
        HTMLCanvasElement.prototype.toBlob = window.__sceneProbeOriginalToBlob;
        let staleMessage = '';
        try {
          await window.__sceneProbeOldAPI.capture('aerial');
        } catch (error) {
          staleMessage = error.message;
        }
        if (
          settled[1].status !== 'rejected' ||
          !String(settled[1].reason).includes('changed')
        )
          throw new Error('Queued capture survived concept replacement');
        if (!staleMessage.includes('changed'))
          throw new Error('Stale API still exports after replacement');
        const current = window.__PLACEFORM_SCENE.diagnostics();
        if (current.busy)
          throw new Error('Queue stayed busy after replacement');
        return {
          test: 'Concept replacement rejects queued captures and stale API',
          passed: true,
          results: settled.map((v) => v.status),
          concept: current.concept,
        };
      }),
    );
  } finally {
    await page.evaluate(() => {
      window.__sceneProbeRelease?.();
      if (window.__sceneProbeOriginalToBlob)
        HTMLCanvasElement.prototype.toBlob = window.__sceneProbeOriginalToBlob;
    });
    await select(initial);
  }
  return results;
}
