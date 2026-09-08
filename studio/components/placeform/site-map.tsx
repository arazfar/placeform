'use client';
// Imperative browser engines and persisted external sessions are intentionally outside React Compiler.
// Native images support local/blob imports. Silent model films have no spoken audio to caption.
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import {
  Search,
  Pentagon,
  MousePointer2,
  RotateCcw,
  Download,
  MapPin,
} from 'lucide-react';
import type { BuildingSpec, Site } from '@/lib/spec';
import {
  siteArea,
  updateBoundary,
  footprint,
  siteAt,
  fitsSite,
} from '@/lib/site';
import { download } from '@/lib/download';
import 'maplibre-gl/dist/maplibre-gl.css';
maplibregl.setWorkerUrl(mapWorkerUrl);
export default function SiteMap({
  spec,
  onEditComplete,
  onMessage,
}: {
  spec: BuildingSpec;
  onEditComplete: (s: Site, drawn: boolean) => void;
  onMessage: (s: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    draw = useRef<TerraDraw | null>(null);
  const boundaryKey = useRef(JSON.stringify(spec.site.polygon.geometry)),
    syncing = useRef(false);
  const current = useRef(spec),
    change = useRef(onEditComplete);
  current.current = spec;
  change.current = onEditComplete;
  const [mode, setMode] = useState('select'),
    [q, setQ] = useState(''),
    [results, setResults] = useState<
      { display_name: string; lon: string; lat: string }[]
    >([]),
    [searching, setSearching] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!el.current) return;
    let stopped = false;
    const events = new AbortController();
    let held = false,
      pending = false;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const m = new maplibregl.Map({
      container: el.current,
      center: spec.site.center,
      zoom: spec.boundaryConfirmed === false ? 14 : 16.4,
      pitch: 0,
      attributionControl: false,
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
            paint: { 'raster-saturation': -1, 'raster-opacity': 0.65 },
          },
        ],
      },
    });
    map.current = m;
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(el.current);
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      'bottom-right',
    );
    m.addControl(
      new maplibregl.AttributionControl({ compact: false }),
      'bottom-left',
    );
    m.on('error', () => {
      if (!stopped)
        setError(
          'Base map unavailable. Boundary editing and coordinates remain usable.',
        );
    });
    m.on('load', () => {
      if (stopped) return;
      const d = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: m }),
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: '#b8553c',
              fillOpacity: 0.16,
              outlineColor: '#b8553c',
              outlineWidth: 2,
            },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  rotateable: true,
                  coordinates: {
                    draggable: true,
                    midpoints: true,
                    deletable: true,
                  },
                },
              },
            },
            styles: {
              selectedPolygonColor: '#b8553c',
              selectedPolygonFillOpacity: 0.15,
              selectedPolygonOutlineColor: '#b8553c',
              selectionPointColor: '#b8553c',
            },
          }),
        ],
      });
      d.start();
      if (current.current.boundaryConfirmed !== false)
        d.addFeatures([
          {
            ...current.current.site.polygon,
            id: crypto.randomUUID(),
            properties: { mode: 'polygon' },
          },
        ]);
      d.setMode('select');
      draw.current = d;
      if (import.meta.env.DEV) window.__PLACEFORM_MAP = { map: m, draw: d };
      const sync = () => {
        const f = d
          .getSnapshot()
          .filter(
            (f) =>
              f.geometry.type === 'Polygon' && !f.properties.currentlyDrawing,
          );
        const last = f[f.length - 1];
        if (last && last.geometry.type === 'Polygon') {
          if (f.length > 1) d.removeFeatures(f.slice(0, -1).map((f) => f.id!));
          const key = JSON.stringify(last.geometry);
          if (key !== boundaryKey.current) {
            boundaryKey.current = key;
            change.current(
              updateBoundary(current.current.site, {
                type: 'Feature',
                properties: { mode: 'polygon' },
                geometry: last.geometry as GeoJSON.Polygon,
              }),
              true,
            );
          }
        }
      };
      const finish = () => {
        if (stopped || syncing.current) return;
        pending = false;
        sync();
        if (d.getMode() === 'polygon') {
          d.setMode('select');
          setMode('select');
        }
      };
      // Midpoint insertion emits finish at drag START. Wait for pointer release,
      // including releases outside the map, and let Terra Draw finish its event first.
      m.getContainer().addEventListener(
        'pointerdown',
        () => {
          held = true;
        },
        { capture: true, signal: events.signal },
      );
      window.addEventListener(
        'pointerup',
        () => {
          held = false;
          if (pending) finishTimer = setTimeout(finish, 0);
        },
        { signal: events.signal },
      );
      window.addEventListener(
        'pointercancel',
        () => {
          held = false;
          pending = false;
        },
        { signal: events.signal },
      );
      d.on('finish', () => {
        if (syncing.current) return;
        pending = true;
        clearTimeout(finishTimer);
        if (!held) finishTimer = setTimeout(finish, 0);
      });
      m.addSource('building', {
        type: 'geojson',
        data:
          current.current.boundaryConfirmed === false
            ? { type: 'FeatureCollection', features: [] }
            : footprint(current.current),
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
      setReady(true);
    });
    return () => {
      stopped = true;
      events.abort();
      clearTimeout(finishTimer);
      resize.disconnect();
      draw.current?.stop();
      m.remove();
      map.current = null;
      draw.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const source = map.current?.getSource('building') as
      | maplibregl.GeoJSONSource
      | undefined;
    void source?.setData(
      spec.boundaryConfirmed === false
        ? { type: 'FeatureCollection', features: [] }
        : footprint(spec),
    );
    const key = JSON.stringify(spec.site.polygon.geometry);
    if (
      draw.current &&
      (key !== boundaryKey.current || spec.boundaryConfirmed === false)
    ) {
      syncing.current = true;
      draw.current.clear();
      if (spec.boundaryConfirmed !== false)
        draw.current.addFeatures([
          {
            ...spec.site.polygon,
            id: crypto.randomUUID(),
            properties: { mode: 'polygon' },
          },
        ]);
      boundaryKey.current = key;
      syncing.current = false;
      map.current?.easeTo({ center: spec.site.center, duration: 350 });
    }
  }, [spec, ready]);
  async function search(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const coords = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) {
      const lat = Number(coords[1]),
        lon = Number(coords[2]);
      if (Math.abs(lat) > 85 || Math.abs(lon) > 180) {
        onMessage('Use latitude −85 to 85 and longitude −180 to 180.');
        return;
      }
      choose({ display_name: q, lat: String(lat), lon: String(lon) });
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = (await r.json()) as {
        display_name: string;
        lon: string;
        lat: string;
      }[] & { error?: string };
      if (!r.ok) throw new Error(data.error || 'Place search failed.');
      setResults(data);
      if (!data.length)
        onMessage(
          'No places found. Try a city, street, or latitude, longitude.',
        );
    } catch (e) {
      onMessage((e as Error).message);
    } finally {
      setSearching(false);
    }
  }
  function choose(r: { display_name: string; lat: string; lon: string }) {
    const s = siteAt([Number(r.lon), Number(r.lat)], r.display_name);
    onEditComplete(s, false);
    map.current?.flyTo({ center: s.center, zoom: 16.4 });
    setResults([]);
    setQ('');
  }
  function setTool(tool: string) {
    if (!draw.current) return;
    if (tool === 'polygon')
      onMessage(
        'Click to place site corners. Click the first corner to finish.',
      );
    draw.current.setMode(tool);
    setMode(tool);
  }
  return (
    <div className="map-frame">
      <div ref={el} className="map-canvas" />
      <form className="map-search" onSubmit={search}>
        <Search size={16} />
        <input
          aria-label="Search location"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a city, address, or coordinates"
        />
        <button disabled={searching || q.length < 3}>
          {searching ? 'Searching…' : 'Find'}
        </button>
        {results.length > 0 && (
          <div className="map-results">
            {results.map((r) => (
              <button
                key={r.display_name}
                type="button"
                onClick={() => choose(r)}
              >
                <MapPin size={14} />
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </form>
      <div className="map-tools">
        <button
          title="Draw site polygon"
          aria-label="Draw site polygon"
          className={mode === 'polygon' ? 'active' : ''}
          onClick={() => setTool('polygon')}
        >
          <Pentagon size={18} />
        </button>
        <button
          title="Edit site boundary"
          aria-label="Edit site boundary"
          className={mode === 'select' ? 'active' : ''}
          onClick={() => setTool('select')}
        >
          <MousePointer2 size={18} />
        </button>
        <button
          title="Recenter map"
          aria-label="Recenter map"
          onClick={() =>
            map.current?.flyTo({ center: spec.site.center, zoom: 16.4 })
          }
        >
          <RotateCcw size={18} />
        </button>
        <button
          title="Export GeoJSON"
          aria-label="Export GeoJSON"
          onClick={() =>
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
            )
          }
        >
          <Download size={18} />
        </button>
      </div>
      <div className="map-metrics">
        <div>
          <span>STUDY AREA</span>
          <strong>
            {spec.boundaryConfirmed === false
              ? '—'
              : (siteArea(spec.site) / 10000).toFixed(2)}{' '}
            <small>ha</small>
          </strong>
        </div>
        <div>
          <span>LONG-AXIS BEARING</span>
          <strong>
            {spec.site.rotation.toFixed(1)}
            <small>°</small>
          </strong>
        </div>
        <div>
          <span>FOOTPRINT</span>
          <strong>
            {(spec.length * spec.width).toLocaleString()} <small>m²</small>
          </strong>
        </div>
      </div>
      {error && <div className="map-warning">{error}</div>}
      {spec.boundaryConfirmed === false && (
        <div className="map-warning">
          Draw a study boundary to generate your first concept image.
        </div>
      )}
      {spec.boundaryConfirmed !== false && !fitsSite(spec) && (
        <div className="map-warning">
          The current building extends beyond the boundary. Adjust the site or
          reduce the building dimensions.
        </div>
      )}
      <span className="map-legend">
        <i /> Study boundary <i /> Building footprint · illustrative
      </span>
    </div>
  );
}
