import * as THREE from 'three';
import { exportModel } from './model-export';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { BuildingSpec, ConceptId } from './spec';
import { disposeArchitecture } from './architecture';

export type FilmIdentity = {
  projectId: string;
  concept: ConceptId;
  revision: number;
  hour: number;
  rotation: number;
};
export type ModelSnapshot = {
  identity: FilmIdentity;
  spec: BuildingSpec;
  model: THREE.Group;
};
export const filmIdentity = (s: BuildingSpec): FilmIdentity => ({
  projectId: s.id,
  concept: s.concept,
  revision: s.revision,
  hour: s.hour,
  rotation: s.site.rotation,
});
export const sameFilmIdentity = (a: FilmIdentity, b: FilmIdentity) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Deep ownership matters: switching concepts disposes the interactive model. */
export function snapshotModel(
  model: THREE.Group,
  spec: BuildingSpec,
): ModelSnapshot {
  const clone = model.clone(true);
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    if (!geometries.has(geometry)) geometries.set(geometry, geometry.clone());
    object.geometry = geometries.get(geometry)!;
    const copy = (material: THREE.Material) => {
      if (!materials.has(material)) {
        const owned = material.clone();
        for (const [key, value] of Object.entries(material)) {
          if (!(value instanceof THREE.Texture)) continue;
          if (!textures.has(value)) textures.set(value, value.clone());
          (owned as unknown as Record<string, unknown>)[key] =
            textures.get(value);
        }
        materials.set(material, owned);
      }
      return materials.get(material)!;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(copy)
      : copy(object.material);
  });
  clone.updateMatrixWorld(true);
  return {
    identity: filmIdentity(spec),
    spec: structuredClone(spec),
    model: clone,
  };
}
export async function snapshotGLB(snapshot: ModelSnapshot): Promise<Blob> {
  snapshot.model.userData.filmSource = snapshot.identity;
  const bytes = await exportModel(snapshot.model);
  return new Blob([bytes as ArrayBuffer], { type: 'model/gltf-binary' });
}
export async function restoreSnapshot(
  blob: Blob,
  spec: BuildingSpec,
): Promise<ModelSnapshot> {
  const gltf = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), '');
  // Exporter inserts a scene wrapper; retain the original model transform.
  const model = gltf.scene.children[0] as THREE.Group;
  if (
    !model ||
    !sameFilmIdentity(model.userData.filmSource, filmIdentity(spec))
  ) {
    disposeArchitecture(gltf.scene);
    throw new Error('The saved model does not match this film’s source.');
  }
  gltf.scene.remove(model);
  // glTF stores geometry and lights, but not Three.js shadow participation.
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        if (material.alphaTest > 0) material.shadowSide = THREE.FrontSide;
    }
  });
  model.updateMatrixWorld(true);
  return { model, spec, identity: filmIdentity(spec) };
}
export const disposeSnapshot = (snapshot: ModelSnapshot) =>
  disposeArchitecture(snapshot.model);
