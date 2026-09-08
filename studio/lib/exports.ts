import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { drawingSVG, sheets, type SheetId } from './drawings';
import { type BuildingSpec } from './spec';
import { sources, impacts } from './research';
import { download } from './download';
import type { SceneAPI } from '@/components/placeform/scene';
export async function drawingPDF(
  spec: BuildingSpec,
  ids: SheetId[] = sheets.map((s) => s.id),
) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  for (let i = 0; i < ids.length; i++) {
    if (i) pdf.addPage('a3', 'landscape');
    const svg = new DOMParser().parseFromString(
      drawingSVG(spec, ids[i]),
      'image/svg+xml',
    ).documentElement;
    await pdf.svg(svg as unknown as SVGElement, {
      x: 0,
      y: 0,
      width: 420,
      height: 297,
    });
  }
  return pdf.output('blob');
}
export async function reviewPackage(
  spec: BuildingSpec,
  scene: SceneAPI | undefined,
  onProgress: (s: string) => void,
) {
  const zip = new JSZip();
  zip.file('building-specification.json', JSON.stringify(spec, null, 2));
  zip.file('site-boundary.geojson', JSON.stringify(spec.site.polygon, null, 2));
  for (const sheet of sheets)
    zip.file(
      `drawings/${sheet.id}-${sheet.kind}.svg`,
      drawingSVG(spec, sheet.id),
    );
  onProgress('Preparing the dimensioned drawing set…');
  zip.file('drawings/schematic-review.pdf', await drawingPDF(spec));
  const projectSources = spec.researchReady
    ? spec.evidence || (spec.id === 'central-eastside' ? sources : [])
    : [];
  zip.file(
    'research/sources.json',
    JSON.stringify(
      {
        project: spec.name,
        verifiedContext: projectSources,
        brief: spec.brief,
        siteAssumptions: spec.site.notes,
        impacts,
      },
      null,
      2,
    ),
  );
  if (scene) {
    onProgress('Exporting the editable exterior model…');
    zip.file('model/exterior.glb', await scene.glb());
    for (const [view, hour] of [
      ['perspective', 15],
      ['entrance', 15],
      ['aerial', 15],
      ['entrance', 19],
    ] as const) {
      onProgress(
        `Rendering ${view} ${hour >= 18 ? 'at dusk' : 'in daylight'}…`,
      );
      zip.file(`views/${view}-${hour}.png`, await scene.capture(view, hour));
    }
  }
  zip.file(
    'README.txt',
    `PLACEFORM — ${spec.name}\nRevision ${spec.revision}\nSCHEMATIC DESIGN — NOT FOR CONSTRUCTION\n\nThe SVG and PDF drawings, GLB and presentation views derive from the same versioned building specification. Print PDF at 100% on A3. Dimensions in metres.\n\n${spec.site.notes}\n\nNo site entitlement, noise, cooling-water, energy, carbon or flood-performance claims are established. Concealed construction and equipment are schematic.\n\n${scene ? 'Includes actual model renders and geometry.' : 'Model was unavailable; this package includes specification and drawings only.'}\n`,
  );
  onProgress('Packing the review package…');
  download(
    await zip.generateAsync({ type: 'blob' }),
    `placeform-${spec.id}-r${spec.revision}.zip`,
    'application/zip',
  );
}
export async function taskPackage(
  spec: BuildingSpec,
  prompt: string,
  kind: 'research' | 'assets',
  scene?: SceneAPI,
) {
  const zip = new JSZip();
  zip.file('specification.json', JSON.stringify(spec, null, 2));
  const task = {
    taskId: crypto.randomUUID(),
    projectId: spec.id,
    revision: spec.revision,
    kind,
    prompt,
    site: spec.site,
    locks: spec.locks,
    selectedConcept: spec.concept,
    requirements:
      kind === 'research'
        ? [
            'Use current primary local sources; cite direct URLs.',
            'Separate verified facts, design interpretations, and assumptions.',
            'Research history, architecture, climate, ecology, neighbors, resource use and risks.',
            'Return a JSON object {projectId,revision,brief,sources:[{title,url,fact,response,limitation}]}.',
          ]
        : [
            'Preserve site and massing scale unless explicitly requested.',
            'Preserve all locked features.',
            'Use the actual model reference views for silhouette, entrances and facade rhythm.',
            'Return PNG/JPEG concept images. Keep any new geometry as a reviewable proposed specification.',
          ],
    integration:
      'Export this task to Codex / ChatGPT with supported subscription tools. The application cannot invoke the subscription directly.',
  };
  zip.file('task.json', JSON.stringify(task, null, 2));
  zip.file(
    'TASK.md',
    `# Placeform ${kind} handoff\n\n${prompt}\n\nProject: ${spec.name}; revision: ${spec.revision}.\n\n${task.requirements.map((x) => '- ' + x).join('\n')}\n\nImport results through Placeform’s handoff panel; review before applying.\n`,
  );
  if (scene && kind === 'assets')
    for (const view of [
      'perspective',
      'north',
      'south',
      'east',
      'west',
      'aerial',
      'detail',
    ] as const)
      zip.file(`references/${view}.png`, await scene.capture(view));
  download(
    await zip.generateAsync({ type: 'blob' }),
    `placeform-${kind}-task-r${spec.revision}.zip`,
  );
}
