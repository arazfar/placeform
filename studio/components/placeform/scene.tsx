'use client';
// Imperative browser engines and persisted external sessions are intentionally outside React Compiler.
// Native images support local/blob imports. Silent model films have no spoken audio to caption.
import { useEffect, useMemo, useRef, Component, type ReactNode } from 'react';
import {
  Canvas,
  useThree,
  useFrame,
  type ThreeEvent,
} from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildArchitecture, disposeArchitecture } from '@/lib/architecture';
import type { BuildingSpec, Feature, View } from '@/lib/spec';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
export type Shot = {
  id: string;
  name: string;
  description: string;
  seconds: number;
  from: [number, number, number];
  to: [number, number, number];
  target: [number, number, number];
};
export function filmShots(s: BuildingSpec): Shot[] {
  const z = s.width / 2;
  const shots: Shot[] = [
    {
      id: 'approach',
      name: 'The approach',
      description: 'A measured arrival along the planted street edge.',
      seconds: 6,
      from: [-60, 7, z + 42],
      to: [-28, 5, z + 29],
      target: [5, 6, 0],
    },
    {
      id: 'walkaround',
      name: 'At walking pace',
      description: 'Follow the facade rhythm toward the copper entrance.',
      seconds: 8,
      from: [-34, 2.2, z + 13],
      to: [24, 2.2, z + 13],
      target: [12, 5, 0],
    },
    {
      id: 'detail',
      name: 'Material & shadow',
      description: 'Trace the depth of a brick pier and recessed screen.',
      seconds: 5,
      from: [18, 9, z + 9],
      to: [25, 10, z + 6],
      target: [17, 8, z],
    },
    {
      id: 'reveal',
      name: 'The wider picture',
      description:
        'Rise above the roof to reveal the building and its working edge.',
      seconds: 8,
      from: [62, 20, z + 48],
      to: [84, 64, z + 74],
      target: [0, 7, 0],
    },
  ];
  const axis = new THREE.Vector3(0, 1, 0),
    angle = (-(s.site.rotation - 90) * Math.PI) / 180;
  return shots.map((shot) => ({
    ...shot,
    from: new THREE.Vector3(...shot.from)
      .applyAxisAngle(axis, angle)
      .toArray() as [number, number, number],
    to: new THREE.Vector3(...shot.to).applyAxisAngle(axis, angle).toArray() as [
      number,
      number,
      number,
    ],
    target: new THREE.Vector3(...shot.target)
      .applyAxisAngle(axis, angle)
      .toArray() as [number, number, number],
  }));
}
function sunPose(hour: number): [number, number, number] {
  const t = ((hour - 6) / 15) * Math.PI;
  return [-75 * Math.cos(t - 0.5), Math.max(12, 80 * Math.sin(t)), 45];
}
export function cameraPose(
  s: BuildingSpec,
  view: View,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const L = s.length,
    W = s.width,
    H = s.height;
  const positions: Record<View, number[]> = {
    perspective: [L * 0.83, H * 1.35, W * 1.7],
    entrance: [24, 2.2, W / 2 + 21],
    aerial: [L * 0.7, Math.max(L, W) * 0.86, W * 1.12],
    north: [0, H * 0.7, -W * 2.4],
    south: [0, H * 0.7, W * 2.4],
    east: [L * 1.55, H * 0.7, 0],
    west: [-L * 1.55, H * 0.7, 0],
    detail: [19, 9, W / 2 + 11],
  };
  const target =
    view === 'entrance'
      ? [12, 4, W / 2]
      : view === 'detail'
        ? [12, 8, W / 2]
        : [0, H * 0.45, 0];
  const position = new THREE.Vector3(
      ...(positions[view] as [number, number, number]),
    ),
    aim = new THREE.Vector3(...(target as [number, number, number]));
  if (!['north', 'south', 'east', 'west'].includes(view)) {
    const a = (-(s.site.rotation - 90) * Math.PI) / 180;
    position.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
  }
  return { position, target: aim };
}
export type SceneAPI = {
  reset: () => void;
  capture: (view?: View, hour?: number) => Promise<Blob>;
  glb: () => Promise<ArrayBuffer>;
  record: (shot: Shot, onProgress: (p: number) => void) => Promise<Blob>;
  frames: (shot: Shot) => Promise<{ first: Blob; last: Blob }>;
  play: (shot?: Shot) => void;
};
function Model({
  spec,
  onSelect,
  apiRef,
  walk,
}: {
  spec: BuildingSpec;
  onSelect: (f: Feature) => void;
  apiRef: (api: SceneAPI) => void;
  walk: boolean;
}) {
  const { gl, scene, camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const group = useMemo(
    () => buildArchitecture(spec),
    [
      spec.length,
      spec.width,
      spec.height,
      spec.finDepth,
      spec.finSpacing,
      spec.canopyDepth,
      spec.material,
      spec.directions,
      spec.roof,
      spec.landscape,
      spec.concept,
      spec.hour,
    ],
  );
  const animation = useRef<{
      shot: Shot;
      start: number;
      onProgress?: (p: number) => void;
      done?: () => void;
    } | null>(null),
    moving = useRef(true),
    captureBusy = useRef(false),
    keys = useRef(new Set<string>());
  const targetPose = useRef(cameraPose(spec, spec.view));
  useEffect(() => () => disposeArchitecture(group), [group]);
  useEffect(() => {
    group.rotation.y = (-(spec.site.rotation - 90) * Math.PI) / 180;
  }, [group, spec.site.rotation]);
  useEffect(() => {
    targetPose.current = cameraPose(spec, spec.view);
    moving.current = true;
  }, [spec.view, spec.length, spec.width, spec.height, spec.site.rotation]);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const texture = pmrem.fromScene(room, 0.04);
    scene.environment = texture.texture;
    scene.environmentIntensity = 0.48;
    room.dispose();
    return () => {
      scene.environment = null;
      texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,textarea,select')) return;
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  const setPose = (position: THREE.Vector3, target: THREE.Vector3) => {
    camera.position.copy(position);
    controls.current?.target.copy(target);
    camera.lookAt(target);
    controls.current?.update();
  };
  useFrame((_, dt) => {
    if (captureBusy.current) return;
    const a = animation.current;
    if (a) {
      const t = Math.min(
          1,
          (performance.now() - a.start) / (a.shot.seconds * 1000),
        ),
        smooth = t * t * (3 - 2 * t);
      setPose(
        new THREE.Vector3(...a.shot.from).lerp(
          new THREE.Vector3(...a.shot.to),
          smooth,
        ),
        new THREE.Vector3(...a.shot.target),
      );
      a.onProgress?.(Math.round(t * 100));
      if (t === 1) {
        animation.current = null;
        a.done?.();
      }
      return;
    }
    if (moving.current) {
      camera.position.lerp(targetPose.current.position, 1 - Math.exp(-dt * 5));
      controls.current?.target.lerp(
        targetPose.current.target,
        1 - Math.exp(-dt * 5),
      );
      controls.current?.update();
      if (camera.position.distanceTo(targetPose.current.position) < 0.02)
        moving.current = false;
    }
    if (walk && keys.current.size) {
      moving.current = false;
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();
      const side = new THREE.Vector3()
        .crossVectors(direction, camera.up)
        .normalize();
      const v = new THREE.Vector3();
      if (keys.current.has('w') || keys.current.has('arrowup'))
        v.add(direction);
      if (keys.current.has('s') || keys.current.has('arrowdown'))
        v.sub(direction);
      if (keys.current.has('d') || keys.current.has('arrowright')) v.add(side);
      if (keys.current.has('a') || keys.current.has('arrowleft')) v.sub(side);
      v.multiplyScalar(dt * 8);
      camera.position.add(v);
      camera.position.y = 1.7;
      controls.current?.target.add(v);
      controls.current?.update();
    }
  });
  useEffect(() => {
    async function captureAt(
      position: THREE.Vector3,
      target: THREE.Vector3,
      hour = spec.hour,
    ) {
      captureBusy.current = true;
      const oldPos = camera.position.clone(),
        oldTarget = controls.current?.target.clone() || new THREE.Vector3(),
        size = gl.getSize(new THREE.Vector2()),
        ratio = gl.getPixelRatio(),
        aspect = (camera as THREE.PerspectiveCamera).aspect,
        oldBg = scene.background;
      const sun = scene.getObjectByName('sun') as
          | THREE.DirectionalLight
          | undefined,
        oldSunColor = sun?.color.clone(),
        oldSunIntensity = sun?.intensity,
        oldSunPosition = sun?.position.clone(),
        oldFog = scene.fog?.clone(),
        oldEnv = scene.environmentIntensity;
      const hemi = scene.getObjectByName('sky-fill') as
          | THREE.HemisphereLight
          | undefined,
        oldHemiColor = hemi?.color.clone(),
        oldHemiIntensity = hemi?.intensity;
      const glowing = new Map<THREE.MeshStandardMaterial, number>();
      group.traverse((o) => {
        const ms = (o as THREE.Mesh).material;
        if (ms)
          for (const m of Array.isArray(ms) ? ms : [ms])
            if (
              m instanceof THREE.MeshStandardMaterial &&
              m.emissiveIntensity > 0 &&
              m.emissive.getHex() !== 0
            )
              glowing.set(m, m.emissiveIntensity);
      });
      try {
        const dusk = hour >= 18;
        scene.background = new THREE.Color(dusk ? '#495362' : '#d4d9d4');
        if (sun) {
          sun.color.set(dusk ? '#ffc898' : '#fff4df');
          sun.intensity = dusk ? 2.4 : 3.1;
          sun.position.set(...sunPose(hour));
        }
        if (hemi) {
          hemi.color.set(dusk ? '#94a9c1' : '#e7eee7');
          hemi.intensity = dusk ? 0.85 : 1.5;
        }
        scene.environmentIntensity = dusk ? 0.25 : 0.48;
        scene.fog = new THREE.Fog(dusk ? '#495362' : '#d4d9d4', 130, 360);
        for (const m of glowing.keys())
          m.emissiveIntensity = dusk ? 0.65 : 0.12;
        gl.setPixelRatio(1);
        gl.setSize(1600, 900, false);
        (camera as THREE.PerspectiveCamera).aspect = 16 / 9;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        setPose(position, target);
        gl.render(scene, camera);
        const blob = await new Promise<Blob>((resolve, reject) =>
          gl.domElement.toBlob(
            (b) =>
              b
                ? resolve(b)
                : reject(new Error('Could not capture this view.')),
            'image/png',
          ),
        );
        return blob;
      } finally {
        gl.setPixelRatio(ratio);
        gl.setSize(size.x, size.y, false);
        (camera as THREE.PerspectiveCamera).aspect = aspect;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        setPose(oldPos, oldTarget);
        scene.background = oldBg;
        if (sun && oldSunColor) {
          sun.color.copy(oldSunColor);
          sun.intensity = oldSunIntensity!;
          sun.position.copy(oldSunPosition!);
        }
        scene.fog = oldFog || null;
        scene.environmentIntensity = oldEnv;
        if (hemi && oldHemiColor) {
          hemi.color.copy(oldHemiColor);
          hemi.intensity = oldHemiIntensity!;
        }
        for (const [m, value] of glowing) m.emissiveIntensity = value;
        captureBusy.current = false;
      }
    }
    const api: SceneAPI = {
      reset: () => {
        targetPose.current = cameraPose(spec, spec.view);
        moving.current = true;
      },
      capture: async (view = spec.view, hour = spec.hour) => {
        const p = cameraPose(spec, view);
        return captureAt(p.position, p.target, hour);
      },
      glb: () =>
        new Promise((resolve, reject) => {
          group.updateMatrixWorld(true);
          new GLTFExporter().parse(
            group,
            (result) => resolve(result as ArrayBuffer),
            reject,
            { binary: true, onlyVisible: true },
          );
        }),
      frames: async (shot) => ({
        first: await captureAt(
          new THREE.Vector3(...shot.from),
          new THREE.Vector3(...shot.target),
        ),
        last: await captureAt(
          new THREE.Vector3(...shot.to),
          new THREE.Vector3(...shot.target),
        ),
      }),
      play: (shot) => {
        moving.current = false;
        animation.current = shot ? { shot, start: performance.now() } : null;
      },
      record: async (shot, onProgress) => {
        if (!('MediaRecorder' in window))
          throw new Error(
            'Video capture is unavailable in this browser. Export reference frames instead.',
          );
        const mime = [
          'video/mp4;codecs=avc1.42E01E',
          'video/webm;codecs=vp9',
          'video/webm',
        ].find((m) => MediaRecorder.isTypeSupported(m));
        if (!mime)
          throw new Error('This browser has no supported video encoder.');
        const oldSize = gl.getSize(new THREE.Vector2()),
          oldRatio = gl.getPixelRatio(),
          oldAspect = (camera as THREE.PerspectiveCamera).aspect;
        gl.setPixelRatio(1);
        gl.setSize(1280, 720, false);
        (camera as THREE.PerspectiveCamera).aspect = 16 / 9;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        const restore = () => {
          gl.setPixelRatio(oldRatio);
          gl.setSize(oldSize.x, oldSize.y, false);
          (camera as THREE.PerspectiveCamera).aspect = oldAspect;
          (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        };
        const stream = gl.domElement.captureStream(30);
        const recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 8000000,
        });
        const chunks: Blob[] = [];
        moving.current = false;
        return new Promise<Blob>((resolve, reject) => {
          recorder.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data);
          };
          recorder.onerror = () => {
            restore();
            stream.getTracks().forEach((t) => t.stop());
            reject(new Error('Clip recording failed.'));
          };
          recorder.onstop = () => {
            restore();
            stream.getTracks().forEach((t) => t.stop());
            resolve(new Blob(chunks, { type: mime.split(';')[0] }));
          };
          recorder.start(100);
          animation.current = {
            shot,
            start: performance.now(),
            onProgress,
            done: () => recorder.stop(),
          };
        });
      },
    };
    apiRef(api);
  }, [spec, group, gl, scene, camera, apiRef]);
  function click(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    const f = e.object.userData.feature as Feature;
    if (f) onSelect(f);
  }
  return (
    <>
      <primitive object={group} onClick={click} />
      <OrbitControls
        ref={controls}
        makeDefault
        minDistance={3}
        maxDistance={230}
        maxPolarAngle={Math.PI / 2 - 0.015}
        enableDamping
        dampingFactor={0.08}
        onStart={() => {
          moving.current = false;
          animation.current?.done?.();
          animation.current = null;
        }}
      />
      <hemisphereLight
        name="sky-fill"
        args={[
          spec.hour >= 18 ? '#94a9c1' : '#e7eee7',
          '#636854',
          spec.hour >= 18 ? 0.85 : 1.5,
        ]}
      />
      <directionalLight
        name="sun"
        position={sunPose(spec.hour)}
        color={spec.hour >= 18 ? '#ffd2a1' : '#fff4df'}
        intensity={spec.hour >= 18 ? 2.4 : 3.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-95}
        shadow-camera-right={95}
        shadow-camera-top={85}
        shadow-camera-bottom={-85}
        shadow-camera-near={1}
        shadow-camera-far={240}
        shadow-normalBias={0.03}
        shadow-bias={-0.00015}
      />
      <color
        attach="background"
        args={[spec.hour >= 18 ? '#495362' : '#d4d9d4']}
      />
      <fog
        attach="fog"
        args={[spec.hour >= 18 ? '#495362' : '#d4d9d4', 130, 360]}
      />
    </>
  );
}
class SceneError extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="scene-error">
        The 3D view could not start. Enable WebGL, then reload. Concepts and
        schematic drawings remain available.
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function Scene({
  spec,
  onSelect,
  onReady,
  walk = false,
}: {
  spec: BuildingSpec;
  onSelect: (f: Feature) => void;
  onReady: (api: SceneAPI) => void;
  walk?: boolean;
}) {
  return (
    <SceneError>
      <Canvas
        shadows="percentage"
        dpr={[1, 1.7]}
        camera={{ position: [75, 24, 84], fov: 42, near: 0.1, far: 600 }}
        gl={{
          antialias: true,
          preserveDrawingBuffer: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
        fallback={
          <div className="scene-error">
            WebGL is unavailable. You can still explore concepts and export
            drawings.
          </div>
        }
      >
        <Model spec={spec} onSelect={onSelect} apiRef={onReady} walk={walk} />
      </Canvas>
    </SceneError>
  );
}
