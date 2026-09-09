import {
  applyConcept,
  clone,
  featureLabels,
  type BuildingSpec,
  type ConceptId,
  type Feature,
  type View,
} from './spec';
export type DesignAction = {
  type:
    | 'set'
    | 'mix'
    | 'view'
    | 'lock'
    | 'unlock'
    | 'undo'
    | 'redo'
    | 'generate';
  feature?: Feature;
  parameter?: string;
  value?: number | string;
  massing?: ConceptId;
  facade?: ConceptId;
  landscape?: ConceptId;
  roof?: ConceptId;
  view?: View;
  hour?: number;
  prompt?: string;
};
export type ActionResult = {
  spec?: BuildingSpec;
  message: string;
  history?: 'undo' | 'redo';
  generation?: string;
};
export const actionTool = {
  type: 'function',
  name: 'update_design',
  description:
    'Apply ONE supported design edit using the current specification, selected element, view and locks. If the referent is ambiguous ask a short clarification. For unsupported geometry use generate. Never claim an edit until tool result succeeds.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: [
          'set',
          'mix',
          'view',
          'lock',
          'unlock',
          'undo',
          'redo',
          'generate',
        ],
      },
      feature: { type: 'string', enum: Object.keys(featureLabels) },
      parameter: {
        type: 'string',
        enum: [
          'finDepth',
          'finSpacing',
          'height',
          'length',
          'width',
          'canopyDepth',
          'material',
          'roof',
          'landscape',
          'hour',
        ],
      },
      value: {
        anyOf: [
          { type: 'number' },
          { type: 'string', enum: ['A', 'B', 'C', 'D'] },
        ],
      },
      massing: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
      facade: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
      landscape: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
      roof: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
      view: {
        type: 'string',
        enum: [
          'perspective',
          'entrance',
          'aerial',
          'north',
          'south',
          'east',
          'west',
          'detail',
        ],
      },
      hour: { type: 'number' },
      prompt: { type: 'string' },
    },
    required: ['type'],
    additionalProperties: false,
  },
};
const ranges: Record<string, [number, number, Feature | undefined]> = {
  finDepth: [0.2, 2.5, 'facade'],
  finSpacing: [1, 6, 'facade'],
  height: [8, 26, 'massing'],
  length: [30, 120, 'massing'],
  width: [20, 65, 'massing'],
  canopyDepth: [2, 9, 'canopy'],
  hour: [6, 21, undefined],
};
export function executeAction(s: BuildingSpec, a: DesignAction): ActionResult {
  const n = clone(s);
  if (!a || typeof a !== 'object')
    return {
      message: 'That action was not valid. Try a supported design edit.',
    };
  if (a.type === 'undo' || a.type === 'redo')
    return {
      history: a.type,
      message:
        a.type === 'undo'
          ? 'Previous design restored.'
          : 'Design change reapplied.',
    };
  if (a.type === 'generate')
    return {
      generation:
        a.prompt ||
        'Refine the selected element while preserving all locked features.',
      message:
        'This needs a generated image. Review and start the job in Generate.',
    };
  if (a.type === 'lock' || a.type === 'unlock') {
    if (!a.feature || !Object.keys(featureLabels).includes(a.feature))
      return {
        message:
          'Which feature should I lock: massing, facade, roofline, landscape, or canopy?',
      };
    n.locks =
      a.type === 'lock'
        ? [...new Set([...n.locks, a.feature])]
        : n.locks.filter((f) => f !== a.feature);
    return {
      spec: n,
      message: `${featureLabels[a.feature]} ${a.type === 'lock' ? 'locked' : 'unlocked'}.`,
    };
  }
  if (a.type === 'view') {
    if (
      a.view &&
      ![
        'perspective',
        'entrance',
        'aerial',
        'north',
        'south',
        'east',
        'west',
        'detail',
      ].includes(a.view)
    )
      return { message: 'That view is unavailable.' };
    if (a.view) n.view = a.view;
    if (a.hour !== undefined) {
      if (!Number.isFinite(a.hour) || a.hour < 6 || a.hour > 21)
        return { message: 'Choose a daylight time between 06:00 and 21:00.' };
      n.hour = a.hour;
    }
    return {
      spec: n,
      message: `Showing ${n.view}${n.hour >= 18 ? ' at dusk' : ''}.`,
    };
  }
  if (a.type === 'mix') {
    let next = n;
    const requested = (
      ['massing', 'facade', 'roof', 'landscape'] as const
    ).filter((f) => a[f]);
    if (!requested.length)
      return {
        message:
          'Choose a concept for massing, facade, roofline, or landscape.',
      };
    if (requested.some((f) => !['A', 'B', 'C', 'D'].includes(a[f]!)))
      return { message: 'Use concept A, B, C, or D.' };
    const blocked = requested.filter((f) => s.locks.includes(f));
    if (blocked.length)
      return {
        message: `${blocked.map((f) => featureLabels[f]).join(', ')} is locked. Unlock it before mixing.`,
      };
    if (a.massing) {
      const m = applyConcept({ ...n, locks: [] }, a.massing);
      next = {
        ...n,
        concept: a.massing,
        length: m.length,
        width: m.width,
        height: m.height,
      };
    }
    if (a.facade) next.material = a.facade;
    if (a.roof) next.roof = a.roof;
    if (a.landscape) next.landscape = a.landscape;
    return {
      spec: next,
      message:
        'Concepts combined. The building specification and drawings are updated.',
    };
  }
  if (a.type === 'set' && a.parameter) {
    const p = a.parameter;
    if (['material', 'roof', 'landscape'].includes(p)) {
      const f = p === 'material' ? 'facade' : (p as Feature);
      if (s.locks.includes(f))
        return {
          message: `${featureLabels[f]} is locked. Unlock it to make this change.`,
        };
      if (!['A', 'B', 'C', 'D'].includes(String(a.value)))
        return { message: 'Choose material palette A, B, C, or D.' };
      Object.assign(n, { [p]: a.value });
      return {
        spec: n,
        message: `${featureLabels[f]} updated to concept ${a.value}.`,
      };
    }
    const r = ranges[p];
    if (!r || typeof a.value !== 'number' || !Number.isFinite(a.value))
      return {
        message:
          'That parameter is unsupported. Open Generate to explore an image or a supported model proposal.',
      };
    if (r[2] && s.locks.includes(r[2]))
      return {
        message: `${featureLabels[r[2]]} is locked. Unlock it to make this change.`,
      };
    if (a.value < r[0] || a.value > r[1])
      return {
        message: `Use a value between ${r[0]} and ${r[1]}${p === 'hour' ? ' hours' : ' m'}.`,
      };
    Object.assign(n, { [p]: Math.round(a.value * 100) / 100 });
    return {
      spec: n,
      message: `${p === 'finDepth' ? 'Facade fin depth' : p === 'canopyDepth' ? 'Canopy depth' : p === 'hour' ? 'Daylight' : p} updated to ${a.value}${p === 'hour' ? ':00' : ' m'}.`,
    };
  }
  return {
    message:
      'I need a clearer instruction. Try “deepen the fins to 1.2 metres” or select an element.',
  };
}
export function parseCommand(
  text: string,
  s: BuildingSpec,
  selected?: Feature,
): DesignAction | null {
  const t = text.toLowerCase().replace(/[’']/g, '');
  if (/\bundo\b/.test(t)) return { type: 'undo' };
  if (/\bredo\b/.test(t)) return { type: 'redo' };
  const feature = (
    /roof/.test(t)
      ? 'roof'
      : /fin|facade|screen/.test(t)
        ? 'facade'
        : /mass|height|building/.test(t)
          ? 'massing'
          : /landscape|garden|plant/.test(t)
            ? 'landscape'
            : /canopy/.test(t)
              ? 'canopy'
              : selected
  ) as Feature | undefined;
  if (/\b(unlock|lock|keep)\b/.test(t) && !/\bbut\b/.test(t))
    return { type: t.includes('unlock') ? 'unlock' : 'lock', feature };
  const mix: DesignAction = { type: 'mix' };
  for (const f of ['massing', 'facade', 'roof', 'landscape'] as const) {
    const match =
      t.match(new RegExp(`\\b([abcd])s?\\s+${f}`)) ||
      t.match(new RegExp(`${f}\\s+(?:from\\s+)?([abcd])\\b`));
    if (match) mix[f] = match[1].toUpperCase() as ConceptId;
  }
  if (Object.keys(mix).length > 1) return mix;
  const daylight = t.match(
    /\b(?:daylight|hour|time)\s+(?:to\s+|at\s+)?(\d+(?:\.\d+)?)(?::00)?\b/,
  );
  if (daylight)
    return { type: 'set', parameter: 'hour', value: Number(daylight[1]) };
  if (/show|view|sunset|dusk|aerial|daylight/.test(t)) {
    const view: View = /entrance/.test(t)
      ? 'entrance'
      : /detail/.test(t)
        ? 'detail'
        : /aerial|roof/.test(t)
          ? 'aerial'
          : /north/.test(t)
            ? 'north'
            : /south/.test(t)
              ? 'south'
              : /east/.test(t)
                ? 'east'
                : /west/.test(t)
                  ? 'west'
                  : 'perspective';
    return {
      type: 'view',
      view,
      hour: /sunset|dusk/.test(t) ? 19 : /daylight|noon/.test(t) ? 12 : s.hour,
    };
  }
  const number = t.match(/(\d+(?:\.\d+)?)\s*(?:m\b|met|feet|ft|$)/);
  const val = number
    ? Number(number[1]) * (/feet|ft/.test(t) ? 0.3048 : 1)
    : undefined;
  if (
    /deepen|deeper|shallow|fin/.test(t) &&
    (feature === 'facade' || /fin/.test(t))
  )
    return {
      type: 'set',
      parameter: 'finDepth',
      value:
        val ??
        Math.round(
          (s.finDepth + (/shallow|less/.test(t) ? -0.25 : 0.25)) * 100,
        ) / 100,
    };
  if (/taller|shorter|height/.test(t))
    return {
      type: 'set',
      parameter: 'height',
      value: val ?? s.height + (t.includes('shorter') ? -2 : 2),
    };
  if (/canopy/.test(t) && /deeper|extend|depth/.test(t))
    return {
      type: 'set',
      parameter: 'canopyDepth',
      value: val ?? s.canopyDepth + 1,
    };
  if (/arch|curve|generate|new concept|regenerate|render/.test(t))
    return { type: 'generate', prompt: text };
  return null;
}
