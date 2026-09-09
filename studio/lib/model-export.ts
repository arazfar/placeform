import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { awaitModelTextures } from './models/materials';

/** GLTFExporter's metallic/roughness packer needs canvas-backed images, not raw DataTexture images. */
export async function exportModel(root: THREE.Group): Promise<ArrayBuffer> {
  await awaitModelTextures(root);
  const clone = root.clone(true);
  const materials = new Map<THREE.Material, THREE.Material>();
  const textures = new Map<THREE.Texture, THREE.CanvasTexture>();
  function convert(original: THREE.Material) {
    const found = materials.get(original);
    if (found) return found;
    const material = original.clone();
    materials.set(original, material);
    for (const [key, value] of Object.entries(original)) {
      if (!(value instanceof THREE.DataTexture)) continue;
      let texture = textures.get(value);
      if (!texture) {
        const { width, height, data } = value.image;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context || !data)
          throw new Error('Texture export is unavailable.');
        context.putImageData(
          new ImageData(new Uint8ClampedArray(data), width, height),
          0,
          0,
        );
        texture = new THREE.CanvasTexture(canvas);
        texture.name = value.name;
        texture.colorSpace = value.colorSpace;
        texture.wrapS = value.wrapS;
        texture.wrapT = value.wrapT;
        texture.repeat.copy(value.repeat);
        texture.offset.copy(value.offset);
        texture.rotation = value.rotation;
        texture.center.copy(value.center);
        texture.flipY = value.flipY;
        texture.magFilter = value.magFilter;
        texture.minFilter = value.minFilter;
        textures.set(value, texture);
      }
      (material as unknown as Record<string, unknown>)[key] = texture;
    }
    return material;
  }
  try {
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh)
        o.material = Array.isArray(o.material)
          ? o.material.map(convert)
          : convert(o.material);
    });
    clone.updateMatrixWorld(true);
    return (await new GLTFExporter().parseAsync(clone, {
      binary: true,
      onlyVisible: true,
    })) as ArrayBuffer;
  } finally {
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  }
}
