import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { seeded } from './models/geometry';
/** Final stills add contact occlusion without changing geometry, palette, or the lighting rig. */
export function renderPresentation(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  const originalOverride = scene.overrideMaterial,
    autoClear = renderer.autoClear,
    clearColor = renderer.getClearColor(new THREE.Color()),
    clearAlpha = renderer.getClearAlpha();
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);
  composer.setSize(width, height);
  const base = new RenderPass(scene, camera),
    ao = new GTAOPass(scene, camera, width, height),
    output = new OutputPass();
  ao.updateGtaoMaterial({
    radius: 1.4,
    thickness: 1,
    distanceExponent: 2,
    distanceFallOff: 0.7,
    scale: 1,
    samples: 16,
    screenSpaceRadius: false,
  });
  ao.blendIntensity = 0.65;
  ao.updatePdMaterial({ radius: 5, samples: 16 });
  const random = seeded(7303),
    noise = ao.pdNoiseTexture.image.data;
  if (noise)
    for (let i = 0; i < noise.length; i++)
      noise[i] = Math.floor(random() * 255);
  ao.pdNoiseTexture.needsUpdate = true;
  const originalRender = ao.render.bind(ao);
  ao.render = (...args) => {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m.transparent || m.alphaTest > 0)) {
        hidden.push(o);
        o.visible = false;
      }
    });
    try {
      originalRender(...args);
    } finally {
      hidden.forEach((o) => {
        o.visible = true;
      });
    }
  };
  composer.addPass(base);
  composer.addPass(ao);
  composer.addPass(output);
  try {
    composer.render();
  } finally {
    scene.overrideMaterial = originalOverride;
    renderer.autoClear = autoClear;
    renderer.setClearColor(clearColor, clearAlpha);
    base.dispose();
    ao.gtaoMaterial.dispose();
    ao.dispose();
    output.dispose();
    composer.dispose();
  }
}
