'use client';
import { filmReference } from '@/lib/cinematic';
import {
  demoConcepts,
  fixedDemoSpec,
  DEMO_STORAGE_KEY,
} from '@/lib/demo-catalog';
// Imperative browser engines and persisted external sessions are intentionally outside React Compiler.
// Native images support local/blob imports. Silent model films have no spoken audio to caption.
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from 'react';
import {
  ArrowUpRight,
  Box,
  MapPin,
  Layers,
  Compass,
  Film,
  Mic,
  MicOff,
  Check,
  ArrowRight,
  Undo2,
  Redo2,
  Download,
  Upload,
  ExternalLink,
  ChevronDown,
  History,
  Settings2,
  X,
  Sun,
  Move3D,
  Footprints,
  Image as ImageIcon,
  FileJson,
  BookOpen,
  Send,
  RotateCcw,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  concepts,
  createDemo,
  canOpenModel,
  clone,
  conceptImage,
  featureLabels,
  validSpec,
  type BuildingSpec,
  type ConceptId,
  type Feature,
  type View,
  type SavedState,
} from '@/lib/spec';
import { executeAction, parseCommand, type DesignAction } from '@/lib/commands';
import {
  encodeProjects,
  decodeProjects,
  importedImage,
} from '@/lib/persistence';
import {
  connectVoice,
  type VoiceConnection,
  type VoiceState,
} from '@/lib/voice';
import { download } from '@/lib/download';
import { sources, photos, impacts } from '@/lib/research';
import { siteArea, siteAt } from '@/lib/site';
import { drawingSVG, sheets, type SheetId } from '@/lib/drawings';
import { drawingPDF, reviewPackage, taskPackage } from '@/lib/exports';
import type { SceneAPI } from './scene';
import { moodBoardUrl, withinPresidio } from '@/lib/presidio';
import { loadMedia, saveMedia } from '@/lib/media-store';
import { freshSiteDesign } from '@/lib/site-workflow';
import type { GenerationRequest } from './generation-panel';
import ContextGallery from './context-gallery';
const Scene = lazy(() => import('./scene'));
const SiteMap = lazy(() => import('./site-map'));
const FilmPanel = lazy(() => import('./film-panel'));
const stages = [
  { id: 'place', label: 'Place', icon: MapPin },
  { id: 'concepts', label: 'Concepts', icon: Layers },
  { id: 'model', label: '3D model', icon: Box },
  { id: 'film', label: 'Film', icon: Film },
];
const viewNames: Record<View, string> = {
  perspective: 'Perspective',
  entrance: 'Pedestrian',
  aerial: 'Aerial',
  south: 'South',
  north: 'North',
  east: 'East',
  west: 'West',
  detail: 'Detail',
};
function Tool({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={label}
            className={`tool-button ${active ? 'active' : ''}`}
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
export default function Studio() {
  const [spec, setSpec] = useState<BuildingSpec>(() =>
      fixedDemoSpec(createDemo()),
    ),
    [past, setPast] = useState<BuildingSpec[]>([]),
    [future, setFuture] = useState<BuildingSpec[]>([]),
    [tab, setTab] = useState('concepts'),
    [selected, setSelected] = useState<ConceptId>('A'),
    [element, setElement] = useState<Feature>(),
    [ready, setReady] = useState(false),
    [saveState, setSaveState] = useState('Saved locally'),
    [savedProjects, setSavedProjects] = useState<SavedState[]>([]),
    [dialog, setDialog] = useState<
      'new' | 'export' | 'settings' | 'history' | 'handoff' | null
    >(null),
    [transcript, setTranscript] = useState(''),
    [message, setMessage] = useState(''),
    [voiceState, setVoiceState] = useState<VoiceState>('idle'),
    [capabilities, setCapabilities] = useState<{
      voice: boolean;
      video: boolean;
      voiceModel: string;
    } | null>(null),
    [sceneAPI, setSceneAPI] = useState<SceneAPI>(),
    [sceneMounted, setSceneMounted] = useState(false),
    [filmModelVisible, setFilmModelVisible] = useState(false),
    [walk, setWalk] = useState(false),
    [sheet, setSheet] = useState<SheetId>('S01'),
    [busy, setBusy] = useState(''),
    [compare, setCompare] = useState(false),
    [handoffKind, setHandoffKind] = useState<'research' | 'assets'>('assets'),
    [taskPrompt, setTaskPrompt] = useState(''),
    [newName, setNewName] = useState(''),
    [newPlace, setNewPlace] = useState(''),
    [newCoords, setNewCoords] = useState('37.7989, -122.4662'),
    [voiceMessages, setVoiceMessages] = useState<
      { role: string; text: string }[]
    >([]),
    [draftImport, setDraftImport] = useState<{
      kind: string;
      data: unknown;
      title: string;
    } | null>(null),
    [, setCustomSources] = useState<typeof sources>([]);
  const projectWrites = useRef(Promise.resolve());
  const dragStart = useRef<BuildingSpec | null>(null);
  const stateRef = useRef({ spec, past, future, element });
  stateRef.current = { spec, past, future, element };
  const voice = useRef<VoiceConnection | null>(null),
    statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    input = useRef<HTMLInputElement>(null);
  const onSceneReady = useCallback((api: SceneAPI) => {
    setSceneAPI(api);
    if (import.meta.env.DEV) window.__PLACEFORM_SCENE = api;
  }, []);
  const projectConcepts = demoConcepts;
  const c = projectConcepts.find((c) => c.id === selected)!,
    activeConcept = projectConcepts.find((c) => c.id === spec.concept)!;
  function openGeneration(_kind: GenerationRequest['kind'], _prompt = '') {
    notify(
      'Four prepared concepts are ready. Select a direction to explore its model.',
    );
  }
  function developSelected() {
    commit(fixedDemoSpec(spec, selected));
    setTab('model');
  }
  function notify(text: string) {
    setMessage(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setMessage(''), 9500);
  }
  useEffect(() => {
    void (async () => {
      try {
        const stored = await loadMedia(DEMO_STORAGE_KEY);
        const raw = decodeProjects(
          stored ? await stored.text() : localStorage.getItem(DEMO_STORAGE_KEY),
        );
        const projects = Array.isArray(raw.projects)
          ? raw.projects.filter((p: SavedState) => validSpec(p.project))
          : [];
        setSavedProjects(projects);
        const active =
          projects.find((p: SavedState) => p.project.id === raw.active) ||
          projects[0];
        if (active) {
          setSpec(fixedDemoSpec(active.project));
          setCustomSources(active.project.evidence || []);
          setSelected(active.project.reviewedConcept || active.project.concept);
          setPast((active.past || []).filter(validSpec).slice(-30));
          setFuture((active.future || []).filter(validSpec).slice(-30));
        }
        const evidence = JSON.parse(
          localStorage.getItem('placeform-imported-evidence') || '{}',
        );
        if (active && Array.isArray(evidence[active.project.id]))
          setCustomSources(evidence[active.project.id]);
      } catch {
        notify(
          'Saved data could not be read. The prepared study is available; you can import a project backup.',
        );
      }
      setReady(true);
    })();
    fetch('/api/status')
      .then((r) => r.json())
      .then((v) => setCapabilities(v as typeof capabilities))
      .catch(() =>
        setCapabilities({
          voice: false,
          video: false,
          voiceModel: 'gpt-realtime-2.1',
        }),
      );
    return () => {
      voice.current?.stop();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      projectWrites.current = projectWrites.current
        .catch(() => {})
        .then(async () => {
          try {
            const stored = await loadMedia(DEMO_STORAGE_KEY);
            const raw = decodeProjects(
              stored
                ? await stored.text()
                : localStorage.getItem(DEMO_STORAGE_KEY),
            );
            const other = (raw.projects || []).filter(
              (p: SavedState) =>
                p.project?.id !== spec.id && validSpec(p.project),
            );
            const entry = {
              project: spec,
              past: past.slice(-30),
              future: future.slice(-30),
              saved: new Date().toISOString(),
            };
            const projects = [entry, ...other].slice(0, 12);
            await saveMedia(
              DEMO_STORAGE_KEY,
              new Blob([encodeProjects({ active: spec.id, projects })], {
                type: 'application/json',
              }),
            );
            setSavedProjects(projects);
            setSaveState('Saved locally');
          } catch {
            setSaveState('Save failed');
            notify(
              'Browser storage is full or unavailable. Export your project JSON to preserve this revision.',
            );
          }
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [spec, past, future, ready]);
  useEffect(() => {
    if (['model', 'film', 'drawings'].includes(tab) && !canOpenModel(spec)) {
      setTab(spec.boundaryConfirmed ? 'concepts' : 'place');
      notify('Review a generated concept image before opening the model.');
      return;
    }
    if (tab === 'model') setSceneMounted(true);
    if (tab !== 'film') setFilmModelVisible(false);
  }, [tab, spec]);
  useEffect(() => {
    voice.current?.update(spec, element);
  }, [spec, element]);
  function nextRevision() {
    const state = stateRef.current;
    return (
      Math.max(
        state.spec.revision,
        ...state.past.map((s) => s.revision),
        ...state.future.map((s) => s.revision),
      ) + 1
    );
  }
  function commit(next: BuildingSpec, notice?: string) {
    next = fixedDemoSpec(next);
    const old = stateRef.current.spec;
    if (old.concept !== next.concept) {
      setSceneAPI(undefined);
      setElement(undefined);
    }
    if (
      JSON.stringify({ ...old, revision: 0 }) ===
      JSON.stringify({ ...next, revision: 0 })
    )
      return;
    const n = { ...next, revision: nextRevision() };
    setPast((p) => [...p, clone(old)].slice(-30));
    setFuture([]);
    stateRef.current = { ...stateRef.current, spec: n };
    setSpec(fixedDemoSpec(n));
    setSaveState('Saving…');
    if (notice) notify(notice);
  }
  function history(direction: 'undo' | 'redo') {
    const { spec: current, past: p, future: f } = stateRef.current;
    if (direction === 'undo') {
      if (!p.length) {
        notify('You are at the earliest saved design.');
        return;
      }
      setFuture([clone(current), ...f]);
      setSpec(p[p.length - 1]);
      setPast(p.slice(0, -1));
      setSelected(p[p.length - 1].concept);
      notify('Previous design restored.');
    } else {
      if (!f.length) {
        notify('No later change to reapply.');
        return;
      }
      setPast([...p, clone(current)]);
      setSpec(f[0]);
      setFuture(f.slice(1));
      setSelected(f[0].concept);
      notify('Design change reapplied.');
    }
  }
  function dispatch(a: DesignAction) {
    if (
      !['view', 'undo', 'redo'].includes(a.type) &&
      !(a.type === 'set' && a.parameter === 'hour')
    ) {
      const message =
        'These four models are fixed for the presentation. Choose a concept, camera view or daylight setting.';
      notify(message);
      return message;
    }
    const result = executeAction(stateRef.current.spec, a);
    if (result.history) history(result.history);
    else if (result.spec) {
      commit(result.spec);
      setSelected(result.spec.concept);
      if (
        a.type === 'view' ||
        (a.type === 'set' && a.parameter !== 'hour') ||
        a.type === 'mix'
      )
        setTab('model');
    } else if (result.generation) {
      const kind = /^research:/i.test(result.generation)
        ? 'research'
        : /^concepts:/i.test(result.generation)
          ? 'concepts'
          : 'image';
      openGeneration(
        kind,
        result.generation.replace(/^(research|concepts|image):\s*/i, ''),
      );
      result.message = 'Generation is ready to start and review in the app.';
    }
    notify(result.message);
    return result.message;
  }
  function command(text: string) {
    if (!text.trim()) return;
    if (/^(research|investigate|look up)\b/i.test(text.trim())) {
      openGeneration('research', text);
      return;
    }
    if (/(generate|create|make).*(four|4|new).*concepts/i.test(text)) {
      openGeneration('concepts', text);
      return;
    }
    const a = parseCommand(
      text,
      stateRef.current.spec,
      stateRef.current.element,
    );
    setVoiceMessages((v) => [...v, { role: 'You', text }].slice(-12));
    if (a) {
      const msg = dispatch(a);
      setVoiceMessages((v) =>
        [...v, { role: 'Placeform', text: msg }].slice(-12),
      );
    } else {
      openGeneration(
        'design',
        `${text}${stateRef.current.element ? ` Selected element: ${stateRef.current.element}.` : ''}`,
      );
      setVoiceMessages((v) =>
        [
          ...v,
          {
            role: 'Placeform',
            text: 'These four models are fixed. Try “aerial view” or change the daylight setting.',
          },
        ].slice(-12),
      );
    }
  }
  async function toggleVoice() {
    if (voiceState === 'connecting') return;
    if (voice.current) {
      voice.current.stop();
      voice.current = null;
      return;
    }
    if (!capabilities?.voice) {
      setDialog('settings');
      notify(
        'OpenAI voice needs a server API key. You can type design commands now.',
      );
      return;
    }
    try {
      voice.current = await connectVoice(
        stateRef.current.spec,
        stateRef.current.element,
        (state) => {
          setVoiceState(state);
          if (state === 'idle' || state === 'error') voice.current = null;
        },
        (text) => {
          setTranscript(text);
          setVoiceMessages((v) => [...v, { role: 'You', text }].slice(-12));
        },
        dispatch,
        (text) => {
          notify(text);
          setVoiceMessages((v) =>
            [...v, { role: 'Placeform', text }].slice(-12),
          );
        },
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === 'z' &&
        !(e.target as HTMLElement).matches('input,textarea')
      ) {
        e.preventDefault();
        history(e.shiftKey ? 'redo' : 'undo');
      }
      if (
        e.key === '/' &&
        !(e.target as HTMLElement).matches('input,textarea')
      ) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  async function work(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  function startNew() {
    const m = newCoords.match(
      /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
    );
    if (!m || Math.abs(+m[1]) > 85 || Math.abs(+m[2]) > 180) {
      notify('Enter valid latitude, longitude coordinates.');
      return;
    }
    const n = createDemo();
    n.id = crypto.randomUUID();
    n.name = newName.trim() || 'Untitled place study';
    n.site = siteAt([+m[2], +m[1]], newPlace.trim() || 'Presidio');
    if (!withinPresidio(n.site)) {
      n.demoContext = undefined;
      n.researchReady = false;
      n.evidence = [];
      n.directions = undefined;
      n.brief =
        'Draw a boundary and research this place before choosing a direction.';
    }
    setSpec(fixedDemoSpec(n));
    setPast([]);
    setFuture([]);
    setSelected('A');
    setCustomSources([]);
    setTab('place');
    setDialog(null);
    setNewName('');
    notify(
      'New project created. Refine the boundary and prepare a local research brief.',
    );
  }
  function loadProject(p: SavedState) {
    setSpec(fixedDemoSpec(p.project));
    setCustomSources(p.project.evidence || []);
    setSelected(p.project.reviewedConcept || p.project.concept);
    setPast(p.past || []);
    setFuture(p.future || []);
    try {
      setCustomSources(
        p.project.evidence ||
          JSON.parse(
            localStorage.getItem('placeform-imported-evidence') || '{}',
          )[p.project.id] ||
          [],
      );
    } catch {
      setCustomSources([]);
    }
    setDialog(null);
    notify(`${p.project.name} loaded.`);
  }
  async function importFile(
    file: File | undefined,
    kind: 'project' | 'image' | 'research',
  ) {
    if (!file) return;
    if (['image', 'project'].includes(kind)) {
      notify('The presentation uses four fixed concepts.');
      return;
    }
    try {
      if (file.size > 6 * 1024 * 1024)
        throw new Error('Use a file smaller than 6 MB.');
      if (kind === 'image') {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
          throw new Error('Choose a PNG, JPEG or WebP image.');
        const data = await importedImage(file);
        setDraftImport({
          kind,
          data,
          title: `Replace concept ${selected} image with ${file.name}`,
        });
      } else {
        const data = JSON.parse(await file.text());
        if (kind === 'project' && !validSpec(data))
          throw new Error(
            'This is not a valid Placeform specification. Dimensions, site geometry or schema are invalid.',
          );
        if (
          kind === 'research' &&
          (data.projectId !== spec.id ||
            data.revision !== spec.revision ||
            typeof data.brief !== 'string' ||
            !Array.isArray(data.sources) ||
            !data.sources.every(
              (s: {
                url: string;
                title: string;
                fact: string;
                response: string;
                limitation: string;
              }) =>
                typeof s.title === 'string' &&
                typeof s.fact === 'string' &&
                typeof s.response === 'string' &&
                typeof s.limitation === 'string' &&
                s.url.startsWith('https://'),
            ))
        )
          throw new Error(
            'Research must match this project ID and revision and include a brief and cited sources.',
          );
        setDraftImport({ kind, data, title: `Review ${file.name}` });
      }
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function applyImport() {
    if (!draftImport) return;
    if (draftImport.kind === 'image') {
      commit(
        {
          ...spec,
          assets: { ...spec.assets, [selected]: draftImport.data as string },
          imageReviews: {
            ...spec.imageReviews,
            [selected]: { signature: '', reviewed: false },
          },
        },
        'Concept image imported. Geometry remains a separate reviewable specification.',
      );
    } else if (draftImport.kind === 'project') {
      const p = draftImport.data as BuildingSpec;
      setSpec(p);
      setCustomSources(p.evidence || []);
      setSelected(p.concept);
      setPast([]);
      setFuture([]);
      setTab('model');
      notify('Project imported and ready to review.');
    } else {
      const r = draftImport.data as { brief: string; sources: typeof sources };
      const ss = r.sources.map((s, i) => ({
        ...s,
        id: String(i + 1).padStart(2, '0'),
        category: s.category || 'IMPORTED CONTEXT',
        source: s.source || s.title,
        feature: s.feature || 'Design brief',
      }));
      setCustomSources(ss);
      commit(
        { ...spec, evidence: ss, brief: r.brief, researchReady: true },
        'Research brief imported. Review each source before relying on it.',
      );
    }
    setDraftImport(null);
    setDialog(null);
  }
  const isPortland =
    Math.abs(spec.site.center[0] + 122.6653) < 0.015 &&
    Math.abs(spec.site.center[1] - 45.5134) < 0.015;
  const shownSources = spec.researchReady
    ? spec.evidence || (isPortland ? sources : [])
    : [];
  return (
    <TooltipProvider>
      <main className="studio">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark">
              p<span>f</span>
            </span>
            placeform<span className="beta">STUDIO</span>
          </a>
          <button
            className="project-title"
            onClick={() => setDialog('history')}
          >
            <span className="project-dot" />
            {spec.name}
            <span className="muted"> / </span>
            <span className="muted">
              {spec.site.location === 'Portland, Oregon'
                ? 'Portland, OR'
                : spec.site.name.split(',')[0]}
            </span>
            <ChevronDown size={12} />
          </button>
          <div className="top-actions">
            <span
              className={`saved ${saveState === 'Save failed' ? 'error' : ''}`}
            >
              <Check size={13} />
              {saveState}
            </span>
            <button className="dark-button" onClick={() => setDialog('export')}>
              Export <ArrowUpRight size={15} />
            </button>
          </div>
        </header>
        <div className="stage-bar">
          <div className="stage-caption">
            <span className="tiny-number">01—04</span> YOUR DESIGN PROCESS
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="stage-tabs">
              {stages.map(({ id, label, icon: Icon }, i) => (
                <TabsTrigger value={id} key={id}>
                  <Icon size={16} />
                  {label}
                  <span>0{i + 1}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <span className="schematic">SCHEMATIC DESIGN</span>
          <Tool
            label="Connections & voice"
            onClick={() => setDialog('settings')}
          >
            <Settings2 size={16} />
          </Tool>
        </div>
        <div className={`workspace workspace-${tab}`}>
          {tab === 'concepts' && (
            <>
              <div className="workspace-heading">
                <div>
                  <div className="eyebrow">
                    {isPortland
                      ? 'CENTRAL EASTSIDE · PORTLAND, OREGON'
                      : spec.directions
                        ? spec.site.location.toUpperCase()
                        : 'PREPARED PRECEDENTS · GENERATE YOUR LOCAL DIRECTIONS'}
                  </div>
                  <h1>Four ways to belong.</h1>
                </div>
                <p>
                  One place. Four architectural directions.
                  <br />
                  Explore each direction in three dimensions.
                </p>
              </div>
              <div className="concept-layout">
                <div className="image-stage">
                  <img
                    src={conceptImage(spec, selected)}
                    alt={`${c.name}, a speculative data-center exterior concept`}
                  />
                  <span className="image-chip">
                    CONCEPT {c.id}
                    <span />
                    PERSPECTIVE STUDY
                  </span>
                  <button
                    className="image-expand"
                    title="View in 3D"
                    aria-label="View in 3D"
                    onClick={developSelected}
                  >
                    <Box size={17} />
                  </button>
                  <div className="image-bottom">
                    <span>
                      {spec.site.center[1].toFixed(4)}°,{' '}
                      {spec.site.center[0].toFixed(4)}° · REFERENCE STUDY
                    </span>
                    <span>{'Concept reference'} · Design intent</span>
                  </div>
                </div>
                <aside className="concept-info">
                  <div className="section-kicker">
                    DIRECTION {c.id}
                    <span className="pill">
                      {spec.concept === selected
                        ? 'CURRENT DIRECTION'
                        : 'EXPLORING'}
                    </span>
                  </div>
                  <h2>{c.name}</h2>
                  <p className="concept-subtitle">{c.subtitle}</p>
                  <p>{c.description}</p>
                  <div className="material-palette">
                    {c.colors.map((color, i) => (
                      <div key={color}>
                        <span style={{ background: color }} />
                        <small>{c.materials[i]}</small>
                      </div>
                    ))}
                  </div>
                  <div className="info-rule">
                    <h3>Rooted in this place</h3>
                    <p>{c.inspiration}</p>
                    <button
                      className="text-link"
                      onClick={() => setTab('place')}
                    >
                      Trace the local evidence <ArrowUpRight size={12} />
                    </button>
                  </div>
                  <div className="tradeoff">
                    <span>DESIGN CONSIDERATION</span>
                    <p>{c.tradeoff}</p>
                  </div>
                  <button className="accent-button" onClick={developSelected}>
                    {'View in 3D'} <ArrowRight size={17} />
                  </button>
                </aside>
              </div>
              <div className="concept-strip">
                {projectConcepts.map((d) => (
                  <button
                    className={`concept-tile ${selected === d.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelected(d.id);
                      commit(fixedDemoSpec(spec, d.id));
                    }}
                    key={d.id}
                  >
                    <div className="tile-preview">
                      <img src={conceptImage(spec, d.id)} alt="" />
                    </div>
                    <span className="tile-letter">{d.id}</span>
                    <span>
                      <strong>{d.name}</strong>
                      <small>{d.roof}</small>
                    </span>
                    {selected === d.id && <Check size={17} />}
                  </button>
                ))}
              </div>
              <div className="under-gallery">
                <span>
                  Approximate scale · {spec.length} × {spec.width} m envelope ·
                  comparable viewpoints
                </span>
              </div>
            </>
          )}
          {tab === 'place' && (
            <>
              <div className="workspace-heading">
                <div>
                  <div className="eyebrow">01 / THE PLACE COMES FIRST</div>
                  <h1>
                    {isPortland
                      ? 'The working edge of Portland.'
                      : spec.site.name.split(',')[0]}
                  </h1>
                </div>
                <button
                  className="outline-button"
                  onClick={() => {
                    openGeneration(
                      'research',
                      `Research the geofence at ${spec.site.name}. Curate architectural history, materials, climate, landscape, surrounding buildings and community concerns into a cited design brief.`,
                    );
                  }}
                >
                  <BookOpen size={15} />{' '}
                  {spec.researchReady
                    ? spec.demoContext
                      ? 'Prepared research'
                      : 'Extend the research'
                    : 'Research this place'}
                </button>
              </div>
              <div className="place-layout">
                <Suspense
                  fallback={
                    <div className="panel-loading">Opening the site map…</div>
                  }
                >
                  <SiteMap
                    spec={spec}
                    onEditComplete={(site, drawn) => {
                      const current = stateRef.current.spec;
                      if (JSON.stringify(site) === JSON.stringify(current.site))
                        return;
                      const next = freshSiteDesign(current, site);
                      if (!drawn) next.boundaryConfirmed = false;
                      commit(next);
                    }}
                    onMessage={notify}
                  />
                </Suspense>
                <aside className="site-brief">
                  <div className="section-kicker">
                    THE STUDY SITE <MapPin size={14} />
                  </div>
                  <h2>{spec.site.name.split(',')[0]}</h2>
                  <p>{spec.site.location}</p>
                  <div className="site-stats">
                    <div>
                      <strong>
                        {spec.boundaryConfirmed === false
                          ? '—'
                          : (siteArea(spec.site) / 10000).toFixed(2)}
                        <span>ha</span>
                      </strong>
                      <small>Illustrative boundary</small>
                    </div>
                    <div>
                      <strong>
                        {spec.site.rotation.toFixed(0)}
                        <span>°</span>
                      </strong>
                      <small>Long-axis bearing</small>
                    </div>
                  </div>
                  <label className="field-label">
                    EDITABLE DESIGN BRIEF
                    <textarea
                      value={spec.brief}
                      onFocus={() => {
                        dragStart.current = clone(stateRef.current.spec);
                      }}
                      onChange={(e) =>
                        setSpec((s) => ({ ...s, brief: e.target.value }))
                      }
                      onBlur={() => {
                        if (
                          dragStart.current &&
                          dragStart.current.brief !==
                            stateRef.current.spec.brief
                        ) {
                          const prev = dragStart.current;
                          setPast((p) => [...p, prev].slice(-30));
                          setFuture([]);
                          setSpec((s) => ({ ...s, revision: nextRevision() }));
                        }
                        dragStart.current = null;
                      }}
                    />
                  </label>
                  <p className="assumption">
                    <span>STUDY ASSUMPTION</span>
                    {spec.site.notes}
                  </p>
                  <button
                    className="accent-button"
                    onClick={() => setTab('concepts')}
                  >
                    Explore the concepts <ArrowRight size={16} />
                  </button>
                </aside>
              </div>
              {isPortland && (
                <div className="context-photos">
                  {photos.map((p) => (
                    <figure key={p.src}>
                      <img src={p.src} alt={p.title} />
                      <figcaption>
                        <div>
                          <h3>{p.title}</h3>
                          <p>
                            {p.caption} · Context reference, not the project
                            site
                          </p>
                        </div>
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {p.credit} <ExternalLink size={12} />
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <div className="section-heading">
                <div>
                  <div className="eyebrow">FROM EVIDENCE TO ARCHITECTURE</div>
                  <h2>A brief with a point of view.</h2>
                </div>
                <span>
                  {shownSources.length} SOURCES ·{' '}
                  {spec.demoContext
                    ? 'PREPARED BOARD CONTEXT'
                    : spec.evidence?.length
                      ? 'GENERATED RESEARCH'
                      : 'CHECKED SEP 2026'}
                </span>
              </div>
              {!spec.researchReady && (
                <p className="inline-warning">
                  Local research is pending. Precedent material is not evidence
                  about this location.
                </p>
              )}
              {spec.demoContext && (
                <p>
                  <a href={moodBoardUrl} target="_blank" rel="noreferrer">
                    Watt Wonder / Presidio inspiration board ↗
                  </a>{' '}
                  · Prepared September 2026; parcel conditions are unverified.
                </p>
              )}
              {spec.demoContext === 'presidio' && <ContextGallery />}
              <div className="research-grid">
                {shownSources.map((r) => (
                  <article className="research-card" key={r.id}>
                    <div className="section-kicker">
                      {r.category}
                      <span>{r.id}</span>
                    </div>
                    <h3>{r.title}</h3>
                    <span className="evidence-label">
                      {spec.demoContext
                        ? 'BOARD SYNTHESIS · INTERPRETATION'
                        : spec.evidence?.length
                          ? 'CITED CONTEXT · REVIEW SOURCE'
                          : 'VERIFIED CONTEXT'}
                    </span>
                    <p>{r.fact}</p>
                    <div className="design-response">
                      <span>DESIGN RESPONSE</span>
                      <p>{r.response}</p>
                      <small>{r.feature}</small>
                    </div>
                    <details>
                      <summary>What still needs verification</summary>
                      <p>{r.limitation}</p>
                    </details>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.source}
                      <ArrowUpRight size={14} />
                    </a>
                  </article>
                ))}
              </div>
              <div className="impact-panel">
                <div>
                  <div className="eyebrow">
                    A CLEAR ACCOUNT OF THE TRADEOFFS
                  </div>
                  <h2>Good architecture does not erase impact.</h2>
                  <p>
                    These are proposed mitigations. None establish engineering
                    performance or planning approval.
                  </p>
                </div>
                <div className="impact-grid">
                  {impacts.map((i) => (
                    <article key={i.name}>
                      <h3>{i.name}</h3>
                      <p>{i.proposal}</p>
                      <small>Unresolved: {i.unresolved}</small>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
          {(tab === 'model' || tab === 'film') && (
            <div className="workspace-heading">
              <div>
                <div className="eyebrow">
                  {tab === 'model'
                    ? '03 / THE ARCHITECTURE, RESOLVED'
                    : '04 / PRESENT THE DESIGN'}{' '}
                  · REVISION {String(spec.revision).padStart(2, '0')}
                </div>
                <h1>
                  {tab === 'model'
                    ? activeConcept.name
                    : 'A building, experienced.'}
                </h1>
              </div>
              <div className="heading-tools">
                <span className="revision-tag">
                  {spec.length} × {spec.width} × {spec.height} m
                </span>
                <Tool
                  label="Undo design change"
                  disabled={!past.length}
                  onClick={() => history('undo')}
                >
                  <Undo2 size={17} />
                </Tool>
                <Tool
                  label="Redo design change"
                  disabled={!future.length}
                  onClick={() => history('redo')}
                >
                  <Redo2 size={17} />
                </Tool>
                <Tool
                  label="Design history"
                  onClick={() => setDialog('history')}
                >
                  <History size={17} />
                </Tool>
              </div>
            </div>
          )}
          {sceneMounted && canOpenModel(spec) && (
            <div
              className={`model-layout ${tab === 'film' ? 'film-model-layout' : ''}`}
              style={{
                display:
                  tab === 'model' || (tab === 'film' && filmModelVisible)
                    ? 'grid'
                    : 'none',
              }}
            >
              <div className="model-stage">
                <Suspense
                  fallback={
                    <div className="panel-loading">
                      Assembling the exterior model…
                    </div>
                  }
                >
                  <Scene
                    spec={spec}
                    onSelect={(f) => {
                      setElement(f);
                      notify(
                        `${featureLabels[f]} selected. Reference model feature.`,
                      );
                    }}
                    onReady={onSceneReady}
                    walk={walk}
                  />
                </Suspense>
                <div className="model-top-controls">
                  <span className="image-chip">
                    LIVE MODEL
                    <span />R{String(spec.revision).padStart(2, '0')}
                  </span>
                  <div className="model-view-switch">
                    <button
                      className={spec.view === 'perspective' ? 'active' : ''}
                      onClick={() => commit({ ...spec, view: 'perspective' })}
                    >
                      <Move3D size={14} /> Orbit
                    </button>
                    <button
                      className={spec.view === 'entrance' ? 'active' : ''}
                      onClick={() => commit({ ...spec, view: 'entrance' })}
                    >
                      <Footprints size={14} /> Walk
                    </button>
                    <button
                      className={spec.view === 'aerial' ? 'active' : ''}
                      onClick={() => commit({ ...spec, view: 'aerial' })}
                    >
                      <Layers size={14} /> Aerial
                    </button>
                  </div>
                </div>
                <div className="model-tools">
                  <Tool
                    label="Compare approved concept"
                    active={compare}
                    onClick={() => setCompare((v) => !v)}
                  >
                    <ImageIcon size={17} />
                  </Tool>
                  <Tool
                    label="Save presentation view"
                    onClick={() =>
                      work('Capturing presentation view…', async () => {
                        if (sceneAPI)
                          download(
                            await sceneAPI.capture(),
                            `${spec.id}-${spec.view}-r${spec.revision}.png`,
                          );
                      })
                    }
                  >
                    <Download size={17} />
                  </Tool>
                  <Tool label="Reset camera" onClick={() => sceneAPI?.reset()}>
                    <RotateCcw size={17} />
                  </Tool>
                </div>
                {compare && (
                  <div className="concept-compare">
                    <img
                      src={conceptImage(spec, spec.concept)}
                      alt="Approved concept reference"
                    />
                    <span>
                      CONCEPT REFERENCE · check silhouette, bays, materials
                    </span>
                    <button
                      aria-label="Close reference"
                      onClick={() => setCompare(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="model-caption">
                  <span>
                    {walk
                      ? 'WASD / ARROWS to walk · drag to look'
                      : 'Drag to orbit · scroll to zoom · click an element'}
                  </span>
                  <span>+X east · +Z south · metres</span>
                </div>
                <div className="model-compass">
                  <span>N</span>
                  <Compass size={28} />
                </div>
              </div>
              {tab === 'model' && (
                <aside className="model-inspector">
                  <div className="section-kicker">
                    REFERENCE MODEL <Box size={15} />
                  </div>
                  <h2>{activeConcept.name}</h2>
                  <p>
                    {element
                      ? `Selected: ${featureLabels[element]}.`
                      : activeConcept.description}
                  </p>
                  <p className="fineprint">
                    Approximate exterior reconstructed from one image. Hidden
                    geometry and dimensions are inferred.
                  </p>
                  <div className="view-buttons">
                    {projectConcepts.map((direction) => (
                      <button
                        key={direction.id}
                        className={
                          spec.concept === direction.id ? 'active' : ''
                        }
                        onClick={() => {
                          setSelected(direction.id);
                          commit(fixedDemoSpec(spec, direction.id));
                        }}
                      >
                        {direction.id} · {direction.name}
                      </button>
                    ))}
                  </div>
                  <div className="daylight-control">
                    <label>
                      <Sun size={15} /> Daylight{' '}
                      <strong>{spec.hour.toFixed(0)}:00</strong>
                    </label>
                    <Slider
                      aria-label="Daylight hour"
                      value={[spec.hour]}
                      min={6}
                      max={21}
                      step={1}
                      onValueChange={(v) => {
                        if (!dragStart.current)
                          dragStart.current = clone(stateRef.current.spec);
                        setSpec((s) => ({
                          ...s,
                          hour: Array.isArray(v) ? v[0] : v,
                        }));
                      }}
                      onValueCommitted={() => {
                        if (dragStart.current) {
                          const prev = dragStart.current;
                          setPast((p) => [...p, prev].slice(-30));
                          setFuture([]);
                          setSpec((s) => ({ ...s, revision: nextRevision() }));
                          dragStart.current = null;
                        }
                      }}
                    />
                    <div>
                      <span>06:00</span>
                      <span>21:00</span>
                    </div>
                  </div>
                  <div className="view-buttons">
                    {(Object.keys(viewNames) as View[]).map((v) => (
                      <button
                        className={spec.view === v ? 'active' : ''}
                        onClick={() => commit({ ...spec, view: v })}
                        key={v}
                      >
                        {viewNames[v]}
                      </button>
                    ))}
                  </div>
                  <button
                    className={`outline-button ${walk ? 'active' : ''}`}
                    onClick={() => {
                      setWalk(!walk);
                      if (!walk) commit({ ...spec, view: 'entrance' });
                    }}
                  >
                    <Footprints size={14} />
                    {walk
                      ? 'Leave pedestrian navigation'
                      : 'Enable pedestrian navigation'}
                  </button>
                  <p className="fineprint">
                    Equipment and concealed construction are schematic. Solar
                    time is illustrative; this is not a solar or acoustic
                    analysis.
                  </p>
                </aside>
              )}
            </div>
          )}
          {tab === 'model' && (
            <div className="model-bottom">
              <span>
                Reference-based exterior study · fixed concept geometry
              </span>
              <button className="text-link" onClick={() => setTab('film')}>
                Create a film <ArrowRight size={14} />
              </button>
            </div>
          )}
          {tab === 'drawings' && (
            <>
              <div className="workspace-heading">
                <div>
                  <div className="eyebrow">
                    04 / ONE SPECIFICATION, EVERY VIEW · REVISION{' '}
                    {spec.revision}
                  </div>
                  <h1>The design, on paper.</h1>
                </div>
                <button
                  className="dark-button"
                  disabled={!!busy}
                  onClick={() =>
                    work('Exporting all seven PDF sheets…', async () =>
                      download(
                        await drawingPDF(spec),
                        `${spec.id}-schematic-set-r${spec.revision}.pdf`,
                      ),
                    )
                  }
                >
                  <Download size={15} /> Download drawing set
                </button>
              </div>
              <div className="drawing-layout">
                <aside className="drawing-list">
                  <div className="section-kicker">
                    DRAWING REGISTER <span>07 SHEETS</span>
                  </div>
                  {sheets.map((s) => (
                    <button
                      className={sheet === s.id ? 'selected' : ''}
                      key={s.id}
                      onClick={() => setSheet(s.id)}
                    >
                      <span>{s.id}</span>
                      <strong>{s.name}</strong>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  <div className="drawing-note">
                    <Compass size={23} />
                    <h3>Schematic design</h3>
                    <p>
                      Dimensioned views derived from the current building
                      specification. A3 sheets, with scale, orientation and a
                      material legend.
                    </p>
                    <p>
                      Print at 100%. This set is not for construction or
                      planning approval.
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() =>
                      download(
                        drawingSVG(spec, sheet),
                        `${sheet}-r${spec.revision}.svg`,
                        'image/svg+xml',
                      )
                    }
                  >
                    <Download size={15} /> Export this SVG
                  </button>
                  <button
                    className="outline-button"
                    disabled={!!busy}
                    onClick={() =>
                      work('Exporting PDF sheet…', async () =>
                        download(
                          await drawingPDF(spec, [sheet]),
                          `${sheet}-r${spec.revision}.pdf`,
                        ),
                      )
                    }
                  >
                    <Download size={15} /> Export this PDF
                  </button>
                </aside>
                <div className="drawing-canvas">
                  <div className="drawing-meta">
                    <span>{sheets.find((s) => s.id === sheet)?.name}</span>
                    <span>A3 · METRES · R{spec.revision}</span>
                  </div>
                  <div
                    className="drawing-sheet"
                    dangerouslySetInnerHTML={{
                      __html: drawingSVG(spec, sheet),
                    }}
                  />
                </div>
              </div>
            </>
          )}
          {tab === 'film' && (
            <Suspense
              fallback={
                <div className="panel-loading">Opening the film workspace…</div>
              }
            >
              <FilmPanel
                key={spec.id}
                spec={spec}
                reference={filmReference(spec, selected, c.name)}
                modelToolsVisible={filmModelVisible}
                onToggleModelTools={() => {
                  setSceneMounted(true);
                  setFilmModelVisible((v) => !v);
                }}
                api={sceneAPI}
                onMessage={notify}
              />
            </Suspense>
          )}
        </div>
        <footer className="studio-footer">
          <span>
            <span className="status-dot" /> A PLACE-LED DESIGN STUDY
          </span>
          <div className="voice-dock">
            {message && (
              <output className="voice-feedback">
                <span>{message}</span>
                <button
                  aria-label="Dismiss feedback"
                  onClick={() => setMessage('')}
                >
                  <X size={13} />
                </button>
              </output>
            )}
            <form
              className="voice-bar"
              onSubmit={(e) => {
                e.preventDefault();
                command(transcript);
              }}
            >
              <button
                className="voice-history"
                type="button"
                aria-label="Conversation and editable transcript"
                onClick={() => setDialog('history')}
              >
                <span className="voice-spark">✳</span>
              </button>
              <input
                ref={input}
                aria-label="Design instruction"
                placeholder={
                  voiceState === 'listening'
                    ? 'Listening. Tell me what to change…'
                    : voiceState === 'thinking'
                      ? 'Considering your design…'
                      : voiceState === 'speaking'
                        ? 'Placeform is speaking…'
                        : 'Choose a camera view or daylight setting'
                }
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
              />
              <button
                className="send-command"
                type="submit"
                aria-label="Apply typed design command"
                disabled={!transcript.trim()}
              >
                <Send size={15} />
              </button>
              <button
                className={
                  ['listening', 'thinking', 'speaking'].includes(voiceState)
                    ? 'listening'
                    : ''
                }
                type="button"
                disabled={voiceState === 'connecting'}
                aria-label={
                  ['listening', 'thinking', 'speaking'].includes(voiceState)
                    ? 'Stop voice conversation'
                    : 'Start voice conversation'
                }
                onClick={toggleVoice}
              >
                {['listening', 'thinking', 'speaking'].includes(voiceState) ? (
                  <MicOff size={20} />
                ) : (
                  <Mic size={20} />
                )}
              </button>
            </form>
            <span className="voice-availability">
              {['listening', 'thinking', 'speaking'].includes(voiceState)
                ? 'OPENAI REALTIME · PAID API SESSION · 5 MIN LIMIT'
                : 'VOICE + TYPE · / TO FOCUS · ENTER TO APPLY'}
            </span>
          </div>
          <span>
            R{String(spec.revision).padStart(2, '0')} ·{' '}
            {saveState.toUpperCase()}
          </span>
        </footer>
        {busy && (
          <output className="busy-indicator">
            <span className="spinner" />
            {busy}
          </output>
        )}
        <Dialog
          open={dialog !== null}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        >
          <DialogContent
            className={`studio-dialog ${dialog === 'history' ? 'wide-dialog' : ''}`}
          >
            <DialogTitle>
              {dialog === 'new'
                ? 'A new point of departure.'
                : dialog === 'export'
                  ? 'Ready for the review.'
                  : dialog === 'settings'
                    ? 'Connections & voice'
                    : dialog === 'history'
                      ? 'Your design conversation'
                      : 'Continue in your creative workspace.'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'new'
                ? 'Start from a real place, or return to a saved study.'
                : dialog === 'export'
                  ? `${spec.name} · revision ${spec.revision} · Schematic design`
                  : dialog === 'settings'
                    ? 'Local generation uses Codex when connected. OpenAI powers API fallback and voice; AIand powers video.'
                    : dialog === 'history'
                      ? 'Editable transcripts and saved design versions keep every decision reviewable.'
                      : 'Export a specific task, use your connected Codex or ChatGPT tools, and import the result for review.'}
            </DialogDescription>
            {dialog === 'new' && (
              <>
                <label className="field-label">
                  PROJECT NAME
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Your new architectural study"
                  />
                </label>
                <label className="field-label">
                  PLACE NAME
                  <input
                    value={newPlace}
                    onChange={(e) => setNewPlace(e.target.value)}
                    placeholder="Neighborhood, city, region"
                  />
                </label>
                <label className="field-label">
                  LATITUDE, LONGITUDE
                  <input
                    value={newCoords}
                    onChange={(e) => setNewCoords(e.target.value)}
                  />
                </label>
                <p className="fineprint">
                  You can search any address and draw the site boundary on the
                  map after creating the project.
                </p>
                <button className="accent-button" onClick={startNew}>
                  Create project <ArrowRight size={15} />
                </button>
                <div className="saved-projects">
                  <h3>Saved studies</h3>
                  {savedProjects.map((p) => (
                    <button onClick={() => loadProject(p)} key={p.project.id}>
                      <MapPin size={15} />
                      <span>
                        {p.project.name}
                        <small>
                          {p.project.site.name.split(',')[0]} · revision{' '}
                          {p.project.revision}
                        </small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const n = createDemo();
                      setSpec(fixedDemoSpec(n));
                      setPast([]);
                      setFuture([]);
                      setSelected('A');
                      setTab('place');
                      setDialog(null);
                    }}
                  >
                    <Layers size={15} />
                    <span>
                      Open Presidio demo
                      <small>
                        Reset the current demo to its original design
                      </small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
            {dialog === 'export' && (
              <>
                <div className="export-options">
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      work('Preparing review package…', async () => {
                        await reviewPackage(
                          { ...spec, evidence: shownSources },
                          sceneAPI,
                          setBusy,
                        );
                        notify('Review package downloaded.');
                      })
                    }
                  >
                    <Box size={24} />
                    <div>
                      <strong>Architectural review package</strong>
                      <p>
                        Concept reference, specification, cited brief
                        {sceneAPI ? ', GLB and four model views' : ''}.
                      </p>
                    </div>
                    <Download size={18} />
                  </button>
                  {!sceneAPI && (
                    <p className="inline-warning">
                      Open the 3D model first to include GLB and presentation
                      renders.{' '}
                      <button
                        className="text-link"
                        onClick={() => {
                          setTab('model');
                          setDialog(null);
                        }}
                      >
                        Open model <ArrowRight size={12} />
                      </button>
                    </p>
                  )}
                  <button
                    onClick={() =>
                      download(
                        JSON.stringify(
                          { ...spec, evidence: shownSources },
                          null,
                          2,
                        ),
                        `${spec.id}-r${spec.revision}.json`,
                        'application/json',
                      )
                    }
                  >
                    <FileJson size={24} />
                    <div>
                      <strong>Project specification</strong>
                      <p>
                        Portable JSON backup of the current project and its
                        locks.
                      </p>
                    </div>
                    <Download size={18} />
                  </button>
                  <button
                    disabled={!sceneAPI || !!busy}
                    onClick={() =>
                      work('Exporting GLB…', async () => {
                        download(
                          await sceneAPI!.glb(),
                          `${spec.id}-r${spec.revision}.glb`,
                        );
                      })
                    }
                  >
                    <Box size={24} />
                    <div>
                      <strong>Editable exterior model</strong>
                      <p>GLB · named semantic geometry · metre units.</p>
                    </div>
                    <Download size={18} />
                  </button>
                </div>
              </>
            )}
            {dialog === 'settings' && (
              <>
                <div className="connection">
                  <Mic size={23} />
                  <div>
                    <strong>OpenAI voice</strong>
                    <p>
                      {capabilities?.voice
                        ? 'Connected · ' + capabilities.voiceModel
                        : 'API credential required'}
                    </p>
                    <code>OPENAI_API_KEY</code>
                    <p>
                      Set this in the server’s environment, then restart the
                      local preview. Your key is never stored in the browser.
                      Voice sessions end after five minutes.
                    </p>
                    <a
                      href="https://developers.openai.com/api/docs/guides/realtime-webrtc"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Realtime API documentation <ArrowUpRight size={13} />
                    </a>
                    <a
                      href="https://openai.com/api/pricing/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Current voice pricing <ArrowUpRight size={13} />
                    </a>
                  </div>
                  <span className="pill">
                    {capabilities?.voice ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>
                <div className="connection">
                  <Film size={23} />
                  <div>
                    <strong>AIand cinematic video</strong>
                    <p>
                      {capabilities?.video
                        ? 'Connected · open Film to generate a video'
                        : 'API credential required'}
                    </p>
                    <code>AIAND_API_KEY</code>
                    <p>
                      Film checks your video terms, model availability, and live
                      price automatically. Prepare model frames, then generate.
                    </p>
                    <a
                      href="https://console.aiand.com/video"
                      target="_blank"
                      rel="noreferrer"
                    >
                      AIand video console <ArrowUpRight size={13} />
                    </a>
                  </div>
                  <span className="pill">
                    {capabilities?.video ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>
                <div className="connection">
                  <Layers size={23} />
                  <div>
                    <strong>Research & generated assets</strong>
                    <p>
                      Use Generate to research your geofence, create local
                      concepts, refine images, and propose model edits. Local
                      Codex uses your signed-in subscription; the hosted app
                      uses the paid OpenAI API.
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() => openGeneration('research')}
                  >
                    Open generation
                  </button>
                </div>
                <button
                  className="outline-button"
                  onClick={() => {
                    setDialog(null);
                    input.current?.focus();
                    setTranscript('Deepen the fins to 1.2 metres');
                  }}
                >
                  Try a typed design instruction <ArrowRight size={14} />
                </button>
              </>
            )}
            {dialog === 'history' && (
              <div className="history-layout">
                <div className="conversation-list">
                  <h3>Conversation</h3>
                  {voiceMessages.length ? (
                    voiceMessages.map((m, i) => (
                      <div
                        className={`conversation-message ${m.role === 'You' ? 'user' : ''}`}
                        key={i}
                      >
                        <span>{m.role}</span>
                        <p>{m.text}</p>
                        {m.role === 'You' && (
                          <button
                            className="text-link"
                            onClick={() => {
                              setTranscript(m.text);
                              setDialog(null);
                              input.current?.focus();
                            }}
                          >
                            Edit and reapply <ArrowRight size={12} />
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      Tell Placeform what to change. Try “Use A’s massing, B’s
                      facade, and C’s landscape.”
                    </p>
                  )}
                  <div className="command-examples">
                    {[
                      'Deepen the fins to 1.2 metres',
                      'Lock the roofline',
                      'Show the entrance at sunset',
                      'Undo that',
                    ].map((t) => (
                      <button
                        onClick={() => {
                          setTranscript(t);
                          setDialog(null);
                          command(t);
                        }}
                        key={t}
                      >
                        {t}
                        <ArrowRight size={12} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="version-list">
                  <h3>Design versions</h3>
                  <div className="current-version">
                    <strong>R{spec.revision} · Current</strong>
                    <span>
                      {
                        projectConcepts.find((c) => c.id === spec.material)
                          ?.materials[0]
                      }{' '}
                      · {spec.finDepth.toFixed(2)} m fins
                    </span>
                    <small>
                      {spec.locks.length
                        ? spec.locks.map((f) => featureLabels[f]).join(', ') +
                          ' locked'
                        : 'No feature locks'}
                    </small>
                  </div>
                  {[...past].reverse().map((p, i) => (
                    <button
                      key={`${p.revision}-${i}`}
                      onClick={() => {
                        commit(
                          { ...p, revision: spec.revision },
                          `Restored the geometry from revision ${p.revision}.`,
                        );
                        setDialog(null);
                      }}
                    >
                      <span>R{p.revision}</span>
                      <div>
                        <strong>
                          {
                            (p.directions || concepts).find(
                              (c) => c.id === p.concept,
                            )?.name
                          }
                        </strong>
                        <small>
                          {p.finDepth.toFixed(2)} m fins · {p.height} m height
                        </small>
                      </div>
                      <History size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {dialog === 'handoff' && (
              <>
                <div className="handoff-type">
                  <button
                    className={handoffKind === 'assets' ? 'active' : ''}
                    onClick={() => setHandoffKind('assets')}
                  >
                    <ImageIcon size={16} /> Asset generation
                  </button>
                  <button
                    className={handoffKind === 'research' ? 'active' : ''}
                    onClick={() => setHandoffKind('research')}
                  >
                    <BookOpen size={16} /> Place research
                  </button>
                </div>
                <label className="field-label">
                  THE TASK
                  <textarea
                    value={taskPrompt}
                    onChange={(e) => setTaskPrompt(e.target.value)}
                    placeholder="Describe the refinement or research you need…"
                  />
                </label>
                <div className="handoff-context">
                  <span>Project {spec.name}</span>
                  <span>Revision {spec.revision}</span>
                  <span>{spec.locks.length} locked features</span>
                </div>
                <button
                  className="accent-button"
                  disabled={!!busy || taskPrompt.length < 10}
                  onClick={() =>
                    work('Preparing the handoff package…', async () => {
                      await taskPackage(
                        spec,
                        taskPrompt,
                        handoffKind,
                        sceneAPI,
                      );
                      notify(
                        'Task exported with specification and available model references. Import the result here when ready.',
                      );
                    })
                  }
                >
                  Export task & references <Download size={15} />
                </button>
                <p className="fineprint">
                  No app-to-subscription generation API is assumed. The task
                  package contains clear instructions, project identity,
                  revision, locks, and available references.
                </p>
                <label className="file-button">
                  <Upload size={17} />{' '}
                  {handoffKind === 'assets'
                    ? `Import result for concept ${selected}`
                    : 'Import cited research JSON'}
                  <input
                    type="file"
                    accept={
                      handoffKind === 'assets'
                        ? 'image/png,image/jpeg,image/webp'
                        : '.json,application/json'
                    }
                    onChange={(e) =>
                      importFile(
                        e.target.files?.[0],
                        handoffKind === 'assets' ? 'image' : 'research',
                      )
                    }
                  />
                </label>
              </>
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!draftImport}
          onOpenChange={(open) => {
            if (!open) setDraftImport(null);
          }}
        >
          <DialogContent className="studio-dialog">
            <DialogTitle>{draftImport?.title || 'Review import'}</DialogTitle>
            <DialogDescription>
              Review the proposed result before applying it to the project.
            </DialogDescription>
            {draftImport?.kind === 'image' ? (
              <img
                className="import-preview"
                src={draftImport.data as string}
                alt="Imported concept preview"
              />
            ) : (
              <pre className="import-json">
                {(JSON.stringify(draftImport?.data, null, 2) || '').slice(
                  0,
                  3500,
                )}
              </pre>
            )}
            <button className="accent-button" onClick={applyImport}>
              Apply reviewed result <Check size={15} />
            </button>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}
