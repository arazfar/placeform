// Run through playwright-cli run-code against the already-open development app.
// Exercises two complete concept cycles and one actual resized recording.
// No files are downloaded; the initial concept and viewport are restored.
export default async function resourceRecording(page) {
  const concepts = {
    A: 'A Terrace Commons Stepped garden terraces',
    B: 'B Folded Horizon Folded metal ribbons',
    C: 'C Civic Dune Curved roofs with open courts',
    D: 'D Lantern Spine Flat roofs and screened plant',
  };
  await page.getByRole('tab', { name: '3D model', exact: true }).click();
  await page.waitForFunction(() => !!window.__PLACEFORM_SCENE);
  const initialConcept = await page.evaluate(
    () => window.__PLACEFORM_SCENE.concept,
  );
  const initialViewport =
    page.viewportSize() ||
    (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  const samples = [];
  const select = async (id) => {
    await page.getByRole('tab', { name: 'Concepts', exact: true }).click();
    await page.getByRole('button', { name: concepts[id], exact: true }).click();
    await page.getByRole('tab', { name: '3D model', exact: true }).click();
    await page.waitForFunction(
      (id) =>
        window.__PLACEFORM_SCENE?.concept === id &&
        !window.__PLACEFORM_SCENE.diagnostics().busy,
      id,
    );
  };
  const frames = async (count = 45) =>
    page.evaluate(
      (count) =>
        new Promise((resolve) => {
          let elapsed = 0;
          const next = () => {
            if (++elapsed >= count) resolve();
            else requestAnimationFrame(next);
          };
          requestAnimationFrame(next);
        }),
      count,
    );
  const snapshot = async (label) => {
    // This explicitly awaits material images and shader compilation via the public API.
    await page.evaluate(async () => {
      await window.__PLACEFORM_SCENE.capture('perspective', 15, {
        width: 160,
        height: 90,
      });
    });
    await frames(45);
    const data = await page.evaluate(() => {
      const {
        concept,
        calls,
        triangles,
        geometries,
        textures,
        busy,
        visible,
        size,
        camera,
      } = window.__PLACEFORM_SCENE.diagnostics();
      return {
        concept,
        calls,
        triangles,
        geometries,
        textures,
        busy,
        visible,
        size,
        camera,
      };
    });
    if (data.busy || !data.visible || !data.calls || !data.triangles)
      throw new Error('Warmup failed: ' + JSON.stringify(data));
    samples.push({ label, ...data });
  };
  let recording;
  try {
    await select('A');
    await snapshot('baseline A');
    for (let cycle = 1; cycle <= 2; cycle++) {
      for (const id of ['B', 'C', 'D', 'A']) {
        await select(id);
        await snapshot(`cycle ${cycle} ${id}`);
      }
    }
    const aSamples = samples.filter((s) => s.concept === 'A');
    const firstCycle = aSamples[1],
      secondCycle = aSamples[2];
    if (
      firstCycle.geometries !== secondCycle.geometries ||
      firstCycle.textures !== secondCycle.textures
    ) {
      throw new Error(
        'A GPU resources did not stabilize across complete cycles: ' +
          JSON.stringify(aSamples),
      );
    }

    await page.evaluate(() => {
      const api = window.__PLACEFORM_SCENE;
      api.play(); // Freeze normal camera interpolation before measuring restoration.
      window.__placeformRecordingProgress = 0;
      window.__placeformRecordingSamples = [];
      window.__placeformRecordingBefore = api.diagnostics();
      const shot = {
        id: 'qa-one-second',
        name: 'QA one second',
        description: 'Resize regression',
        seconds: 1,
        from: [86, 73, 151],
        to: [93, 72, 145],
        target: [0, 4.5, 0],
      };
      window.__placeformRecordingPromise = api
        .record(shot, (progress) => {
          window.__placeformRecordingProgress = progress;
          window.__placeformRecordingSamples.push({
            progress,
            size: api.diagnostics().size,
          });
        })
        .then(async (blob) => {
          const after = api.diagnostics();
          if (blob.size < 1000)
            throw new Error(
              'Recorded clip is empty or too small: ' + blob.size,
            );
          const metadata = await new Promise((resolve, reject) => {
            const video = document.createElement('video');
            const url = URL.createObjectURL(blob);
            const timer = setTimeout(
              () => finish(new Error('Recorded video metadata timed out')),
              15000,
            );
            function finish(error, result) {
              clearTimeout(timer);
              video.onloadedmetadata = null;
              video.onerror = null;
              video.removeAttribute('src');
              video.load();
              URL.revokeObjectURL(url);
              if (error) reject(error);
              else resolve(result);
            }
            video.preload = 'metadata';
            video.muted = true;
            video.onloadedmetadata = () =>
              finish(null, {
                width: video.videoWidth,
                height: video.videoHeight,
                duration: Number.isFinite(video.duration)
                  ? video.duration
                  : String(video.duration),
              });
            video.onerror = () =>
              finish(
                new Error(
                  'Recorded video cannot be decoded: ' +
                    (video.error?.message || 'unknown media error'),
                ),
              );
            video.src = url;
          });
          return {
            bytes: blob.size,
            type: blob.type,
            metadata,
            before: window.__placeformRecordingBefore,
            after,
            samples: window.__placeformRecordingSamples,
          };
        })
        .then(
          (result) => ({ ok: true, result }),
          (error) => ({ ok: false, error: error.message }),
        );
    });
    await page.waitForFunction(
      () =>
        window.__PLACEFORM_SCENE.diagnostics().busy &&
        window.__placeformRecordingProgress >= 10 &&
        window.__placeformRecordingProgress < 100,
      null,
      { timeout: 15000, polling: 25 },
    );
    const resizedViewport = {
      width:
        initialViewport.width > 1000
          ? initialViewport.width - 173
          : initialViewport.width + 173,
      height:
        initialViewport.height > 700
          ? initialViewport.height - 97
          : initialViewport.height + 97,
    };
    await page.setViewportSize(resizedViewport);
    const result = await page.evaluate(
      () => window.__placeformRecordingPromise,
    );
    if (!result.ok) throw new Error('Actual recording failed: ' + result.error);
    recording = result.result;
    recording.viewportDuringClip = resizedViewport;
    if (recording.metadata.width !== 1280 || recording.metadata.height !== 720)
      throw new Error(
        'Recorded dimensions changed on resize: ' +
          JSON.stringify(recording.metadata),
      );
    if (recording.samples.some((s) => s.size[0] !== 1280 || s.size[1] !== 720))
      throw new Error(
        'A recorded frame used the wrong canvas dimensions: ' +
          JSON.stringify(recording.samples),
      );
    for (const key of ['camera', 'target']) {
      if (
        recording.before[key].some(
          (n, i) => Math.abs(n - recording.after[key][i]) > 0.00001,
        )
      )
        throw new Error('Recording did not restore ' + key);
    }
    if (recording.after.busy) throw new Error('Recording left the scene busy');
    await page.setViewportSize(initialViewport);
    await frames(45);
    const restored = await page.evaluate(() =>
      window.__PLACEFORM_SCENE.diagnostics(),
    );
    if (
      restored.size.some((n, i) => Math.abs(n - recording.before.size[i]) > 1)
    )
      throw new Error(
        'Original canvas dimensions did not return after viewport restoration: ' +
          JSON.stringify({
            before: recording.before.size,
            restored: restored.size,
          }),
      );
    recording.restoredSize = restored.size;
    // Omit assembly metadata and large runtime structures from the report.
    recording.before = {
      camera: recording.before.camera,
      target: recording.before.target,
      size: recording.before.size,
    };
    recording.after = {
      camera: recording.after.camera,
      target: recording.after.target,
      size: recording.after.size,
      busy: recording.after.busy,
    };
    return {
      passed: true,
      resourceStability: {
        baseline: aSamples[0],
        firstCycle,
        secondCycle,
        stable: true,
      },
      samples,
      recording,
    };
  } finally {
    // Await any active short recording before navigation can abort it.
    await page.evaluate(async () => {
      if (window.__placeformRecordingPromise)
        await window.__placeformRecordingPromise;
    });
    await page.setViewportSize(initialViewport);
    await select(initialConcept);
    await frames(2);
  }
}
