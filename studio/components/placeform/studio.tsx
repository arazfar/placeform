'use client';
// Imperative browser engines and persisted external sessions are intentionally outside React Compiler.
// Native images support local/blob imports. Silent model films have no spoken audio to caption.
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
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
  Plus,
  Check,
  ArrowRight,
  Undo2,
  Redo2,
  LockKeyhole,
  LockKeyholeOpen,
  SlidersHorizontal,
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
  clone,
  applyConcept,
  conceptImage,
  featureLabels,
  validSpec,
  storageKey,
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
import SiteWorkflowStatus, { type SiteWorkflowRequest } from './site-workflow';
import { freshSiteDesign } from '@/lib/site-workflow';
import GenerationPanel, { type GenerationRequest } from './generation-panel';
const Scene = lazy(() => import('./scene'));
const SiteMap = lazy(() => import('./site-map'));
const FilmPanel = lazy(() => import('./film-panel'));
const stages = [
  { id: 'place', label: 'Site', icon: MapPin },
  { id: 'concepts', label: 'Concepts', icon: Layers },
  { id: 'model', label: '3D model', icon: Box },
  { id: 'drawings', label: 'Drawings', icon: Compass },
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
  const [spec, setSpec] = useState<BuildingSpec>(createDemo),
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
    [walk, setWalk] = useState(false),
    [sheet, setSheet] = useState<SheetId>('S01'),
    [busy, setBusy] = useState(''),
    [compare, setCompare] = useState(false),
    [handoffKind, setHandoffKind] = useState<'research' | 'assets'>('assets'),
    [taskPrompt, setTaskPrompt] = useState(''),
    [newName, setNewName] = useState(''),
    [voiceMessages, setVoiceMessages] = useState<
      { role: string; text: string }[]
    >([]),
    [draftImport, setDraftImport] = useState<{
      kind: string;
      data: unknown;
      title: string;
    } | null>(null),
    [, setCustomSources] = useState<typeof sources>([]);
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
  const [generationRequest, setGenerationRequest] =
    useState<GenerationRequest | null>(null);
  const [siteWorkflowRequest, setSiteWorkflowRequest] =
    useState<SiteWorkflowRequest | null>(null);
  const projectConcepts = spec.directions || concepts;
  const c = projectConcepts.find((c) => c.id === selected)!,
    activeConcept = projectConcepts.find((c) => c.id === spec.concept)!;
  function openGeneration(kind: GenerationRequest['kind'], prompt = '') {
    setDialog(null);
    setGenerationRequest({ kind, prompt, key: Date.now() });
  }
  function notify(text: string) {
    setMessage(text);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setMessage(''), 9500);
  }
  useEffect(() => {
    try {
      const raw = decodeProjects(localStorage.getItem(storageKey));
      const projects = Array.isArray(raw.projects)
        ? raw.projects.filter((p: SavedState) => validSpec(p.project))
        : [];
      setSavedProjects(projects);
      const active =
        projects.find((p: SavedState) => p.project.id === raw.active) ||
        projects[0];
      if (active) {
        setSpec(active.project);
        setCustomSources(active.project.evidence || []);
        setSelected(active.project.concept);
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
      try {
        const raw = decodeProjects(localStorage.getItem(storageKey));
        const other = (raw.projects || []).filter(
          (p: SavedState) => p.project?.id !== spec.id && validSpec(p.project),
        );
        const entry = {
          project: spec,
          past: past.slice(-30),
          future: future.slice(-30),
          saved: new Date().toISOString(),
        };
        const projects = [entry, ...other].slice(0, 12);
        localStorage.setItem(
          storageKey,
          encodeProjects({ active: spec.id, projects }),
        );
        setSavedProjects(projects);
        setSaveState('Saved locally');
      } catch {
        setSaveState('Save failed');
        notify(
          'Browser storage is full or unavailable. Export your project JSON to preserve this revision.',
        );
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [spec, past, future, ready]);
  useEffect(() => {
    if (tab === 'model' || tab === 'film') setSceneMounted(true);
  }, [tab]);
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
    const old = stateRef.current.spec;
    if (
      JSON.stringify({ ...old, revision: 0 }) ===
      JSON.stringify({ ...next, revision: 0 })
    )
      return;
    const n = { ...next, revision: nextRevision() };
    setPast((p) => [...p, clone(old)].slice(-30));
    setFuture([]);
    stateRef.current = { ...stateRef.current, spec: n };
    setSpec(n);
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
        [...v, { role: 'Watt & Wonder', text: msg }].slice(-12),
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
            role: 'Watt & Wonder',
            text: 'A model proposal is ready to generate and review in the app.',
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
            [...v, { role: 'Watt & Wonder', text }].slice(-12),
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
    const n = freshSiteDesign(
      createDemo(),
      siteAt(spec.site.center, spec.site.location),
    );
    n.id = crypto.randomUUID();
    n.name = newName.trim() || 'Untitled study';
    n.brief = 'Select a site on the map to begin your design.';
    setSiteWorkflowRequest(null);
    setSpec(n);
    setPast([]);
    setFuture([]);
    setSelected('A');
    setCustomSources([]);
    setTab('place');
    setDialog(null);
    setNewName('');
    notify('Find a place, then drag to select your site.');
  }
  function loadProject(p: SavedState) {
    setSpec(p.project);
    setCustomSources(p.project.evidence || []);
    setSelected(p.project.concept);
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
            'This is not a valid Watt & Wonder specification. Dimensions, site geometry or schema are invalid.',
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
  const showVoiceDock =
    tab !== 'place' ||
    ['connecting', 'listening', 'thinking', 'speaking'].includes(voiceState);
  const shownSources = spec.researchReady
    ? spec.evidence || (isPortland ? sources : [])
    : [];
  return (
    <TooltipProvider>
      <main className="studio">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Watt & Wonder studio">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <path
                  d="M7 12l6 18 7-18 7 18 6-18"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 7h16M16 34h8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            </span>
            <span className="brand-wordmark">
              Watt <i>&</i> Wonder<small>ARCHITECTURE STUDIO</small>
            </span>
          </a>
          <button
            className="project-title"
            onClick={() => setDialog('new')}
            aria-label={`Switch project: ${spec.name}`}
          >
            <span
              className={`project-dot ${saveState === 'Save failed' ? 'error' : ''}`}
              title={saveState}
            />
            <span className="project-context">
              <strong>{spec.name}</strong>
              <small>
                {spec.site.location === 'Portland, Oregon'
                  ? 'Portland, Oregon'
                  : spec.site.location}
              </small>
            </span>
            {saveState === 'Save failed' && (
              <output className="save-error">Save failed</output>
            )}
            <ChevronDown size={14} />
          </button>
          <div className="top-actions">
            <button
              className="plain"
              onClick={() => setDialog('new')}
              aria-label="New project"
            >
              <Plus size={16} /> <span>New project</span>
            </button>
            <button className="dark-button" onClick={() => setDialog('export')}>
              Export <ArrowUpRight size={15} />
            </button>
          </div>
        </header>
        <div className={`stage-bar ${tab === 'place' ? 'site-stage-bar' : ''}`}>
          <Tabs value={tab} onValueChange={setTab} className="stage-navigation">
            <TabsList className="stage-tabs" aria-label="Design stages">
              {stages.map(({ id, label, icon: Icon }, i) => (
                <TabsTrigger value={id} key={id}>
                  <Icon size={16} />
                  {label}
                  <span className="stage-number">0{i + 1}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="stage-actions">
            {tab !== 'place' && (
              <button
                className="outline-button generate-button"
                onClick={() =>
                  openGeneration(tab === 'model' ? 'design' : 'concepts')
                }
              >
                <span>Generate & review</span> <ArrowUpRight size={15} />
              </button>
            )}
            <Tool
              label="Connections & voice"
              onClick={() => setDialog('settings')}
            >
              <Settings2 size={17} />
            </Tool>
          </div>
        </div>
        <div className="workflow-row">
          <SiteWorkflowStatus
            spec={spec}
            ready={ready}
            request={siteWorkflowRequest}
            getSpec={() => stateRef.current.spec}
            onApply={(next) => {
              commit(next);
              setCustomSources(next.evidence || []);
            }}
          />
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
                  Find a starting point, then make it your own.
                </p>
              </div>
              <div className="concept-layout">
                <div className="concept-gallery">
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
                      title="Develop in 3D"
                      aria-label="Develop in 3D"
                      onClick={() => {
                        commit(applyConcept(spec, selected));
                        setTab('model');
                      }}
                    >
                      <Box size={17} />
                    </button>
                    <div className="image-bottom">
                      <span>EXTERIOR STUDY / {c.id}</span>
                      <span>
                        {spec.assets[selected]
                          ? 'Imported concept image'
                          : 'AI concept image'}{' '}
                        · Design intent
                      </span>
                    </div>
                  </div>
                  <div className="concept-strip">
                    {projectConcepts.map((d) => (
                      <button
                        className={`concept-tile ${selected === d.id ? 'selected' : ''}`}
                        onClick={() => setSelected(d.id)}
                        aria-pressed={selected === d.id}
                        aria-label={`Explore direction ${d.id}: ${d.name}`}
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
                  <button
                    className="accent-button"
                    onClick={() => {
                      commit(
                        applyConcept(spec, selected),
                        `${c.name} selected. ${spec.locks.length ? 'Locked features retained.' : 'The model is ready to explore.'}`,
                      );
                      setTab('model');
                    }}
                  >
                    Develop this direction <ArrowRight size={17} />
                  </button>
                </aside>
              </div>
              <div className="under-gallery">
                <span>
                  Approximate scale · {spec.length} × {spec.width} m envelope ·
                  comparable viewpoints
                </span>
                <button
                  className="text-link"
                  onClick={() => {
                    openGeneration(
                      'image',
                      `Refine concept ${selected}: ${c.name}. Preserve the approved silhouette and locked features; resolve roof, entrance and facade details.`,
                    );
                  }}
                >
                  Refine this direction <ArrowUpRight size={13} />
                </button>
              </div>
            </>
          )}
          {tab === 'place' && (
            <>
              <div className="workspace-heading site-heading">
                <div>
                  <div className="eyebrow">01 / START WITH A PLACE</div>
                  <h1>Choose your site.</h1>
                  <p>
                    Find a place. Drag to select an area. Release to start your
                    design.
                  </p>
                </div>
              </div>
              <div className="place-layout">
                <Suspense
                  fallback={
                    <div className="panel-loading">Opening the site map…</div>
                  }
                >
                  <SiteMap
                    spec={spec}
                    onEditComplete={(site) => {
                      const current = stateRef.current.spec;
                      if (JSON.stringify(site) === JSON.stringify(current.site))
                        return;
                      const next = freshSiteDesign(current, site);
                      commit(next);
                      setSiteWorkflowRequest({
                        id: crypto.randomUUID(),
                        spec: next,
                      });
                    }}
                    onMessage={notify}
                  />
                </Suspense>
                <aside className="site-brief">
                  <div className="section-kicker">
                    CURRENT SELECTION <MapPin size={14} />
                  </div>
                  <h2>{spec.site.name.split(',')[0]}</h2>
                  <p>{spec.site.location}</p>
                  <div className="site-stats">
                    <div>
                      <strong>
                        {(siteArea(spec.site) / 10000).toFixed(2)}
                        <span>ha</span>
                      </strong>
                      <small>Illustrative boundary</small>
                    </div>
                  </div>
                  <p className="site-next-step">
                    Selecting a site starts local research and four design
                    directions automatically.
                  </p>
                  <button
                    className="accent-button"
                    onClick={() => setTab('concepts')}
                  >
                    View concepts <ArrowRight size={16} />
                  </button>
                  <details className="site-details">
                    <summary>Site details & design brief</summary>
                    <p>
                      Long-axis bearing: {spec.site.rotation.toFixed(0)}°.
                      Building footprint:{' '}
                      {(spec.length * spec.width).toLocaleString()} m².
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
                            setSpec((s) => ({
                              ...s,
                              revision: nextRevision(),
                            }));
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
                      className="outline-button"
                      disabled={!past.length}
                      onClick={() => history('undo')}
                    >
                      <Undo2 size={15} /> Undo last change
                    </button>
                  </details>
                </aside>
              </div>
              <details className="site-research">
                <summary>
                  Research, local context & design impacts{' '}
                  <span>{shownSources.length} sources</span>
                </summary>
                <button
                  className="outline-button"
                  onClick={() =>
                    openGeneration(
                      'research',
                      `Research the selected site at ${spec.site.name}. Curate architectural history, materials, climate, landscape, surrounding buildings and community concerns into a cited design brief.`,
                    )
                  }
                >
                  <BookOpen size={15} />{' '}
                  {spec.researchReady
                    ? 'Extend the research'
                    : 'Research this site'}
                </button>
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
                    {spec.evidence?.length
                      ? 'GENERATED RESEARCH'
                      : 'CHECKED SEP 2026'}
                  </span>
                </div>
                {!spec.researchReady && (
                  <p className="inline-warning">
                    Local research is pending. The Portland references are
                    precedent material, not evidence about this new location.
                  </p>
                )}
                <div className="research-grid">
                  {shownSources.map((r) => (
                    <article className="research-card" key={r.id}>
                      <div className="section-kicker">
                        {r.category}
                        <span>{r.id}</span>
                      </div>
                      <h3>{r.title}</h3>
                      <span className="evidence-label">
                        {spec.evidence?.length
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
              </details>
            </>
          )}
          {(tab === 'model' || tab === 'film') && (
            <div className="workspace-heading">
              <div>
                <div className="eyebrow">
                  {tab === 'model'
                    ? '03 / THE ARCHITECTURE, RESOLVED'
                    : '05 / PRESENT THE DESIGN'}{' '}
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
          {sceneMounted && (
            <div
              className={`model-layout ${tab === 'film' ? 'film-model-layout' : ''}`}
              hidden={tab !== 'model' && tab !== 'film'}
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
                        `${featureLabels[f]} selected. Voice edits are grounded in this element.`,
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
                      aria-pressed={spec.view === 'perspective'}
                      onClick={() => commit({ ...spec, view: 'perspective' })}
                    >
                      <Move3D size={14} /> Orbit
                    </button>
                    <button
                      className={spec.view === 'entrance' ? 'active' : ''}
                      aria-pressed={spec.view === 'entrance'}
                      onClick={() => commit({ ...spec, view: 'entrance' })}
                    >
                      <Footprints size={14} /> Walk
                    </button>
                    <button
                      className={spec.view === 'aerial' ? 'active' : ''}
                      aria-pressed={spec.view === 'aerial'}
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
                    DESIGN CONTROLS <SlidersHorizontal size={15} />
                  </div>
                  <h2>
                    {element ? featureLabels[element] : 'Make it your own.'}
                  </h2>
                  <p>
                    {element
                      ? 'The selected feature grounds your next voice instruction.'
                      : 'Select a building element, or tell Watt & Wonder what to change.'}
                  </p>
                  <div className="lock-list">
                    {(Object.keys(featureLabels) as Feature[]).map((f) => (
                      <div className={element === f ? 'selected' : ''} key={f}>
                        <button
                          onClick={() => setElement(f)}
                          aria-pressed={element === f}
                        >
                          {featureLabels[f]}
                        </button>
                        <Tool
                          label={`${spec.locks.includes(f) ? 'Unlock' : 'Lock'} ${featureLabels[f].toLowerCase()}`}
                          active={spec.locks.includes(f)}
                          onClick={() =>
                            dispatch({
                              type: spec.locks.includes(f) ? 'unlock' : 'lock',
                              feature: f,
                            })
                          }
                        >
                          {spec.locks.includes(f) ? (
                            <LockKeyhole size={14} />
                          ) : (
                            <LockKeyholeOpen size={14} />
                          )}
                        </Tool>
                      </div>
                    ))}
                  </div>
                  <div className="parameter">
                    <label>
                      Facade fin depth{' '}
                      <strong data-testid="fin-depth">
                        {spec.finDepth.toFixed(2)} m
                      </strong>
                    </label>
                    <Slider
                      aria-label="Facade fin depth"
                      value={[spec.finDepth]}
                      min={0.2}
                      max={2.5}
                      step={0.05}
                      disabled={spec.locks.includes('facade')}
                      onValueChange={(v) => {
                        const val = Array.isArray(v) ? v[0] : v;
                        if (!dragStart.current)
                          dragStart.current = clone(stateRef.current.spec);
                        setSpec((s) => ({ ...s, finDepth: val }));
                      }}
                      onValueCommitted={(v) => {
                        const val = Array.isArray(v) ? v[0] : v;
                        if (dragStart.current) {
                          const prev = dragStart.current;
                          setPast((p) => [...p, prev].slice(-30));
                          setFuture([]);
                          setSpec((s) => ({
                            ...s,
                            finDepth: val,
                            revision: nextRevision(),
                          }));
                          dragStart.current = null;
                        }
                      }}
                    />
                  </div>
                  <div className="parameter">
                    <label>
                      Building height{' '}
                      <strong>{spec.height.toFixed(1)} m</strong>
                    </label>
                    <input
                      type="number"
                      aria-label="Building height"
                      min={8}
                      max={26}
                      step={0.5}
                      value={spec.height}
                      disabled={spec.locks.includes('massing')}
                      onChange={(e) =>
                        dispatch({
                          type: 'set',
                          parameter: 'height',
                          value: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="mix-controls">
                    <span className="field-label">COMBINE DIRECTIONS</span>
                    {(['massing', 'facade', 'landscape'] as const).map((f) => (
                      <label key={f}>
                        {featureLabels[f]}
                        <NativeSelect
                          aria-label={`${featureLabels[f]} concept`}
                          value={
                            f === 'massing'
                              ? spec.concept
                              : f === 'facade'
                                ? spec.material
                                : spec.landscape
                          }
                          disabled={spec.locks.includes(f)}
                          onChange={(e) =>
                            dispatch({ type: 'mix', [f]: e.target.value })
                          }
                        >
                          {projectConcepts.map((c) => (
                            <NativeSelectOption value={c.id} key={c.id}>
                              {c.id} · {c.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
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
                        aria-pressed={spec.view === v}
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
              <div>
                <span className="status-dot" /> One specification coordinates
                geometry, drawings and camera references.
              </div>
              <button className="text-link" onClick={() => setTab('drawings')}>
                Review the schematic drawings <ArrowRight size={14} />
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
              <FilmPanel spec={spec} api={sceneAPI} onMessage={notify} />
            </Suspense>
          )}
        </div>
        <footer
          className={`studio-footer ${showVoiceDock ? '' : 'site-footer'}`}
        >
          <span>
            <span className="status-dot" /> A PLACE-LED DESIGN STUDY
          </span>
          {showVoiceDock ? (
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
                          ? 'Watt & Wonder is speaking…'
                          : 'Where should we take the design?'
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
                  {['listening', 'thinking', 'speaking'].includes(
                    voiceState,
                  ) ? (
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
          ) : (
            message && (
              <output className="site-notice">
                {message}
                <button
                  aria-label="Dismiss feedback"
                  onClick={() => setMessage('')}
                >
                  <X size={14} />
                </button>
              </output>
            )
          )}
          <span>
            R{String(spec.revision).padStart(2, '0')} ·{' '}
            {saveState.toUpperCase()}
          </span>
        </footer>
        <GenerationPanel
          spec={spec}
          selected={selected}
          request={generationRequest}
          onClose={() => setGenerationRequest(null)}
          onOpen={() => openGeneration('research')}
          onMessage={notify}
          capture={
            sceneAPI
              ? () =>
                  sceneAPI.capture(
                    stateRef.current.spec.view,
                    stateRef.current.spec.hour,
                  )
              : undefined
          }
          onApply={(next) => {
            commit(next);
            setCustomSources(next.evidence || []);
          }}
        />
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
                ? 'Find a place, then drag to select your site.'
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
                  PROJECT NAME (OPTIONAL)
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Your new architectural study"
                  />
                </label>
                <button className="accent-button" onClick={startNew}>
                  Choose site on map <ArrowRight size={15} />
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
                      setSpec(n);
                      setPast([]);
                      setFuture([]);
                      setSelected('A');
                      setTab('concepts');
                      setDialog(null);
                    }}
                  >
                    <Layers size={15} />
                    <span>
                      Open prepared Portland study
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
                        Seven SVG/PDF drawings, specification, cited brief
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
                  <label className="file-button">
                    <Upload size={21} /> Import a project JSON
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) =>
                        importFile(e.target.files?.[0], 'project')
                      }
                    />
                  </label>
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
                        ? 'Connected · verify model and price in Film'
                        : 'API credential required'}
                    </p>
                    <code>AIAND_API_KEY</code>
                    <p>
                      Accept video terms in the AIand console. Every submission
                      displays a live quote; H3 availability is checked against
                      the account’s video catalog.
                    </p>
                    <a
                      href="https://docs.aiand.com/api/videos/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Video API documentation <ArrowUpRight size={13} />
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
                      Tell Watt & Wonder what to change. Try “Use A’s massing,
                      B’s facade, and C’s landscape.”
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
