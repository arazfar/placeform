import { getMassing, getRoofProfiles } from './architecture';
import { concepts, type BuildingSpec } from './spec';
import { siteArea } from './site';
export const sheets = [
  { id: 'S01', name: 'Site plan', kind: 'site' },
  { id: 'A01', name: 'Footprint & roof plan', kind: 'roof' },
  { id: 'A02', name: 'South elevation', kind: 'south' },
  { id: 'A03', name: 'North elevation', kind: 'north' },
  { id: 'A04', name: 'East elevation', kind: 'east' },
  { id: 'A05', name: 'West elevation', kind: 'west' },
  { id: 'A06', name: 'Key section A–A', kind: 'section' },
] as const;
export type SheetId = (typeof sheets)[number]['id'];
const esc = (v: unknown) =>
  String(v).replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export function drawingSVG(s: BuildingSpec, id: SheetId) {
  const sheet = sheets.find((x) => x.id === id)!,
    v = getMassing(s),
    isPlan = ['site', 'roof'].includes(sheet.kind),
    scale = isPlan || s.length > 90 ? 500 : 250,
    k = 4000 / scale,
    cx = isPlan ? 720 : 840,
    cy = isPlan ? 565 : 630,
    ink = '#354336',
    light = '#879180',
    rust = '#af6047';
  const text = (
    x: number,
    y: number,
    t: unknown,
    size = 20,
    anchor = 'start',
    color = ink,
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${color}">${esc(t)}</text>`;
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w = 1,
    color = ink,
    dash = '',
  ) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill = 'none',
    stroke = ink,
    sw = 1,
  ) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  const dim = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    label: string,
    vertical = false,
  ) => {
    const off = vertical ? -35 : 32;
    return (
      line(x1, y1, x2, y2, 1, light) +
      line(x1 - 6, y1 + 6, x1 + 6, y1 - 6, 1, ink) +
      line(x2 - 6, y2 + 6, x2 + 6, y2 - 6, 1, ink) +
      (vertical
        ? `<text transform="translate(${x1 + off},${(y1 + y2) / 2}) rotate(-90)" fill="${ink}" font-size="20" text-anchor="middle">${esc(label)}</text>`
        : text((x1 + x2) / 2, y1 + off, label, 20, 'middle'))
    );
  };
  let body = '';
  const mx = (x: number) => cx + x * k,
    my = (z: number) => cy + z * k;
  if (isPlan) {
    if (sheet.kind === 'site') {
      const lat = s.site.center[1],
        a = ((s.site.rotation - 90) * Math.PI) / 180;
      const points = s.site.polygon.geometry.coordinates[0]
        .map((p) => {
          const east =
              (p[0] - s.site.center[0]) *
              111320 *
              Math.cos((lat * Math.PI) / 180),
            north = (p[1] - s.site.center[1]) * 111320;
          const x = east * Math.cos(a) - north * Math.sin(a),
            z = -east * Math.sin(a) - north * Math.cos(a);
          return `${mx(x)},${my(z)}`;
        })
        .join(' ');
      body += `<polygon points="${points}" fill="#f2f2e9" stroke="${rust}" stroke-width="2" stroke-dasharray="10 5"/>`;
      body += rect(
        mx(-s.length / 2 - 7),
        my(-s.width / 2 - 15),
        k * (s.length + 14),
        k * 13,
        '#e4e6de',
        light,
      );
      body += text(
        cx,
        my(-s.width / 2 - 10),
        'SECURE SERVICE COURT · swept paths to verify',
        16,
        'middle',
      );
      for (let i = 0; i < 4; i++)
        body += rect(
          mx(-s.length * 0.33 + i * 7.4 - 2.4),
          my(-s.width / 2 - 9.45),
          k * 4.8,
          k * 2.5,
          'url(#hatch)',
          ink,
        );
      for (let x = -s.length / 2 + 3; x < s.length / 2; x += 8) {
        if (Math.abs(x - 12) < 8) continue;
        body += rect(
          mx(x - 3.35),
          my(s.width / 2 + 6.575),
          6.7 * k,
          2.05 * k,
          'url(#plant)',
          light,
        );
        body += `<circle cx="${mx(x)}" cy="${my(s.width / 2 + 7.6)}" r="${2 * k}" fill="#e5eadb" stroke="${light}"/><circle cx="${mx(x)}" cy="${my(s.width / 2 + 7.6)}" r="${0.2 * k}" fill="${ink}"/>`;
      }
      body +=
        line(
          mx(-s.length / 2 - 15),
          my(s.width / 2 + 10.5),
          mx(s.length / 2 + 15),
          my(s.width / 2 + 10.5),
          2,
          light,
        ) +
        line(
          mx(-s.length / 2 - 15),
          my(s.width / 2 + 23.5),
          mx(s.length / 2 + 15),
          my(s.width / 2 + 23.5),
          2,
          light,
        );
      body += text(
        cx,
        my(s.width / 2 + 19),
        'PUBLIC STREET · indicative alignment',
        18,
        'middle',
      );
    }
    for (const b of v) {
      body += rect(
        mx(b.x - b.w / 2),
        my(b.z - b.d / 2),
        b.w * k,
        b.d * k,
        '#fbfcf7',
        ink,
        2.5,
      );
      if (sheet.kind === 'roof') {
        if (s.roof === 'A' || s.roof === 'B') {
          body += rect(
            mx(b.x - b.w * 0.32),
            my(b.z - b.d * 0.12 - Math.min(13, b.d * 0.38) / 2),
            b.w * 0.64 * k,
            Math.min(13, b.d * 0.38) * k,
            'url(#hatch)',
            ink,
            1.3,
          );
          body += text(
            mx(b.x),
            my(b.z - b.d * 0.12) + 6,
            'SCREENED PLANT',
            16,
            'middle',
          );
        }
        if (s.roof === 'A')
          for (const zz of [-b.d * 0.37, b.d * 0.37])
            body += rect(
              mx(b.x - b.w * 0.415),
              my(b.z + zz - 0.825),
              b.w * 0.83 * k,
              1.65 * k,
              'url(#plant)',
              light,
            );
        if (s.roof === 'C') {
          body += line(
            mx(b.x),
            my(b.z - b.d / 2),
            mx(b.x),
            my(b.z + b.d / 2),
            1.5,
            ink,
          );
          body += text(mx(b.x + b.w / 4), my(b.z), 'FALL >', 14, 'middle');
          body += text(mx(b.x - b.w / 4), my(b.z), '< FALL', 14, 'middle');
        }
        if (s.roof === 'D') {
          const n = Math.max(2, Math.round(b.w / 8));
          for (let i = 0; i < n; i++) {
            const x = b.x - b.w / 2 + (i * b.w) / n;
            body += line(
              mx(x),
              my(b.z - b.d / 2 + 1.5),
              mx(x),
              my(b.z + b.d / 2 - 1.5),
              1.5,
            );
            body += line(
              mx(x + (b.w / n) * 0.86),
              my(b.z - b.d / 2 + 1.5),
              mx(x + (b.w / n) * 0.86),
              my(b.z + b.d / 2 - 1.5),
              3,
              light,
            );
          }
        }
      }
    }
    if (sheet.kind === 'site')
      body +=
        text(cx, cy, 'DATA CENTER ENVELOPE', 21, 'middle') +
        text(
          cx,
          cy + 30,
          'Operational planning and public frontage schematic',
          15,
          'middle',
        );
    const ex = s.concept === 'D' ? 0 : Math.min(12, s.length * 0.2),
      ez = s.concept === 'D' ? s.width * 0.02 : s.width / 2,
      cw = s.concept === 'D' ? 14 : 11;
    body += rect(
      mx(ex - (cw + 0.6) / 2),
      my(ez),
      (cw + 0.6) * k,
      s.canopyDepth * k,
      '#c6a58c',
      ink,
    );
    body += text(
      mx(ex),
      my(ez + s.canopyDepth + 3),
      'MAIN ENTRANCE',
      14,
      'middle',
    );
    body += dim(
      mx(-s.length / 2),
      my(-s.width / 2 - 4),
      mx(s.length / 2),
      my(-s.width / 2 - 4),
      `${s.length.toFixed(2)} m`,
    );
    body += dim(
      mx(-s.length / 2 - 6),
      my(-s.width / 2),
      mx(-s.length / 2 - 6),
      my(s.width / 2),
      `${s.width.toFixed(2)} m`,
      true,
    );
    if (sheet.kind === 'roof') {
      body += line(
        mx(0),
        my(-s.width / 2 - 8),
        mx(0),
        my(s.width / 2 + 12),
        1,
        rust,
        '14 5 2 5',
      );
      body +=
        text(mx(0) + 16, my(-s.width / 2 - 8), 'A', 24) +
        text(mx(0) + 16, my(s.width / 2 + 12), 'A', 24);
    }
    body += `<g transform="translate(1410 230) rotate(${90 - s.site.rotation})"><path d="M0 65 L0 0 L-11 24 M0 0 L11 24" fill="none" stroke="${ink}" stroke-width="2"/>${text(0, -18, 'N', 23, 'middle')}</g>`;
    body +=
      text(1270, 370, 'SITE NOTES', 17) +
      text(
        1270,
        415,
        `${(siteArea(s.site) / 10000).toFixed(2)} ha study area`,
        19,
      ) +
      text(1270, 450, `${s.site.rotation.toFixed(1)}° long-axis bearing`, 19) +
      text(
        1270,
        485,
        `${Math.round(v.reduce((n, b) => n + b.w * b.d, 0)).toLocaleString()} m² massing footprint`,
        19,
      ) +
      text(1270, 535, 'Boundary is illustrative.', 17) +
      text(1270, 565, 'Ownership and survey unverified.', 17) +
      text(1270, 595, 'No development approval implied.', 17);
  } else if (sheet.kind === 'section') {
    const b = v.reduce((a, b) => (Math.abs(a.x) < Math.abs(b.x) ? a : b)),
      W = b.d,
      H = b.h,
      base = 750,
      x = cx - (W * k) / 2;
    body += rect(x, base - H * k, W * k, H * k, 'none', ink, 2.5);
    body +=
      rect(x, base - H * k, 4, H * k, 'url(#hatch)', ink) +
      rect(x + W * k - 4, base - H * k, 4, H * k, 'url(#hatch)', ink);
    body += rect(x, base, W * k, 6, 'url(#hatch)', ink);
    body += rect(x, base - 4.3 * k, W * k, 4, 'url(#hatch)', ink);
    body += rect(x, base - H * k, W * k, 5, 'url(#hatch)', ink);
    if (s.roof === 'A' || s.roof === 'B') {
      const ph = s.roof === 'B' ? 2.8 : 2.2;
      body += rect(
        cx - k * 6.5,
        base - (H + ph) * k,
        13 * k,
        ph * k,
        'url(#hatch)',
        ink,
      );
      body += text(
        cx,
        base - (H + ph) * k - 25,
        'SCREENED PLANT · acoustic design pending',
        18,
        'middle',
      );
    }
    if (s.roof === 'C' || s.roof === 'D') {
      const profile = getRoofProfiles(s).find((v) => v.x === b.x)!;
      body +=
        rect(
          x,
          base - profile.roofTop * k,
          W * k,
          (profile.roofTop - H) * k,
          'none',
          light,
          1,
        ) +
        text(
          cx,
          base - profile.top * k - 24,
          s.roof === 'C'
            ? 'RIDGE LINE · longitudinal section'
            : 'SAWTOOTH ROOF PROFILE BEYOND',
          17,
          'middle',
        );
    }
    for (let z = -W / 2 + 5; z < W / 2 - 4; z += 4) {
      body += rect(
        cx + z * k,
        base - 6.9 * k,
        2 * k,
        2.4 * k,
        '#e2e6de',
        light,
      );
      body += line(
        cx + z * k,
        base - 4.5 * k,
        cx + (z + 2) * k,
        base - 4.5 * k,
        3,
        ink,
      );
    }
    body += rect(
      cx - W * k * 0.35,
      base - 10.5 * k,
      W * k * 0.7,
      0.6 * k,
      '#e8ebe4',
      light,
    );
    body += text(
      cx,
      base - 13 * k,
      'IT / EQUIPMENT ZONE · layout schematic',
      18,
      'middle',
    );
    body += text(cx, base - 2 * k, 'OPERATIONS / SUPPORT ZONE', 18, 'middle');
    body += line(x - 80, base + 6, x + W * k + 80, base + 6, 2, ink);
    body +=
      dim(
        x - 55,
        base - H * k,
        x - 55,
        base,
        `${H.toFixed(2)} m parapet`,
        true,
      ) + dim(x, base + 70, x + W * k, base + 70, `${W.toFixed(2)} m`);
    body +=
      text(
        150,
        240,
        `Maximum roof / plant envelope: ${Math.max(...getRoofProfiles(s).map((p) => p.top)).toFixed(2)} m above schematic ground`,
        19,
      ) +
      text(
        150,
        280,
        'Critical equipment elevation requires flood and engineering review.',
        21,
      ) +
      text(
        150,
        318,
        'Floor datum and equipment racks are illustrative. No structural or MEP design.',
        18,
      );
  } else {
    const front = sheet.kind === 'south' || sheet.kind === 'north',
      reverse = sheet.kind === 'north' || sheet.kind === 'east',
      span = front ? s.length : s.width,
      base = 760;
    const ordered = [...v].sort((a, b) =>
      front
        ? sheet.kind === 'south'
          ? a.z - b.z
          : b.z - a.z
        : sheet.kind === 'east'
          ? a.x - b.x
          : b.x - a.x,
    );
    for (const b of ordered) {
      const w = front ? b.w : b.d,
        pos = (front ? b.x : b.z) * (reverse ? -1 : 1),
        x = cx + (pos - w / 2) * k,
        h = b.h;
      body += rect(x, base - h * k, w * k, h * k, '#f6f5ee', ink, 2);
      body += rect(x, base - 4.3 * k, w * k, 4 * k, '#e1e7e3', ink);
      const bays = Math.max(3, Math.round(w / Math.max(1.8, s.finSpacing))),
        step = w / bays;
      for (let i = 0; i < bays; i++) {
        const xx = x + i * step * k;
        body += rect(
          xx + step * k * 0.16,
          base - h * 0.85 * k,
          step * k * 0.68,
          h * 0.22 * k,
          'url(#screen)',
          ink,
          0.8,
        );
        if (s.material !== 'B')
          body += rect(
            xx + step * k * 0.07,
            base - h * 0.585 * k,
            step * k * 0.86,
            h * 0.31 * k,
            'url(#brick)',
            light,
            0.5,
          );
        body += rect(
          xx,
          base - h * k,
          (s.material === 'C' ? 0.19 : s.material === 'B' ? 0.17 : 0.36) * k,
          h * k,
          s.material === 'D'
            ? '#686d67'
            : s.material === 'C'
              ? '#b19a78'
              : s.material === 'B'
                ? '#b8bfba'
                : '#bb876d',
          ink,
          0.8,
        );
        body += line(
          xx + step * k * 0.5,
          base - 4 * k,
          xx + step * k * 0.5,
          base,
          1,
          ink,
        );
      }
      if (s.material === 'B')
        for (let y = 4.8; y < h - 0.6; y += 0.28)
          body += line(x, base - y * k, x + w * k, base - y * k, 0.5, light);
      body += rect(x, base - h * k, w * k, 0.3 * k, '#8b9288', ink);
      if (s.roof === 'A' || s.roof === 'B') {
        const ph = s.roof === 'B' ? 2.8 : 2.2,
          pw = front ? b.w * 0.64 : Math.min(13, b.d * 0.38);
        body += rect(
          cx + pos * k - (pw * k) / 2,
          base - (h + ph) * k,
          pw * k,
          ph * k,
          'url(#screen)',
          ink,
          1,
        );
      }
      if (s.roof === 'C' && front) {
        const rise = Math.min(3.2, b.w * 0.14);
        body += `<path d="M${x} ${base - (h - 0.1) * k} L${x + (w * k) / 2} ${base - (h - 0.1 + rise) * k} L${x + w * k} ${base - (h - 0.1) * k}" fill="#b3b9af" stroke="${ink}" stroke-width="2"/>`;
      }
      if (s.roof === 'C' && !front)
        body += rect(
          x,
          base - (h - 0.1 + Math.min(3.2, b.w * 0.14)) * k,
          w * k,
          Math.min(3.2, b.w * 0.14) * k,
          '#b3b9af',
          ink,
        );
      if (s.roof === 'D' && front) {
        const n = Math.max(2, Math.round(w / 8));
        for (let i = 0; i < n; i++) {
          const xx = x + (i * w * k) / n;
          body += `<path d="M${xx} ${base - h * k} L${xx + ((w * k) / n) * 0.86} ${base - (h + 2.2) * k} L${xx + ((w * k) / n) * 0.86} ${base - h * k}" fill="#ebede7" stroke="${ink}"/>`;
        }
      }
      if (s.roof === 'D' && !front)
        body += rect(x, base - (h + 2.2) * k, w * k, 2.2 * k, '#ebede7', ink);
    }
    if (sheet.kind === 'south') {
      const ex = s.concept === 'D' ? 0 : Math.min(12, s.length * 0.2),
        cw = s.concept === 'D' ? 14 : 11;
      body +=
        rect(
          cx + (ex - cw / 2) * k,
          base - 5.01 * k,
          cw * k,
          0.72 * k,
          '#b59172',
          ink,
          1.3,
        ) +
        rect(
          cx + (ex - 2.15) * k,
          base - 4.1 * k,
          4.3 * k,
          4.1 * k,
          '#b5c4b8',
          ink,
        );
    }
    if (sheet.kind === 'north')
      for (const x of [-s.length * 0.39, s.length * 0.36])
        body += rect(
          cx + (-x - 2) * k,
          base - 4.4 * k,
          4 * k,
          4.3 * k,
          'url(#screen)',
          ink,
        );
    body +=
      line(
        cx - (span * k) / 2 - 60,
        base,
        cx + (span * k) / 2 + 60,
        base,
        2.5,
        ink,
      ) +
      dim(
        cx - (span * k) / 2,
        base + 60,
        cx + (span * k) / 2,
        base + 60,
        `${span.toFixed(2)} m`,
      ) +
      dim(
        cx - (span * k) / 2 - 55,
        base - s.height * k,
        cx - (span * k) / 2 - 55,
        base,
        `${s.height.toFixed(2)} m nominal envelope`,
        true,
      );
    body += text(
      cx,
      930,
      `Facade pitch approx. ${s.finSpacing.toFixed(2)} m · fin depth ${s.finDepth.toFixed(2)} m · canopy projection ${s.canopyDepth.toFixed(2)} m`,
      19,
      'middle',
    );
  }
  const c = (s.directions || concepts).find((x) => x.id === s.material)!,
    land = (s.directions || concepts).find((x) => x.id === s.landscape)!;
  const legendMaterials = [...c.materials.slice(0, 3), land.materials[3]],
    legendColors = [...c.colors.slice(0, 3), land.colors[3]];
  let legend = text(70, 990, 'MATERIAL LEGEND', 15);
  legendMaterials.forEach((m, i) => {
    legend +=
      rect(70 + i * 330, 1010, 23, 23, legendColors[i], legendColors[i]) +
      text(105 + i * 330, 1028, `${String(i + 1).padStart(2, '0')}  ${m}`, 18);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 1680 1188" role="img" aria-label="${esc(sheet.name)}"><defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="#a5ad9e" stroke-width=".8"/></pattern><pattern id="brick" width="15" height="8" patternUnits="userSpaceOnUse"><path d="M0 0H15M0 4H15M0 0V4M7.5 4V8" stroke="#b8a491" stroke-width=".7"/></pattern><pattern id="screen" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#e2e6df"/><path d="M1 0V5" stroke="#738071" stroke-width=".8"/></pattern><pattern id="plant" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#e5eadb"/><circle cx="3" cy="3" r="1" fill="#9ca58f"/></pattern></defs><rect width="1680" height="1188" fill="#fffffc"/><g font-family="Arial,Helvetica,sans-serif">${rect(35, 35, 1610, 1118, 'none', '#b6bdaf')}${text(70, 92, 'placeform', 30)}${text(1610, 88, 'SCHEMATIC DESIGN', 18, 'end', rust)}${line(70, 117, 1610, 117, 1, light)}${text(70, 170, sheet.name, 34)}${text(1610, 165, `${s.name} · revision ${String(s.revision).padStart(2, '0')}`, 19, 'end')}${body}${legend}${line(70, 1060, 1610, 1060, 1.2, ink)}${text(70, 1098, s.site.name.length > 60 ? s.site.name.slice(0, 57) + '…' : s.site.name, 19)}${text(70, 1130, 'Not for construction · dimensions in metres · print at 100% on A3', 16)}${text(1240, 1098, `1:${scale} @ A3`, 21, 'end')}${text(1240, 1143, `Local elevations · long axis ${s.site.rotation.toFixed(1)}°`, 15, 'end')}${text(1610, 1122, id, 48, 'end')}${rect(950, 1079, 10 * k, 7, ink, ink)}${text(950, 1120, '0', 12)}${text(950 + 10 * k, 1120, '10 m', 12, 'end')}</g></svg>`;
}
