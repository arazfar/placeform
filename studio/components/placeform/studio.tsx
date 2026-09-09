'use client';
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
  History,
  Settings2,
  X,
  Sun,
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
import type { SceneAPI, SceneStatus } from './scene';
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
  active,
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
            aria-pressed={active}
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
    [sceneStatus, setSceneStatus] = useState<SceneStatus>('loading'),
    [commandsOpen, setCommandsOpen] = useState(false),
    [sceneMounted, setSceneMounted] = useState(false),
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
  const dialogOpener = useRef<HTMLElement | null>(null);
  function openDialog(value: typeof dialog) {
    dialogOpener.current = document.activeElement as HTMLElement;
    setDialog(value);
  }
  const projectWrites = useRef(Promise.resolve());
  const dragStart = useRef<BuildingSpec | null>(null);
  const stateRef = useRef({ spec, past, future, element });
  stateRef.current = { spec, past, future, element };
  const voice = useRef<VoiceConnection | null>(null),
    statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    input = useRef<HTMLInputElement>(null);
  const onSceneReady = useCallback((api: SceneAPI) => {
    setSceneAPI(api);
    setSceneStatus('ready');
    if (import.meta.env.DEV) window.__PLACEFORM_SCENE = api;
  }, []);
  const onSceneStatus = useCallback((status: SceneStatus) => {
    setSceneStatus(status);
    if (status !== 'ready') {
      setSceneAPI(undefined);
      setWalk(false);
      if (import.meta.env.DEV) delete window.__PLACEFORM_SCENE;
    }
  }, []);
  const sceneReady = sceneStatus === 'ready' && !!sceneAPI;
  const commandTrigger = useRef<HTMLButtonElement>(null);
  const evidenceSection = useRef<HTMLDetailsElement>(null);
  const openCommands = useCallback(() => {
    setCommandsOpen(true);
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  useEffect(() => {
    if (commandsOpen) input.current?.focus();
  }, [commandsOpen]);
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
    if (tab === 'model' || tab === 'film') setSceneMounted(true);
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
      setSceneStatus('loading');
      setWalk(false);
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
      openDialog('settings');
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
        !(e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable=true],[role=dialog]',
        )
      ) {
        e.preventDefault();
        history(e.shiftKey ? 'redo' : 'undo');
      }
      if (
        e.key === '/' &&
        !(e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable=true],[role=dialog]',
        )
      ) {
        e.preventDefault();
        openCommands();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openCommands]);
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
          <div className="project-title">
            <span className="project-dot" />
            <span>{spec.name}</span>
            <span className="muted">{spec.site.name.split(',')[0]}</span>
          </div>
          <div className="top-actions">
            <output
              className={`saved ${saveState === 'Save failed' ? 'error' : ''}`}
            >
              {saveState === 'Saved locally' ? (
                <Check size={14} />
              ) : saveState === 'Save failed' ? (
                <X size={14} />
              ) : (
                <span className="spinner" />
              )}
              {saveState}
            </output>
            <button
              className="plain history-trigger"
              aria-label="History"
              onClick={() => openDialog('history')}
            >
              <History size={16} /> History
            </button>
            <button
              className="outline-button"
              onClick={() => openDialog('export')}
            >
              Export <ArrowUpRight size={15} />
            </button>
          </div>
        </header>
        <div className="stage-bar">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="stage-tabs">
              {stages.map(({ id, label, icon: Icon }) => (
                <TabsTrigger value={id} key={id}>
                  <Icon size={16} />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="stage-utilities">
            <button
              className="plain command-trigger"
              aria-label="Commands"
              ref={commandTrigger}
              onClick={openCommands}
              aria-expanded={tab === 'model' || commandsOpen}
              aria-controls="studio-commands"
            >
              <Send size={15} /> Commands <kbd>/</kbd>
            </button>
          </div>
          <Tool
            label="Connections & voice"
            onClick={() => openDialog('settings')}
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
                  <h1>Explore the concepts</h1>
                </div>
                <p>Four directions for {spec.site.name.split(',')[0]}.</p>
              </div>
              <div className="concept-strip">
                {projectConcepts.map((d) => (
                  <button
                    className={`concept-tile ${selected === d.id ? 'selected' : ''}`}
                    aria-pressed={selected === d.id}
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
              <div className="concept-layout">
                <div className="image-stage">
                  <img
                    src={conceptImage(spec, selected)}
                    alt={`${c.name}, a speculative data-center exterior concept`}
                  />
                </div>
                <aside className="concept-info">
                  <div className="section-kicker">
                    Concept {c.id}
                    <span className="pill">Selected</span>
                  </div>
                  <h2>{c.name}</h2>
                  <p>{c.description}</p>
                  <button className="accent-button" onClick={developSelected}>
                    View in 3D <ArrowRight size={17} />
                  </button>
                  <h3 className="inspector-label">Materials</h3>
                  <div className="material-palette">
                    {c.colors.map((color, i) => (
                      <div key={color}>
                        <span style={{ background: color }} />
                        <small>{c.materials[i]}</small>
                      </div>
                    ))}
                  </div>
                  <details className="context-details">
                    <summary>Context & limitations</summary>
                    <p>{c.inspiration}</p>
                    <p>{c.tradeoff}</p>
                    <button
                      className="text-link"
                      onClick={() => setTab('place')}
                    >
                      View site context <ArrowUpRight size={14} />
                    </button>
                  </details>
                </aside>
              </div>
              <div className="under-gallery">
                <span>
                  Conceptual exterior study · Approximate envelope {spec.length}{' '}
                  × {spec.width} m
                </span>
              </div>
            </>
          )}
          {tab === 'place' && (
            <>
              <div className="workspace-heading">
                <div>
                  <div className="eyebrow">Site context</div>
                  <h1>
                    {isPortland
                      ? 'The working edge of Portland.'
                      : spec.site.name.split(',')[0]}
                  </h1>
                </div>
                <button
                  className="outline-button"
                  onClick={() => {
                    if (evidenceSection.current) {
                      evidenceSection.current.open = true;
                      evidenceSection.current.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                      evidenceSection.current.querySelector('summary')?.focus();
                    }
                  }}
                >
                  <BookOpen size={15} /> Prepared research
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
                  <h2>Study brief</h2>
                  <p>{spec.site.location}</p>
                  <button
                    className="accent-button"
                    onClick={() => setTab('concepts')}
                  >
                    Explore concepts <ArrowRight size={16} />
                  </button>
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
                  <p className="fineprint">
                    Building footprint ·{' '}
                    {(spec.length * spec.width).toLocaleString()} m²
                  </p>
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
              <details className="place-section" ref={evidenceSection}>
                <summary>
                  Research & evidence <span>{shownSources.length} sources</span>
                </summary>
                {!spec.researchReady && (
                  <p className="inline-warning">
                    Local research is pending. Precedent material is not
                    evidence about this location.
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
                <details className="reference-section">
                  <summary>Architectural references</summary>
                  {spec.demoContext === 'presidio' && <ContextGallery />}
                </details>
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
              </details>
              <details className="place-section">
                <summary>Unresolved impacts</summary>
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
              </details>
            </>
          )}
          {(tab === 'model' || tab === 'film') && (
            <div className="workspace-heading">
              <div>
                <div className="eyebrow">
                  {tab === 'model'
                    ? '3D model'
                    : `Film · ${activeConcept.name}`}
                </div>
                <h1>
                  {tab === 'model' ? activeConcept.name : 'Create a film'}
                </h1>
              </div>
              <div className="heading-tools">
                {tab === 'model' && (
                  <>
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
                      onClick={() => openDialog('history')}
                    >
                      <History size={17} />
                    </Tool>
                    <button
                      className="accent-button"
                      onClick={() => setTab('film')}
                    >
                      Create film <ArrowRight size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          {sceneMounted && canOpenModel(spec) && (
            <div
              className={`model-layout ${tab === 'film' ? 'film-model-layout' : ''}`}
              style={{
                display: tab === 'model' || tab === 'film' ? 'grid' : 'none',
                ...(tab === 'film'
                  ? ({
                      position: 'absolute',
                      left: -10000,
                      width: 1100,
                      visibility: 'hidden',
                    } as const)
                  : {}),
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
                    key={spec.concept}
                    spec={spec}
                    onStatus={onSceneStatus}
                    onSelect={(f) => {
                      setElement(f);
                      notify(
                        `${featureLabels[f]} selected. Reference model feature.`,
                      );
                    }}
                    onReady={onSceneReady}
                    visible={tab === 'model'}
                    walk={walk}
                  />
                </Suspense>
                {sceneReady && (
                  <div className="model-top-controls">
                    <span className="image-chip">{viewNames[spec.view]}</span>
                  </div>
                )}
                {sceneStatus === 'unavailable' && (
                  <div className="scene-recovery">
                    <button
                      className="outline-button"
                      onClick={() => setTab('concepts')}
                    >
                      Back to concepts <ArrowRight size={15} />
                    </button>
                  </div>
                )}
                <div className="model-tools">
                  <Tool
                    label="Compare concept reference"
                    active={compare}
                    onClick={() => setCompare((v) => !v)}
                  >
                    <ImageIcon size={17} />
                  </Tool>
                  <Tool
                    label="Save presentation view"
                    disabled={!sceneReady}
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
                  <Tool
                    label="Reset camera"
                    disabled={!sceneReady}
                    onClick={() => sceneAPI?.reset()}
                  >
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
                {sceneReady && (
                  <>
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
                  </>
                )}
              </div>
              {tab === 'model' && (
                <aside className="model-inspector">
                  <label className="field-label">
                    Direction
                    <select
                      value={spec.concept}
                      onChange={(e) => {
                        const id = e.target.value as ConceptId;
                        setSelected(id);
                        commit(fixedDemoSpec(spec, id));
                      }}
                    >
                      {projectConcepts.map((direction) => (
                        <option key={direction.id} value={direction.id}>
                          {direction.id} · {direction.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Camera
                    <select
                      value={spec.view}
                      disabled={!sceneReady}
                      onChange={(e) => {
                        setWalk(false);
                        commit({ ...spec, view: e.target.value as View });
                      }}
                    >
                      {(Object.keys(viewNames) as View[]).map((v) => (
                        <option value={v} key={v}>
                          {viewNames[v]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {spec.view === 'entrance' && (
                    <button
                      className={`outline-button ${walk ? 'active' : ''}`}
                      disabled={!sceneReady}
                      aria-pressed={walk}
                      onClick={() => setWalk(!walk)}
                    >
                      <Footprints size={16} />
                      {walk ? 'Stop walking' : 'Walk through model'}
                    </button>
                  )}
                  <div className="daylight-control">
                    <label>
                      <Sun size={15} /> Daylight{' '}
                      <strong>{spec.hour.toFixed(0)}:00</strong>
                    </label>
                    <Slider
                      aria-label="Daylight hour"
                      disabled={!sceneReady}
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
                  {element && (
                    <p className="selected-feature">
                      Selected: {featureLabels[element]}
                    </p>
                  )}
                  <details className="context-details">
                    <summary>About this model</summary>
                    <p>
                      Approximate exterior based on the concept reference.
                      Hidden geometry and dimensions are inferred.
                    </p>
                    <p>
                      Equipment and concealed construction are schematic.
                      Daylight is illustrative, not a solar analysis.
                    </p>
                  </details>
                </aside>
              )}
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
          {sceneMounted && canOpenModel(spec) && (
            <div hidden={tab !== 'film'}>
              <Suspense
                fallback={
                  <div className="panel-loading">
                    Opening the film workspace…
                  </div>
                }
              >
                <FilmPanel
                  key={spec.id}
                  spec={spec}
                  api={sceneAPI}
                  onMessage={notify}
                  visible={tab === 'film'}
                  onConcept={(concept) => commit(fixedDemoSpec(spec, concept))}
                />
              </Suspense>
            </div>
          )}
        </div>
        <section
          id="studio-commands"
          className="command-section"
          aria-label="Model commands"
          hidden={tab !== 'model' && !commandsOpen}
        >
          <div className="command-heading">
            <span>Camera & daylight</span>
            <button
              className="plain"
              aria-label="Close commands"
              onClick={() => {
                setCommandsOpen(false);
                commandTrigger.current?.focus();
              }}
              hidden={tab === 'model'}
            >
              <X size={16} />
            </button>
          </div>
          <div className="voice-dock">
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
                onClick={() => openDialog('history')}
              >
                <span className="voice-spark">✳</span>
              </button>
              <input
                ref={input}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && tab !== 'model') {
                    setCommandsOpen(false);
                    commandTrigger.current?.focus();
                  }
                }}
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
                : 'Try “aerial view” or “set daylight to 18” · Enter to apply'}
            </span>
          </div>
        </section>
        {message && (
          <output className="studio-feedback" aria-live="polite">
            <span>{message}</span>
            <button
              aria-label="Dismiss feedback"
              onClick={() => setMessage('')}
            >
              <X size={13} />
            </button>
          </output>
        )}
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
            finalFocus={dialogOpener}
            className={`studio-dialog ${dialog === 'history' ? 'wide-dialog' : ''}`}
          >
            <DialogTitle>
              {dialog === 'new'
                ? 'New study'
                : dialog === 'export'
                  ? 'Export study'
                  : dialog === 'settings'
                    ? 'Connections & voice'
                    : dialog === 'history'
                      ? 'History'
                      : 'Export a task'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'new'
                ? 'Start from a real place, or return to a saved study.'
                : dialog === 'export'
                  ? `${spec.name} · revision ${spec.revision} · Schematic design`
                  : dialog === 'settings'
                    ? 'Manage voice and earlier AIand film connections. Typed camera and daylight commands work without a connection.'
                    : dialog === 'history'
                      ? 'Review conversations and restore a previous version.'
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
                        {sceneAPI ? ', GLB and seven model views' : ''}.
                      </p>
                    </div>
                    <Download size={18} />
                  </button>
                  {!sceneAPI && (
                    <p className="inline-warning">
                      {sceneStatus === 'unavailable'
                        ? '3D is unavailable in this session. Reload the page to retry, or export a project backup.'
                        : 'Open the 3D model to include GLB and presentation renders.'}{' '}
                      <button
                        className="text-link"
                        disabled={sceneStatus === 'unavailable'}
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
                      <p>Portable JSON backup of this study.</p>
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
                      <strong>Exterior model</strong>
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
                    <strong>Earlier AIand films</strong>
                    <p>
                      {capabilities?.video
                        ? 'Connected · earlier films available in Film'
                        : 'Optional credential for earlier films'}
                    </p>
                    <code>AIAND_API_KEY</code>
                    <p>
                      New cinematic films render directly from your 3D model on
                      this device. This connection is only needed to retrieve
                      earlier AIand films.
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

                <button
                  className="outline-button"
                  onClick={() => {
                    setDialog(null);
                    openCommands();
                    setTranscript('Aerial view');
                  }}
                >
                  Try a camera command <ArrowRight size={14} />
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
                              openCommands();
                            }}
                          >
                            Edit and reapply <ArrowRight size={12} />
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      Your camera and daylight commands will appear here.
                    </p>
                  )}
                  <div className="command-examples">
                    {[
                      'Aerial view',
                      'Set daylight to 18',
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
                    <span>{activeConcept.name}</span>
                    <small>
                      {viewNames[spec.view]} · {spec.hour}:00 daylight
                    </small>
                  </div>
                  {[...past].reverse().map((p, i) => (
                    <button
                      key={`${p.revision}-${i}`}
                      onClick={() => {
                        commit(
                          { ...p, revision: spec.revision },
                          `Restored revision ${p.revision}.`,
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
                          {viewNames[p.view]} · {p.hour}:00 daylight
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
