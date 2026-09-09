// Run through playwright-cli run-code after removing `export default`.
// Captures the selected concept, exports it, reimports that exact binary and renders it independently.
export default async function capturePackage(page) {
  const id = await page.evaluate(() => window.__PLACEFORM_SCENE.concept);
  const views = [
    ['perspective', 15, '01-hero'],
    ['reverse', 15, '02-reverse'],
    ['east', 15, '03-east'],
    ['west', 15, '04-west'],
    ['aerial', 15, '05-aerial'],
    ['entrance', 15, '06-entrance'],
    ['perspective', 19, '07-dusk'],
  ];
  const files = [];
  for (const [view, hour, name] of views) {
    const waiting = page.waitForEvent('download', { timeout: 120000 });
    await page.evaluate(
      async ({ view, hour }) => {
        const blob = await window.__PLACEFORM_SCENE.capture(view, hour, {
          width: 2560,
          height: 1440,
          quality: 'final',
        });
        const url = URL.createObjectURL(blob),
          a = document.createElement('a');
        a.href = url;
        a.download = 'preview.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      { view, hour },
    );
    const path = `outputs/model-package/${id}/${name}.png`;
    await (await waiting).saveAs(path);
    files.push(path);
  }
  const waiting = page.waitForEvent('download', { timeout: 120000 });
  await page.evaluate(async () => {
    window.__packageGLB = await window.__PLACEFORM_SCENE.glb();
    const url = URL.createObjectURL(
        new Blob([window.__packageGLB], { type: 'model/gltf-binary' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'model.glb';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  await (await waiting).saveAs(`outputs/model-package/${id}/${id}-model.glb`);
  const rendered = page.waitForEvent('download', { timeout: 120000 });
  const audit = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { GLTFLoader } =
      await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const { Sky } =
      await import('/node_modules/three/examples/jsm/objects/Sky.js');
    const { applyLighting, cameraPose } =
      await import('/lib/demo-presentation.ts');
    const { renderPresentation } = await import('/lib/model-render.ts');
    const { createDemo } = await import('/lib/spec.ts');
    const binary = window.__packageGLB;
    delete window.__packageGLB;
    const jsonLength = new DataView(binary).getUint32(12, true),
      json = JSON.parse(
        new TextDecoder().decode(new Uint8Array(binary, 20, jsonLength)),
      );
    const gltf = await new GLTFLoader().parseAsync(binary, '');
    const root = gltf.scene.children[0];
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(2560, 1440);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    scene.add(gltf.scene);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: '#8a8e76', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);
    const sun = new THREE.DirectionalLight('#fff1d8', 3.2);
    sun.name = 'sun';
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, {
      left: -101,
      right: 101,
      top: 92,
      bottom: -92,
      near: 1,
      far: 310,
    });
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00008;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    const fill = new THREE.HemisphereLight('#dcebf6', '#747962', 1.1);
    fill.name = 'sky-fill';
    scene.add(fill);
    const envScene = new THREE.Scene(),
      sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = 4;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.003;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.set(-0.6, 0.75, 0.8);
    envScene.add(sky);
    const pmrem = new THREE.PMREMGenerator(renderer),
      env = pmrem.fromScene(envScene, 0.02, 0.1, 2000);
    scene.environment = env.texture;
    const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.15, 900),
      spec = { ...createDemo(), concept: window.__PLACEFORM_SCENE.concept };
    spec.site = { ...spec.site, rotation: 90 };
    const pose = cameraPose(spec, 'perspective');
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    const materials = new Set(),
      textures = new Set();
    let meshes = 0,
      triangles = 0;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      meshes++;
      triangles +=
        ((o.geometry.index?.count ?? o.geometry.attributes.position.count) /
          3) *
        (o.isInstancedMesh ? o.count : 1);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      }
    });
    applyLighting(scene, root, renderer, 15, 'final');
    await renderer.compileAsync(scene, camera);
    renderPresentation(renderer, scene, camera, 2560, 1440);
    const blob = await new Promise((resolve) =>
      renderer.domElement.toBlob(resolve, 'image/png'),
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'reimport.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const result = {
      concept: spec.concept,
      bytes: binary.byteLength,
      meshes,
      triangles,
      materials: materials.size,
      textures: textures.size,
      embeddedImages: json.images?.length ?? 0,
      externalImages: (json.images ?? []).filter((i) => i.uri).length,
      externalBuffers: (json.buffers ?? []).filter((b) => b.uri).length,
      extensions: json.extensionsUsed,
      units: root.userData.sculptRuntime?.units,
      assemblies: root.children.map((o) => ({
        name: o.name,
        id: o.userData.partId,
      })),
      size: bounds.getSize(new THREE.Vector3()).toArray(),
      runtime: root.userData.sculptRuntime,
    };
    if (
      result.externalImages ||
      result.externalBuffers ||
      result.units !== 'metres' ||
      textures.size < 20
    )
      throw new Error(
        'GLB packaging validation failed: ' + JSON.stringify(result),
      );
    const geometries = new Set();
    scene.traverse((o) => {
      if (o.isMesh) geometries.add(o.geometry);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    ground.material.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
    env.dispose();
    pmrem.dispose();
    sun.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    return result;
  });
  await (
    await rendered
  ).saveAs(`outputs/model-package/${id}/08-reimport-check.png`);
  const report = page.waitForEvent('download', { timeout: 120000 });
  await page.evaluate((audit) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, audit);
  await (await report).saveAs(`outputs/model-package/qa/${id}-glb.json`);
  return {
    concept: id,
    files,
    glbBytes: audit.bytes,
    triangles: audit.triangles,
    textures: audit.textures,
  };
}
