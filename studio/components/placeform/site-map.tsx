'use client';
// MapLibre owns its browser canvas outside React's render cycle.
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Search, Scan, Hand, RotateCcw, Download, MapPin } from 'lucide-react';
import type { BuildingSpec, Site } from '@/lib/spec';
import { siteArea, footprint, siteAt, fitsSite } from '@/lib/site';
import {
  SiteSelection,
  clampPoint,
  rectanglePolygon,
  selectedSite,
  centeredSite,
  type SelectionRect,
} from '@/lib/site-selection';
import { download } from '@/lib/download';
import 'maplibre-gl/dist/maplibre-gl.css';
maplibregl.setWorkerUrl(mapWorkerUrl);
type SearchResult = { display_name: string; lon: string; lat: string };
type Tool = 'select' | 'move';
export default function SiteMap({
  spec,
  onEditComplete,
  onMessage,
}: {
  spec: BuildingSpec;
  onEditComplete: (s: Site) => void;
  onMessage: (s: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null);
  const current = useRef(spec),
    change = useRef(onEditComplete);
  current.current = spec;
  change.current = onEditComplete;
  const selection = useRef(new SiteSelection());
  const cancelDrag = useRef<() => void>(() => {});
  const setMapTool = useRef<(tool: Tool) => void>(() => {});
  const searched = useRef<Site | undefined>(undefined);
  const boundaryKey = useRef(JSON.stringify(spec.site.polygon.geometry));
  const projectKey = useRef(spec.id);
  const options = useRef<HTMLDetailsElement>(null);
  const [mode, setMode] = useState<Tool>('select');
  const [q, setQ] = useState(''),
    [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false),
    [ready, setReady] = useState(false);
  const [error, setError] = useState(''),
    [hint, setHint] = useState('');
  const [draft, setDraft] = useState<(SelectionRect & { area: number }) | null>(
    null,
  );
  const searchRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!el.current) return;
    let stopped = false,
      tool: Tool = 'select',
      space = false,
      hovering = false;
    const events = new AbortController(),
      pointers = new Set<number>();
    const m = new maplibregl.Map({
      container: el.current,
      center: current.current.site.center,
      zoom: 16.4,
      pitch: 0,
      attributionControl: false,
      renderWorldCopies: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            paint: { 'raster-saturation': -1, 'raster-opacity': 0.7 },
          },
        ],
      },
    });
    map.current = m;
    const container = m.getContainer(),
      canvas = m.getCanvas();
    const drag = selection.current;
    canvas.setAttribute(
      'aria-label',
      'Site map. Drag to select a site. Use Move map to pan, or Map options for keyboard selection.',
    );
    const cancel = () => {
      const pointer = drag.pointer;
      drag.cancel();
      if (pointer !== undefined && container.hasPointerCapture(pointer))
        container.releasePointerCapture(pointer);
      if (!stopped) setDraft(null);
    };
    cancelDrag.current = cancel;
    const configure = () => {
      const moving = tool === 'move' || space;
      if (moving) m.dragPan.enable();
      else m.dragPan.disable();
      // Rectangular selection owns drag; wheel/pinch remain zoom gestures.
      m.boxZoom.disable();
      m.dragRotate.disable();
      m.touchZoomRotate.disableRotation();
      m.touchPitch.disable();
      if (moving) m.doubleClickZoom.enable();
      else m.doubleClickZoom.disable();
      canvas.style.cursor = moving ? 'grab' : 'crosshair';
    };
    setMapTool.current = (next) => {
      cancel();
      tool = next;
      space = false;
      configure();
    };
    configure();
    const point = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      return clampPoint(
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        bounds.width,
        bounds.height,
      );
    };
    const polygon = (rect: SelectionRect) =>
      rectanglePolygon(rect, (p) => m.unproject(p).toArray());
    const showDraft = (rect?: SelectionRect) => {
      if (!rect) return;
      const shape = polygon(rect);
      setDraft({
        ...rect,
        area: shape ? siteArea({ ...current.current.site, polygon: shape }) : 0,
      });
    };
    container.addEventListener(
      'pointerdown',
      (event) => {
        pointers.add(event.pointerId);
        if (pointers.size > 1) {
          cancel();
          return;
        }
        if (
          event.target !== canvas ||
          !m.getSource('site') ||
          tool !== 'select' ||
          space ||
          event.button !== 0 ||
          !event.isPrimary
        )
          return;
        m.stop();
        drag.begin(event.pointerId, point(event));
        container.setPointerCapture(event.pointerId);
        setHint('');
      },
      { capture: true, signal: events.signal },
    );
    window.addEventListener(
      'pointerdown',
      (event) => {
        if (drag.pointer !== undefined && event.pointerId !== drag.pointer)
          cancel();
      },
      { capture: true, signal: events.signal },
    );
    container.addEventListener(
      'pointermove',
      (event) => showDraft(drag.move(event.pointerId, point(event))),
      { signal: events.signal },
    );
    window.addEventListener(
      'pointerup',
      (event) => {
        pointers.delete(event.pointerId);
        if (drag.pointer !== event.pointerId) return;
        const rect = drag.finish(event.pointerId, point(event));
        cancel();
        if (container.hasPointerCapture(event.pointerId))
          container.releasePointerCapture(event.pointerId);
        if (!rect) {
          setHint('Drag a wider area to select a site.');
          return;
        }
        const shape = polygon(rect);
        if (
          !shape ||
          siteArea({ ...current.current.site, polygon: shape }) < 1
        ) {
          setHint('Choose a larger area within the map.');
          return;
        }
        const site = selectedSite(
          shape,
          current.current.site,
          searched.current,
        );
        boundaryKey.current = JSON.stringify(site.polygon.geometry);
        change.current(site);
        setHint('Site selected. Your design starts automatically.');
      },
      { signal: events.signal },
    );
    window.addEventListener(
      'pointercancel',
      (event) => {
        pointers.delete(event.pointerId);
        cancel();
      },
      { signal: events.signal },
    );
    container.addEventListener('lostpointercapture', cancel, {
      signal: events.signal,
    });
    container.addEventListener(
      'pointerenter',
      () => {
        hovering = true;
      },
      { signal: events.signal },
    );
    container.addEventListener(
      'pointerleave',
      () => {
        hovering = false;
      },
      { signal: events.signal },
    );
    window.addEventListener(
      'keydown',
      (event) => {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.matches('input, textarea, select, button') ||
            target.isContentEditable)
        )
          return;
        if (event.key === 'Escape') {
          cancel();
          return;
        }
        if (
          event.code === 'Space' &&
          (hovering || container.contains(document.activeElement))
        ) {
          event.preventDefault();
          cancel();
          space = true;
          configure();
        }
      },
      { signal: events.signal },
    );
    window.addEventListener(
      'keyup',
      (event) => {
        if (event.code === 'Space' && space) {
          space = false;
          configure();
        }
      },
      { signal: events.signal },
    );
    window.addEventListener(
      'blur',
      () => {
        pointers.clear();
        cancel();
        space = false;
        configure();
      },
      { signal: events.signal },
    );
    const resize = new ResizeObserver(() => {
      cancel();
      m.resize();
    });
    resize.observe(container);
    m.on('movestart', cancel);
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'bottom-right',
    );
    m.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left',
    );
    m.on('error', () => {
      if (!stopped)
        setError(
          'Map tiles are unavailable. You can still search coordinates and select a site.',
        );
    });
    m.on('load', () => {
      if (stopped) return;
      m.addSource('site', {
        type: 'geojson',
        data: current.current.site.polygon,
      });
      m.addLayer({
        id: 'site-fill',
        type: 'fill',
        source: 'site',
        paint: { 'fill-color': '#b8553c', 'fill-opacity': 0.13 },
      });
      m.addLayer({
        id: 'site-outline',
        type: 'line',
        source: 'site',
        paint: { 'line-color': '#a4432d', 'line-width': 2.5 },
      });
      m.addSource('building', {
        type: 'geojson',
        data: footprint(current.current),
      });
      m.addLayer({
        id: 'building-outline',
        type: 'line',
        source: 'building',
        paint: {
          'line-color': '#354a3a',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });
      if (import.meta.env.DEV) window.__PLACEFORM_MAP = { map: m };
      setReady(true);
    });
    return () => {
      stopped = true;
      cancel();
      events.abort();
      searchRequest.current?.abort();
      resize.disconnect();
      m.remove();
      map.current = null;
      if (window.__PLACEFORM_MAP?.map === m) delete window.__PLACEFORM_MAP;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    void (
      map.current?.getSource('building') as maplibregl.GeoJSONSource | undefined
    )?.setData(footprint(spec));
    void (
      map.current?.getSource('site') as maplibregl.GeoJSONSource | undefined
    )?.setData(spec.site.polygon);
    const key = JSON.stringify(spec.site.polygon.geometry);
    if (key !== boundaryKey.current || projectKey.current !== spec.id) {
      cancelDrag.current();
      map.current?.jumpTo({ center: spec.site.center, zoom: 16.4 });
      searched.current = undefined;
      searchRequest.current?.abort();
      setQ('');
      setResults([]);
      setSearching(false);
      boundaryKey.current = key;
      projectKey.current = spec.id;
      setHint('Showing your selected site.');
    }
  }, [spec, ready]);
  async function search(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    cancelDrag.current();
    searchRequest.current?.abort();
    setSearching(false);
    const coords = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) {
      const lat = Number(coords[1]),
        lon = Number(coords[2]);
      if (Math.abs(lat) > 85 || Math.abs(lon) > 180) {
        setHint('Use latitude −85 to 85 and longitude −180 to 180.');
        return;
      }
      choose({ display_name: q, lat: String(lat), lon: String(lon) });
      return;
    }
    const request = new AbortController();
    searchRequest.current = request;
    setSearching(true);
    setResults([]);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
        signal: request.signal,
      });
      const data = (await response.json()) as SearchResult[] & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || 'Place search failed.');
      setResults(data);
      if (!data.length)
        setHint('No places found. Try a city, street, or latitude, longitude.');
    } catch (error) {
      if (!request.signal.aborted) setHint((error as Error).message);
    } finally {
      if (!request.signal.aborted) setSearching(false);
    }
  }
  function choose(result: SearchResult) {
    searchRequest.current?.abort();
    const center: [number, number] = [Number(result.lon), Number(result.lat)];
    if (
      !center.every(Number.isFinite) ||
      Math.abs(center[0]) > 180 ||
      Math.abs(center[1]) > 85
    ) {
      setHint('That location is outside the supported map area.');
      return;
    }
    cancelDrag.current();
    searched.current = siteAt(center, result.display_name);
    map.current?.jumpTo({ center, zoom: 16.4 });
    setMapTool.current('select');
    setMode('select');
    setResults([]);
    setQ(result.display_name);
    setSearching(false);
    setHint('Now drag to select a site.');
  }
  function setTool(tool: Tool) {
    setMapTool.current(tool);
    setMode(tool);
    setHint('');
  }
  function useCenter() {
    const m = map.current;
    if (!m) return;
    cancelDrag.current();
    const site = centeredSite(spec, m.getCenter().toArray(), searched.current);
    boundaryKey.current = JSON.stringify(site.polygon.geometry);
    onEditComplete(site);
    if (options.current) options.current.open = false;
    setHint('Site selected. Your design starts automatically.');
  }
  const warning =
    error ||
    (!fitsSite(spec)
      ? 'The building extends beyond this site. Select a larger area or resize it in Model.'
      : '');
  return (
    <div className="site-map">
      <form className="map-search" onSubmit={search}>
        <Search size={17} aria-hidden="true" />
        <input
          aria-label="Search location"
          value={q}
          onChange={(event) => {
            searchRequest.current?.abort();
            setSearching(false);
            setQ(event.target.value);
            setResults([]);
          }}
          placeholder="City, address, or coordinates"
        />
        <button disabled={searching || q.trim().length < 3}>
          {searching ? 'Finding…' : 'Find'}
        </button>
        {results.length > 0 && (
          <div className="map-results">
            {results.map((result) => (
              <button
                key={`${result.display_name}-${result.lat}-${result.lon}`}
                type="button"
                onClick={() => choose(result)}
              >
                <MapPin size={14} />
                {result.display_name}
              </button>
            ))}
          </div>
        )}
      </form>
      <div className="map-toolbar">
        <fieldset className="map-tools" aria-label="Map interaction">
          <button
            type="button"
            aria-pressed={mode === 'select'}
            onClick={() => setTool('select')}
          >
            <Scan size={16} /> Select site
          </button>
          <button
            type="button"
            aria-pressed={mode === 'move'}
            onClick={() => setTool('move')}
          >
            <Hand size={16} /> Move map
          </button>
        </fieldset>
        <details className="map-options" ref={options}>
          <summary>Map options</summary>
          <div>
            <button type="button" disabled={!ready} onClick={useCenter}>
              <MapPin size={15} /> Use a site at map center
            </button>
            <button
              type="button"
              onClick={() => {
                if (options.current) options.current.open = false;
                cancelDrag.current();
                map.current?.jumpTo({ center: spec.site.center, zoom: 16.4 });
                searched.current = undefined;
                setHint('Showing your selected site.');
              }}
            >
              <RotateCcw size={15} /> Show selected site
            </button>
            <button
              type="button"
              onClick={() => {
                if (options.current) options.current.open = false;
                download(
                  JSON.stringify(
                    {
                      ...spec.site.polygon,
                      properties: {
                        area_m2: siteArea(spec.site),
                        orientation_degrees: spec.site.rotation,
                        name: spec.site.name,
                        notes: spec.site.notes,
                      },
                    },
                    null,
                    2,
                  ),
                  'site-boundary.geojson',
                  'application/geo+json',
                );
                onMessage('Site boundary exported.');
              }}
            >
              <Download size={15} /> Export boundary
            </button>
          </div>
        </details>
      </div>
      <p className="map-instruction" id="map-instruction">
        {mode === 'select'
          ? 'Drag across the map to select your site. Release to start the design.'
          : 'Drag to move the map. Zoom with two fingers or the + and − buttons.'}
      </p>
      <div
        className={`map-frame map-mode-${mode}`}
        aria-describedby="map-instruction"
      >
        <div ref={el} className="map-canvas" />
        {draft && (
          <div
            className="map-selection"
            style={{
              left: draft.left,
              top: draft.top,
              width: draft.width,
              height: draft.height,
            }}
          >
            <span>
              {draft.area >= 1
                ? `${Math.round(draft.area).toLocaleString()} m²`
                : 'Drag to select'}
            </span>
          </div>
        )}
        {!ready && <div className="map-loading">Opening the map…</div>}
        <span className="map-legend">
          <i /> Selected site <i /> Building
        </span>
      </div>
      <output className="map-feedback">
        {hint ||
          'Scroll to zoom. Select Move map to pan. Escape cancels a selection.'}
        {warning && <span className="map-warning">{warning}</span>}
      </output>
    </div>
  );
}
