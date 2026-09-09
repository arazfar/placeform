// Browser verification for the integrated model-based Film workflow.
export default async function cinematicIntegration(page) {
  const names = [
    'A Terrace Commons Stepped garden terraces',
    'B Folded Horizon Folded metal ribbons',
    'C Civic Dune Curved roofs with open courts',
    'D Lantern Spine Flat roofs and screened plant',
  ];
  const results = [];
  for (const name of names) {
    await page.getByRole('tab', { name: 'Concepts', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('tab', { name: 'Film', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.film-storyboard img').length === 4 &&
        [...document.querySelectorAll('.film-storyboard img')].every(
          (i) => i.complete && i.naturalWidth === 640,
        ),
      null,
      { timeout: 60000 },
    );
    const story = page.locator('.film-storyboard');
    await story.screenshot({
      path: `outputs/model-package/qa/${name[0]}-film-storyboard.png`,
    });
    results.push({
      concept: name[0],
      storyboardImages: await story.locator('img').count(),
      hiddenIdle: await page.evaluate(
        () => !window.__PLACEFORM_SCENE.diagnostics().visible,
      ),
    });
  }
  const roundTrip = await page.evaluate(async () => {
    const { buildDemoModel } = await import('/lib/demo-models.ts');
    const { createDemo } = await import('/lib/spec.ts');
    const { fixedDemoSpec } = await import('/lib/demo-catalog.ts');
    const { snapshotModel, snapshotGLB, restoreSnapshot, disposeSnapshot } =
      await import('/lib/cinematic-model.ts');
    const { planSequence } = await import('/lib/cinematic-sequence.ts');
    const { CinematicRenderer, renderFilm } =
      await import('/lib/cinematic-renderer.ts');
    const { disposeArchitecture } = await import('/lib/architecture.ts');
    const model = buildDemoModel('D');
    const snapshot = snapshotModel(model, fixedDemoSpec(createDemo(), 'D'));
    // Clone before the asynchronous foliage image has loaded, then dispose its source.
    disposeArchitecture(model);
    const glb = await snapshotGLB(snapshot);
    const header = new DataView(await glb.arrayBuffer());
    const json = JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(header.buffer, 20, header.getUint32(12, true)),
      ),
    );
    if (json.images.some((image) => image.uri))
      throw new Error('Snapshot has external textures');
    const restored = await restoreSnapshot(glb, snapshot.spec);
    const shadows = [];
    restored.model.traverse((o) => {
      if (o.isMesh) shadows.push(o.castShadow && o.receiveShadow);
    });
    if (shadows.some((x) => !x))
      throw new Error('Saved-take shadows were lost');
    const sequence = planSequence(restored);
    const renderer = new CinematicRenderer(restored, sequence, 640, 360);
    let thumb;
    try {
      thumb = await renderer.thumbnail();
    } finally {
      renderer.dispose();
    }
    const img = await createImageBitmap(thumb);
    if (img.width !== 640 || img.height !== 360)
      throw new Error('Saved-take thumbnail dimensions');
    img.close();
    const controller = new AbortController();
    controller.abort();
    let abortCaught = false;
    try {
      await renderFilm(restored, sequence, () => {}, controller.signal);
    } catch (e) {
      abortCaught = e.name === 'AbortError';
    }
    if (!abortCaught) throw new Error('Film cancellation ignored');
    const frames = [];
    const rendered = await renderFilm(
      restored,
      { ...sequence, frames: 24 },
      (frame) => frames.push(frame),
    );
    const movieURL = URL.createObjectURL(rendered.blob);
    const video = document.createElement('video');
    video.src = movieURL;
    video.preload = 'metadata';
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    const metadata = {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    };
    URL.revokeObjectURL(movieURL);
    if (
      metadata.width !== 1920 ||
      metadata.height !== 1080 ||
      Math.abs(metadata.duration - 1) > 0.1
    )
      throw new Error(
        'Encoded Film has wrong dimensions/duration: ' +
          JSON.stringify(metadata),
      );
    disposeSnapshot(snapshot);
    disposeSnapshot(restored);
    return {
      glbBytes: glb.size,
      embeddedImages: json.images.length,
      shadowMeshes: shadows.length,
      thumbnailBytes: thumb.size,
      cancellation: true,
      encodedFrames: frames.length,
      videoBytes: rendered.blob.size,
      metadata,
    };
  });
  await page.getByRole('tab', { name: '3D model', exact: true }).click();
  return { results, roundTrip };
}
