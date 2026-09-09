import * as THREE from 'three';
import { applyLighting, createStudioEnvironment } from './demo-presentation';
import { awaitModelTextures } from './models/materials';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import {
  BufferTarget,
  CanvasSource,
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  canEncodeVideo,
  Quality,
} from 'mediabunny';
import { evaluateSequence, type CinematicSequence } from './cinematic-sequence';
import { type ModelSnapshot, sameFilmIdentity } from './cinematic-model';

export const nextPaint = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException('Rendering cancelled.', 'AbortError');
}
export async function filmCodec(check: typeof canEncodeVideo = canEncodeVideo) {
  const config = {
    width: 1920,
    height: 1080,
    quality: new Quality({ bitrate: 18_000_000 }),
  };
  if (await check('avc', config))
    return {
      codec: 'avc' as const,
      extension: 'mp4' as const,
      mime: 'video/mp4',
    };
  if (await check('vp9', config))
    return {
      codec: 'vp9' as const,
      extension: 'webm' as const,
      mime: 'video/webm',
    };
  throw new Error(
    'This browser cannot encode cinematic video. Open this project in a browser with WebCodecs video encoding.',
  );
}

/** Dedicated renderer: preview controls, resizing and unmounts cannot change exported frames. */
export class CinematicRenderer {
  readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bokeh: BokehPass;
  private environment: THREE.WebGLRenderTarget;
  private ground: THREE.Mesh;
  private lost = false;
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };
  constructor(
    private snapshot: ModelSnapshot,
    private sequence: CinematicSequence,
    width = 1920,
    height = 1080,
  ) {
    if (!sameFilmIdentity(snapshot.identity, sequence.source))
      throw new Error('The camera sequence belongs to another model.');
    this.canvas.width = width;
    this.canvas.height = height;
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Video compositing is unavailable.');
    this.context = context;
    this.gl = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.gl.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.gl.setPixelRatio(1);
    this.gl.setSize(width, height, false);
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 0.95;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(
      40,
      width / height,
      sequence.near,
      sequence.far,
    );
    this.scene.add(snapshot.model);
    const fill = new THREE.HemisphereLight();
    fill.name = 'sky-fill';
    const sun = new THREE.DirectionalLight();
    sun.name = 'sun';
    this.scene.add(fill, sun, sun.target);
    this.environment = createStudioEnvironment(this.gl);
    this.scene.environment = this.environment.texture;
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: '#8a8e76', roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -1;
    applyLighting(
      this.scene,
      snapshot.model,
      this.gl,
      snapshot.spec.hour,
      'final',
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(this.gl, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, {
      focus: 40,
      aperture: 0.00009,
      maxblur: 0.0014,
    });
    this.composer.addPass(this.bokeh);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(width, height);
  }
  private preparation?: Promise<void>;
  ready() {
    return (this.preparation ??= awaitModelTextures(this.snapshot.model).then(
      async () => {
        await this.gl.compileAsync(this.scene, this.camera);
      },
    ));
  }
  render(frame: number) {
    if (this.lost)
      throw new Error(
        'The graphics context was lost. Please reload and render this saved take again.',
      );
    const sample = evaluateSequence(this.sequence, frame);
    const draw = (pose: typeof sample.first, alpha: number) => {
      this.camera.position.copy(pose.position);
      this.camera.setFocalLength(pose.lens);
      this.camera.lookAt(pose.target);
      this.camera.updateMatrixWorld(true);
      this.bokeh.enabled = pose.focus;
      this.bokeh.materialBokeh.uniforms.focus.value = pose.position.distanceTo(
        pose.target,
      );
      this.composer.render(1 / this.sequence.fps);
      this.context.globalAlpha = alpha;
      this.context.drawImage(this.gl.domElement, 0, 0);
    };
    draw(sample.first, 1);
    if (sample.second) draw(sample.second, sample.mix);
    this.context.globalAlpha = 1;
    return this.canvas;
  }
  async thumbnail(frame = 72) {
    await this.ready();
    this.render(frame);
    return new Promise<Blob>((resolve, reject) =>
      this.canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Could not capture the model.')),
        'image/png',
      ),
    );
  }
  dispose() {
    this.scene.remove(this.snapshot.model);
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.environment.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Light && 'shadow' in o)
        (o as THREE.DirectionalLight).shadow?.dispose();
    });
    this.gl.domElement.removeEventListener(
      'webglcontextlost',
      this.contextLost,
    );
    this.gl.dispose();
    this.gl.forceContextLoss();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}

export async function renderFilm(
  snapshot: ModelSnapshot,
  sequence: CinematicSequence,
  onProgress: (frame: number) => void,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const format = await filmCodec();
  throwIfAborted(signal);
  const renderer = new CinematicRenderer(snapshot, sequence);
  const target = new BufferTarget();
  const output = new Output({
    target,
    format:
      format.codec === 'avc'
        ? new Mp4OutputFormat({ fastStart: 'in-memory' })
        : new WebMOutputFormat(),
  });
  const source = new CanvasSource(renderer.canvas, {
    codec: format.codec,
    quality: new Quality({ bitrate: 18_000_000 }),
    latencyMode: 'quality',
    keyFrameInterval: 1,
  });
  output.addVideoTrack(source, { frameRate: sequence.fps });
  try {
    await renderer.ready();
    throwIfAborted(signal);
    await output.start();
    for (let frame = 0; frame < sequence.frames; frame++) {
      throwIfAborted(signal);
      renderer.render(frame);
      await source.add(frame / sequence.fps, 1 / sequence.fps);
      onProgress(frame + 1);
      await nextPaint();
    }
    throwIfAborted(signal);
    source.close();
    await output.finalize();
    throwIfAborted(signal);
    if (!target.buffer?.byteLength)
      throw new Error('The video encoder returned an empty film.');
    return {
      blob: new Blob([target.buffer], { type: format.mime }),
      extension: format.extension,
    };
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    renderer.dispose();
  }
}
