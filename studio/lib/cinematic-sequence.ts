import * as THREE from 'three';
import type { ModelSnapshot, FilmIdentity } from './cinematic-model';

type V3 = [number, number, number];
export type CinematicShot = {
  id: string;
  name: string;
  description: string;
  points: V3[];
  targets: V3[];
  lens: number;
  focus: boolean;
};
export type CinematicSequence = {
  version: 1;
  source: FilmIdentity;
  width: 1920;
  height: 1080;
  fps: 24;
  seconds: 24;
  frames: 576;
  transitionFrames: 12;
  shots: CinematicShot[];
  bounds: { min: V3; max: V3 };
  near: number;
  far: number;
};
export type ModelAnalysis = {
  bounds: THREE.Box3;
  obstacles: THREE.Box3[];
  features: { name: string; box: THREE.Box3; feature: string }[];
  matrix: THREE.Matrix4;
};
const vec = (v: V3) => new THREE.Vector3(...v);
export const ease = (t: number) => {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

function isFoliageCard(object: THREE.Object3D) {
  if (!(object instanceof THREE.Mesh)) return false;
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return materials.every((material) => material.alphaTest > 0);
}
export function analyzeModel(model: THREE.Group): ModelAnalysis {
  model.updateMatrixWorld(true);
  const inverse = model.matrixWorld.clone().invert();
  const bounds = new THREE.Box3(),
    obstacles: THREE.Box3[] = [],
    features: ModelAnalysis['features'] = [];
  model.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      !object.visible ||
      isFoliageCard(object)
    )
      return;
    object.geometry.computeBoundingBox();
    const local = inverse.clone().multiply(object.matrixWorld);
    const add = (matrix: THREE.Matrix4) => {
      const box = object.geometry.boundingBox!.clone().applyMatrix4(matrix);
      obstacles.push(box);
      if (object.userData.feature !== 'landscape') {
        bounds.union(box);
        if (['facade', 'roof', 'canopy'].includes(object.userData.feature))
          features.push({
            name: object.name,
            box,
            feature: object.userData.feature,
          });
      }
    };
    if (object instanceof THREE.InstancedMesh) {
      for (let i = 0; i < object.count; i++) {
        const instance = new THREE.Matrix4();
        object.getMatrixAt(i, instance);
        add(local.clone().multiply(instance));
      }
    } else add(local);
  });
  if (
    bounds.isEmpty() ||
    !Number.isFinite(bounds.min.length() + bounds.max.length())
  )
    throw new Error('The model has no usable architectural geometry.');
  return { bounds, obstacles, features, matrix: model.matrixWorld.clone() };
}

function curve(points: V3[]) {
  const c = new THREE.CatmullRomCurve3(points.map(vec), false, 'centripetal');
  c.arcLengthDivisions = 400;
  return c;
}
export function shotPose(shot: CinematicShot, progress: number) {
  const t = ease(progress);
  return {
    position: curve(shot.points).getPointAt(t),
    target: curve(shot.targets).getPointAt(t),
    lens: shot.lens,
    focus: shot.focus,
  };
}
export function cameraForPose(
  pose: ReturnType<typeof shotPose>,
  near = 0.15,
  far = 1600,
) {
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, near, far);
  camera.setFocalLength(pose.lens);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld(true);
  return camera;
}
/** Conservative clearance includes the near plane, not just the camera origin. */
export function clearPose(
  pose: ReturnType<typeof shotPose>,
  obstacles: THREE.Box3[],
  clearance = 1.1,
) {
  const camera = cameraForPose(pose);
  const points = [
    pose.position,
    ...[-1, 1].flatMap((x) =>
      [-1, 1].map((y) => new THREE.Vector3(x, y, -1).unproject(camera)),
    ),
  ];
  return points.every((point) =>
    obstacles.every((box) => box.distanceToPoint(point) > clearance),
  );
}
function fits(pose: ReturnType<typeof shotPose>, box: THREE.Box3) {
  const camera = cameraForPose(pose);
  return [box.min.x, box.max.x].every((x) =>
    [box.min.y, box.max.y].every((y) =>
      [box.min.z, box.max.z].every((z) => {
        const p = new THREE.Vector3(x, y, z).project(camera);
        return (
          Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9 && p.z > -1 && p.z < 1
        );
      }),
    ),
  );
}

export function targetVisible(
  pose: ReturnType<typeof shotPose>,
  model: THREE.Group,
) {
  const direction = pose.target.clone().sub(pose.position),
    distance = direction.length();
  const ray = new THREE.Raycaster(
    pose.position,
    direction.normalize(),
    0.15,
    distance - 0.6,
  );
  const opaque: THREE.Object3D[] = [];
  model.traverseVisible((object) => {
    if (object instanceof THREE.Mesh && !isFoliageCard(object))
      opaque.push(object);
  });
  return ray.intersectObjects(opaque, false).length === 0;
}

export function planSequence(snapshot: ModelSnapshot): CinematicSequence {
  const a = analyzeModel(snapshot.model),
    box = a.bounds,
    size = box.getSize(new THREE.Vector3()),
    center = box.getCenter(new THREE.Vector3());
  const radius = Math.hypot(size.x, size.z) / 2;
  const aim: V3 = [center.x, center.y * 0.8, center.z];
  const polar = (angle: number, distance: number, height: number): V3 => [
    center.x + Math.sin((angle * Math.PI) / 180) * distance,
    height,
    center.z + Math.cos((angle * Math.PI) / 180) * distance,
  ];
  const repeated = (target: V3): V3[] => [target, target, target];
  const shots: CinematicShot[] = [
    {
      id: 'dolly',
      name: 'The approach',
      description: 'A deliberate arrival with layered foreground parallax.',
      lens: 35,
      focus: false,
      points: [
        polar(-32, radius * 2.55, size.y * 2.8),
        polar(-25, radius * 2.3, size.y * 2.45),
        polar(-18, radius * 2.15, size.y * 2.2),
      ],
      targets: repeated(aim),
    },
    {
      id: 'orbit',
      name: 'Around the architecture',
      description: 'A sweeping arc traces the silhouette and roof rhythm.',
      lens: 35,
      focus: false,
      points: [-18, 0, 18, 36, 52].map((angle, i) =>
        polar(angle, radius * 2.2, size.y * (2.4 + i * 0.12)),
      ),
      targets: repeated(aim),
    },
    {
      id: 'detail',
      name: 'Material & light',
      description: 'A close lateral study of the facade and its shadows.',
      lens: 65,
      focus: true,
      points: [],
      targets: [],
    },
    {
      id: 'reveal',
      name: 'The wider picture',
      description: 'Rise above the roof and settle into a composed final view.',
      lens: 35,
      focus: false,
      points: [
        polar(30, radius * 2.2, size.y * 1.8),
        polar(40, radius * 2.35, size.y * 3.4),
        polar(48, radius * 2.5, size.y * 4.5),
      ],
      targets: repeated(aim),
    },
  ];
  // Front-facing facade pieces make stable targets across all four model families.
  const candidates = a.features
    .filter(
      (f) => f.feature === 'facade' && /glass|glazing|curtain/i.test(f.name),
    )
    .sort((a, b) => b.box.max.z - a.box.max.z);
  const detail = shots[2];
  const distance = Math.max(23, size.y * 1.9);
  let detailFound = false;
  search: for (const feature of candidates.slice(0, 6)) {
    const target = feature.box.getCenter(new THREE.Vector3());
    target.z = feature.box.max.z + 0.05;
    for (const retreat of [1, 0.7, 0.45])
      for (const elevation of [10, 6, 3, 1]) {
        detail.targets = [-2, 0, 2].map((x) => [
          target.x + x,
          target.y + 1,
          target.z,
        ]);
        detail.points = [-8, 0, 8].map((x) => [
          target.x + x + 8,
          target.y + elevation,
          target.z + distance * retreat,
        ]);
        const visible = Array.from({ length: 49 }, (_, i) =>
          shotPose(detail, i / 48),
        ).every((p) => {
          if (!clearPose(p, a.obstacles)) return false;
          return targetVisible(
            {
              ...p,
              position: p.position.clone().applyMatrix4(a.matrix),
              target: p.target.clone().applyMatrix4(a.matrix),
            },
            snapshot.model,
          );
        });
        if (visible) {
          detailFound = true;
          break search;
        }
      }
  }
  if (!detailFound)
    throw new Error(
      'No unobstructed facade detail path could be found for this model.',
    );
  // Validate complete paths before rendering. Uniform changes keep acceleration smooth.
  for (const shot of shots) {
    let safe = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      safe = Array.from({ length: 145 }, (_, i) =>
        shotPose(shot, i / 144),
      ).every((p) => clearPose(p, a.obstacles) && (shot.focus || fits(p, box)));
      if (safe) break;
      shot.points = shot.points.map(
        (p) =>
          vec(p)
            .sub(vec(shot.targets[1]))
            .multiplyScalar(1.12)
            .add(vec(shot.targets[1]))
            .toArray() as V3,
      );
    }
    if (!safe)
      throw new Error(
        `A safe ${shot.name.toLowerCase()} camera path could not be found.`,
      );
    shot.points = shot.points.map(
      (p) => vec(p).applyMatrix4(a.matrix).toArray() as V3,
    );
    shot.targets = shot.targets.map(
      (p) => vec(p).applyMatrix4(a.matrix).toArray() as V3,
    );
  }
  const world = box.clone().applyMatrix4(a.matrix);
  return {
    version: 1,
    source: snapshot.identity,
    width: 1920,
    height: 1080,
    fps: 24,
    seconds: 24,
    frames: 576,
    transitionFrames: 12,
    shots,
    bounds: { min: world.min.toArray(), max: world.max.toArray() },
    near: 0.15,
    far: Math.max(1600, radius * 20),
  };
}

export function evaluateSequence(sequence: CinematicSequence, frame: number) {
  const f = THREE.MathUtils.clamp(frame, 0, sequence.frames - 1),
    beat = sequence.frames / 4,
    half = sequence.transitionFrames / 2;
  const index = Math.min(3, Math.floor(f / beat));
  const sample = (i: number) => {
    const start = i * beat - (i ? half : 0),
      end = (i + 1) * beat + (i < 3 ? half : -1);
    const progress = THREE.MathUtils.clamp(
      (f - start) / (end - start - (i === 3 ? 12 : 0)),
      0,
      1,
    );
    return { shot: i, ...shotPose(sequence.shots[i], progress) };
  };
  for (let boundary = 1; boundary < 4; boundary++) {
    const at = boundary * beat;
    if (f >= at - half && f < at + half)
      return {
        first: sample(boundary - 1),
        second: sample(boundary),
        mix: ease((f - at + half) / (half * 2)),
      };
  }
  return { first: sample(index), second: undefined, mix: 0 };
}
