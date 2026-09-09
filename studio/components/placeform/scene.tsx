'use client';
// Imperative rendering and capture transactions intentionally live outside React Compiler.
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  Component,
  type ReactNode,
} from 'react';
import {
  Canvas,
  useThree,
  useFrame,
  type ThreeEvent,
} from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { watchContextLoss } from '@/lib/scene-availability';
import { exportModel } from '@/lib/model-export';
import {
  filmIdentity,
  sameFilmIdentity,
  snapshotModel,
  type FilmIdentity,
  type ModelSnapshot,
} from '@/lib/cinematic-model';
import { disposeArchitecture } from '@/lib/architecture';
import { buildDemoModel } from '@/lib/demo-models';
import { awaitModelTextures } from '@/lib/models/materials';
import { renderPresentation } from '@/lib/model-render';
import {
  applyLighting,
  createStudioEnvironment,
  cameraPose,
  entrances,
  type PreviewView,
  type CaptureOptions,
} from '@/lib/demo-presentation';
import type { BuildingSpec, Feature } from '@/lib/spec';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
export { cameraPose } from '@/lib/demo-presentation';
export type SceneStatus = 'loading' | 'ready' | 'unavailable';
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
  const [x, y, z] = entrances[s.concept];
  const shots: Shot[] = [
    {
      id: 'approach',
      name: 'The approach',
      description: 'A measured arrival along the planted street edge.',
      seconds: 6,
      from: [x + 35, 12, z + 50],
      to: [x + 18, 8, z + 32],
      target: [x, y, z],
    },
    {
      id: 'walkaround',
      name: 'At walking pace',
      description: 'Follow the facade rhythm toward the glazed entrance.',
      seconds: 8,
      from: [x - 18, 2.2, z + 13],
      to: [x + 18, 2.2, z + 13],
      target: [x, y, z],
    },
    {
      id: 'detail',
      name: 'Material & shadow',
      description: 'Trace the roof edge, glazing and material detail.',
      seconds: 5,
      from: [x + 12, y + 4, z + 19],
      to: [x + 19, y + 5, z + 16],
      target: [x, y + 1, z],
    },
    {
      id: 'reveal',
      name: 'The wider picture',
      description: 'Rise above the roof to reveal the campus and working edge.',
      seconds: 8,
      from: [93, 37, 112],
      to: [119, 88, 152],
      target: [0, 5, 0],
    },
  ];
  const angle = (-(s.site.rotation - 90) * Math.PI) / 180;
  const rotate = (v: [number, number, number]) =>
    new THREE.Vector3(...v)
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle)
      .toArray() as [number, number, number];
  return shots.map((shot) => ({
    ...shot,
    from: rotate(shot.from),
    to: rotate(shot.to),
    target: rotate(shot.target),
  }));
}
export type SceneAPI = {
  concept: BuildingSpec['concept'];
  snapshot: (expected: FilmIdentity) => ModelSnapshot;
  reset: () => void;
  capture: (
    view?: PreviewView,
    hour?: number,
    options?: CaptureOptions,
  ) => Promise<Blob>;
  glb: () => Promise<ArrayBuffer>;
  record: (shot: Shot, onProgress: (p: number) => void) => Promise<Blob>;
  frames: (
    shot: Shot,
    options?: CaptureOptions,
  ) => Promise<{ first: Blob; last: Blob }>;
  play: (shot?: Shot) => void;
  diagnostics: () => {
    concept: string;
    camera: number[];
    target: number[];
    size: number[];
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
    busy: boolean;
    visible: boolean;
    parts: unknown;
  };
};
function Model({
  spec,
  onSelect,
  apiRef,
  walk,
  visible,
}: {
  spec: BuildingSpec;
  onSelect: (f: Feature) => void;
  apiRef: (api: SceneAPI) => void;
  walk: boolean;
  visible: boolean;
}) {
  const { gl, scene, camera, setFrameloop, get } = useThree();
  const mounted = useRef(true);
  const controls = useRef<OrbitControlsImpl>(null);
  const group = useMemo(() => buildDemoModel(spec.concept), [spec.concept]);
  const current = useRef(group);
  current.current = group;
  const live = useRef({ spec, visible });
  live.current = { spec, visible };
  const queue = useRef<Promise<void>>(Promise.resolve());
  const busy = useRef(false),
    recording = useRef(false),
    moving = useRef(true),
    keys = useRef(new Set<string>());
  const abortRecord = useRef<(() => void) | undefined>(undefined);
  const animation = useRef<{
    shot: Shot;
    start: number;
    onProgress?: (p: number) => void;
    done?: () => void;
  } | null>(null);
  const targetPose = useRef(cameraPose(spec, spec.view));
  const syncLoop = () =>
    setFrameloop(
      live.current.visible || recording.current || !!animation.current
        ? 'always'
        : 'never',
    );
  const setPose = (position: THREE.Vector3, target: THREE.Vector3) => {
    camera.position.copy(position);
    controls.current?.target.copy(target);
    camera.lookAt(target);
    if (!busy.current) controls.current?.update();
  };
  const enqueue = <T,>(run: () => Promise<T>): Promise<T> => {
    const captured = group;
    const result = queue.current.then(() => {
      if (!mounted.current || current.current !== captured)
        throw new Error('The selected model changed. Start the export again.');
      return run();
    });
    queue.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRecord.current?.();
    };
  }, []);
  useEffect(
    () => () => {
      abortRecord.current?.();
      void queue.current.then(() => {
        if (!mounted.current || current.current !== group)
          disposeArchitecture(group);
      });
    },
    [group],
  );
  useEffect(() => {
    group.rotation.y = (-(spec.site.rotation - 90) * Math.PI) / 180;
    group.updateMatrixWorld(true);
  }, [group, spec.site.rotation]);
  useEffect(() => {
    targetPose.current = cameraPose(spec, spec.view);
    moving.current = true;
  }, [spec.concept, spec.view, spec.site.rotation]);
  useEffect(() => {
    if (!visible) keys.current.clear();
    syncLoop();
  }, [visible]);
  useEffect(() => {
    const map = createStudioEnvironment(gl);
    scene.environment = map.texture;
    return () => {
      scene.environment = null;
      map.dispose();
    };
  }, [gl, scene]);
  useEffect(() => {
    if (!busy.current) applyLighting(scene, group, gl, spec.hour);
  }, [spec.hour, group, scene, gl]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.matches('input,textarea,select') ||
        !live.current.visible
      )
        return;
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
  useFrame((_, delta) => {
    if (busy.current && !recording.current) return;
    if (recording.current) {
      gl.setPixelRatio(1);
      const size = gl.getSize(new THREE.Vector2());
      if (size.x !== 1280 || size.y !== 720) gl.setSize(1280, 720, false);
      const p = camera as THREE.PerspectiveCamera;
      if (p.aspect !== 16 / 9) {
        p.aspect = 16 / 9;
        p.updateProjectionMatrix();
      }
    }
    const dt = Math.min(delta, 0.1),
      a = animation.current;
    if (a) {
      const t = Math.min(
          1,
          (performance.now() - a.start) / (a.shot.seconds * 1000),
        ),
        s = t * t * (3 - 2 * t);
      setPose(
        new THREE.Vector3(...a.shot.from).lerp(
          new THREE.Vector3(...a.shot.to),
          s,
        ),
        new THREE.Vector3(...a.shot.target),
      );
      a.onProgress?.(Math.round(t * 100));
      gl.render(scene, camera);
      if (t === 1) {
        animation.current = null;
        a.done?.();
        syncLoop();
      }
      return;
    }
    if (moving.current && !busy.current) {
      camera.position.lerp(targetPose.current.position, 1 - Math.exp(-dt * 5));
      controls.current?.target.lerp(
        targetPose.current.target,
        1 - Math.exp(-dt * 5),
      );
      controls.current?.update();
      if (camera.position.distanceTo(targetPose.current.position) < 0.02)
        moving.current = false;
    }
    if (walk && keys.current.size && !busy.current) {
      moving.current = false;
      const d = new THREE.Vector3();
      camera.getWorldDirection(d);
      d.y = 0;
      d.normalize();
      const side = new THREE.Vector3().crossVectors(d, camera.up).normalize(),
        v = new THREE.Vector3();
      if (keys.current.has('w') || keys.current.has('arrowup')) v.add(d);
      if (keys.current.has('s') || keys.current.has('arrowdown')) v.sub(d);
      if (keys.current.has('d') || keys.current.has('arrowright')) v.add(side);
      if (keys.current.has('a') || keys.current.has('arrowleft')) v.sub(side);
      v.multiplyScalar(dt * 8);
      camera.position.add(v);
      camera.position.y = 1.7;
      controls.current?.target.add(v);
      controls.current?.update();
    }
    gl.render(scene, camera);
  }, 1);
  useEffect(() => {
    async function transaction<T>(
      action: () => Promise<T>,
      isRecord = false,
    ): Promise<T> {
      const oldLayout = { ...get().size },
        oldSelection = [
          live.current.spec.concept,
          live.current.spec.view,
          live.current.spec.site.rotation,
        ].join(':'),
        oldSize = gl.getSize(new THREE.Vector2()),
        oldRatio = gl.getPixelRatio(),
        oldTarget = gl.getRenderTarget(),
        viewport = gl.getViewport(new THREE.Vector4()),
        scissor = gl.getScissor(new THREE.Vector4()),
        scissorTest = gl.getScissorTest();
      const oldCamera = camera.clone(),
        oldAim = controls.current?.target.clone(),
        oldEnabled = controls.current?.enabled ?? true,
        oldMoving = moving.current,
        oldAnimation = animation.current,
        start = performance.now();
      busy.current = true;
      recording.current = isRecord;
      animation.current = null;
      moving.current = false;
      if (controls.current) controls.current.enabled = false;
      try {
        return await action();
      } finally {
        abortRecord.current = undefined;
        if (mounted.current) {
          const unchanged =
            oldSelection ===
            [
              live.current.spec.concept,
              live.current.spec.view,
              live.current.spec.site.rotation,
            ].join(':');
          animation.current = unchanged ? oldAnimation : null;
          if (unchanged && oldAnimation)
            oldAnimation.start += performance.now() - start;
          recording.current = false;
          (camera as THREE.PerspectiveCamera).copy(
            oldCamera as THREE.PerspectiveCamera,
          );
          if (oldAim) controls.current?.target.copy(oldAim);
          if (controls.current) controls.current.enabled = oldEnabled;
          const layout = get().size,
            changed =
              layout.width !== oldLayout.width ||
              layout.height !== oldLayout.height;
          gl.setPixelRatio(changed ? get().viewport.dpr : oldRatio);
          gl.setSize(
            changed ? Math.max(1, layout.width) : oldSize.x,
            changed ? Math.max(1, layout.height) : oldSize.y,
            false,
          );
          gl.setRenderTarget(oldTarget);
          if (!changed) gl.setViewport(viewport);
          else {
            const p = camera as THREE.PerspectiveCamera;
            p.aspect = Math.max(1, layout.width) / Math.max(1, layout.height);
            p.updateProjectionMatrix();
          }
          gl.setScissor(scissor);
          gl.setScissorTest(scissorTest);
          moving.current = unchanged ? oldMoving : true;
          if (!unchanged)
            targetPose.current = cameraPose(
              live.current.spec,
              live.current.spec.view,
            );
          busy.current = false;
          applyLighting(scene, current.current, gl, live.current.spec.hour);
          syncLoop();
        } else {
          busy.current = false;
          recording.current = false;
          animation.current = null;
        }
      }
    }
    async function captureAt(
      position: THREE.Vector3,
      target: THREE.Vector3,
      hour: number,
      options: CaptureOptions = {},
    ): Promise<Blob> {
      const width = options.width ?? 1600,
        height = options.height ?? 900;
      if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 64 ||
        height < 64 ||
        width > 4096 ||
        height > 4096
      )
        throw new Error(
          'Capture dimensions must be whole numbers from 64 to 4096.',
        );
      return transaction(async () => {
        const captureCamera = (camera as THREE.PerspectiveCamera).clone();
        captureCamera.aspect = width / height;
        captureCamera.position.copy(position);
        captureCamera.lookAt(target);
        captureCamera.updateProjectionMatrix();
        applyLighting(scene, group, gl, hour, options.quality ?? 'interactive');
        await awaitModelTextures(group);
        await gl.compileAsync(scene, captureCamera);
        if (!mounted.current || current.current !== group)
          throw new Error('The selected model changed during capture.');
        applyLighting(scene, group, gl, hour, options.quality ?? 'interactive');
        gl.setPixelRatio(1);
        gl.setSize(width, height, false);
        gl.setViewport(0, 0, width, height);
        gl.setRenderTarget(null);
        gl.setScissorTest(false);
        if (options.quality === 'final')
          renderPresentation(gl, scene, captureCamera, width, height);
        else gl.render(scene, captureCamera);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('PNG capture is unavailable.');
        context.drawImage(gl.domElement, 0, 0);
        return new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(new Error('Could not encode the model view.')),
            'image/png',
          ),
        );
      });
    }
    const api: SceneAPI = {
      concept: spec.concept,
      snapshot: (expected) => {
        if (
          !mounted.current ||
          current.current !== group ||
          busy.current ||
          gl.getContext().isContextLost() ||
          !sameFilmIdentity(expected, filmIdentity(live.current.spec)) ||
          !sameFilmIdentity(expected, filmIdentity(spec))
        )
          throw new Error(
            'The selected model is still loading. Try again when it is ready.',
          );
        return snapshotModel(group, live.current.spec);
      },
      reset: () => {
        if (busy.current) return;
        targetPose.current = cameraPose(
          live.current.spec,
          live.current.spec.view,
        );
        moving.current = true;
      },
      capture: (view = spec.view, hour = spec.hour, options) =>
        enqueue(() => {
          const p = cameraPose(spec, view);
          return captureAt(p.position, p.target, hour, options);
        }),
      frames: (shot, options) =>
        enqueue(async () => ({
          first: await captureAt(
            new THREE.Vector3(...shot.from),
            new THREE.Vector3(...shot.target),
            spec.hour,
            options,
          ),
          last: await captureAt(
            new THREE.Vector3(...shot.to),
            new THREE.Vector3(...shot.target),
            spec.hour,
            options,
          ),
        })),
      glb: () =>
        enqueue(() =>
          transaction(async () => {
            applyLighting(scene, group, gl, 15);
            return exportModel(group);
          }),
        ),
      play: (shot) => {
        if (busy.current) return;
        moving.current = false;
        animation.current = shot ? { shot, start: performance.now() } : null;
        syncLoop();
      },
      record: (shot, onProgress) =>
        enqueue(() =>
          transaction(async () => {
            if (!('MediaRecorder' in window))
              throw new Error(
                'Video capture is unavailable. Export reference frames instead.',
              );
            const mime = [
              'video/mp4;codecs=avc1.42E01E',
              'video/webm;codecs=vp9',
              'video/webm',
            ].find((v) => MediaRecorder.isTypeSupported(v));
            if (!mime)
              throw new Error('No supported video encoder is available.');
            await awaitModelTextures(group);
            let stream: MediaStream | undefined;
            try {
              gl.setPixelRatio(1);
              gl.setSize(1280, 720, false);
              const p = camera as THREE.PerspectiveCamera;
              p.aspect = 16 / 9;
              p.updateProjectionMatrix();
              applyLighting(scene, group, gl, spec.hour);
              stream = gl.domElement.captureStream(30);
              const recorder = new MediaRecorder(stream, {
                mimeType: mime,
                videoBitsPerSecond: 12000000,
              });
              const chunks: Blob[] = [];
              return await new Promise<Blob>((resolve, reject) => {
                let failed = false;
                recorder.ondataavailable = (e) => {
                  if (e.data.size) chunks.push(e.data);
                };
                recorder.onerror = () => {
                  failed = true;
                  reject(new Error('Clip recording failed.'));
                };
                recorder.onstop = () => {
                  if (!failed)
                    resolve(new Blob(chunks, { type: mime.split(';')[0] }));
                };
                abortRecord.current = () => {
                  failed = true;
                  if (recorder.state !== 'inactive') recorder.stop();
                  reject(
                    new Error(
                      'Recording stopped because the selected model changed.',
                    ),
                  );
                };
                setPose(
                  new THREE.Vector3(...shot.from),
                  new THREE.Vector3(...shot.target),
                );
                gl.render(scene, camera);
                recorder.start(100);
                animation.current = {
                  shot,
                  start: performance.now(),
                  onProgress,
                  done: () => {
                    if (recorder.state !== 'inactive') recorder.stop();
                  },
                };
                syncLoop();
              });
            } finally {
              stream?.getTracks().forEach((t) => t.stop());
            }
          }, true),
        ),
      diagnostics: () => ({
        concept: spec.concept,
        camera: camera.position.toArray(),
        target: controls.current?.target.toArray() ?? [],
        size: gl.getSize(new THREE.Vector2()).toArray(),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        busy: busy.current,
        visible: live.current.visible,
        parts: group.userData.sculptRuntime,
      }),
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#8a8e76" roughness={1} />
      </mesh>
      <OrbitControls
        ref={controls}
        makeDefault
        minDistance={3}
        maxDistance={330}
        maxPolarAngle={Math.PI / 2 - 0.015}
        enableDamping
        dampingFactor={0.08}
        onStart={() => {
          if (busy.current) return;
          moving.current = false;
          animation.current = null;
          syncLoop();
        }}
      />
      <hemisphereLight name="sky-fill" args={['#dcebf6', '#747962', 1.1]} />
      <directionalLight
        name="sun"
        position={[-20, 100, 75]}
        color="#fff1d8"
        intensity={3.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-101}
        shadow-camera-right={101}
        shadow-camera-top={92}
        shadow-camera-bottom={-92}
        shadow-camera-near={1}
        shadow-camera-far={310}
        shadow-normalBias={0.035}
        shadow-bias={-0.00008}
      />
    </>
  );
}
function RendererHealth({
  onStatus,
}: {
  onStatus: (status: SceneStatus) => void;
}) {
  const { gl } = useThree();
  useEffect(
    () => watchContextLoss(gl.domElement, () => onStatus('unavailable')),
    [gl, onStatus],
  );
  return null;
}
class SceneError extends Component<
  { children: ReactNode; onStatus: (status: SceneStatus) => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch() {
    this.props.onStatus('unavailable');
  }
  render() {
    return this.state.error ? (
      <div className="scene-error">
        The 3D view could not start. Enable WebGL, then reload. Concepts and
        image-based video remain available.
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
  onStatus,
  walk = false,
  visible = true,
}: {
  spec: BuildingSpec;
  onSelect: (f: Feature) => void;
  onReady: (api: SceneAPI) => void;
  onStatus: (status: SceneStatus) => void;
  walk?: boolean;
  visible?: boolean;
}) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const rendererStatus = useCallback(
    (status: SceneStatus) => {
      if (status === 'unavailable') setWebgl(false);
      onStatus(status);
    },
    [onStatus],
  );
  const ready = useCallback(
    (api: SceneAPI) => {
      onStatus('ready');
      onReady(api);
    },
    [onStatus, onReady],
  );
  useEffect(() => {
    onStatus('loading');
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      setWebgl(!!probe);
      if (!probe) onStatus('unavailable');
      probe?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      setWebgl(false);
      onStatus('unavailable');
    }
  }, [onStatus]);
  if (webgl !== true)
    return (
      <div className="scene-error">
        {webgl === null
          ? 'Opening the 3D view…'
          : 'WebGL is unavailable. Concepts and image-based video remain available.'}
      </div>
    );
  return (
    <SceneError onStatus={rendererStatus}>
      <Canvas
        aria-label={`Interactive 3D model of ${spec.name}`}
        shadows="percentage"
        dpr={[1, 1.5]}
        camera={{ position: [119, 88, 150], fov: 32, near: 0.15, far: 900 }}
        gl={{
          antialias: true,
          preserveDrawingBuffer: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
        fallback={
          <span>
            Interactive model. Use the camera and daylight controls to explore.
          </span>
        }
      >
        <RendererHealth onStatus={rendererStatus} />
        <Model
          spec={spec}
          onSelect={onSelect}
          apiRef={ready}
          walk={walk}
          visible={visible}
        />
      </Canvas>
    </SceneError>
  );
}
