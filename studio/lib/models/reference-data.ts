import { ellipse, smoothContour, type P2, type Height } from './geometry';
export const MODEL_STAGE:
  | 'blockout'
  | 'structure'
  | 'form'
  | 'materials'
  | 'lighting'
  | 'complete' = 'complete';
export const terraces = [
  { x: 0, z: 28, w: 104, d: 17, y: 0, h: 5.8 },
  { x: -3, z: 8, w: 96, d: 18, y: 2.3, h: 5.8 },
  { x: 4, z: -12, w: 94, d: 18, y: 4.6, h: 5.7 },
  { x: -6, z: -32, w: 86, d: 17, y: 6.9, h: 5.6 },
];
export const ribbons = [
  {
    min: -54,
    max: 54,
    z: 27,
    d: 16,
    knots: [2.1, 6.1, 11.8, 8.9, 4.5, 1.0],
    shift: 0.1,
    lift: 1.8,
    skew: -5,
  },
  {
    min: -50,
    max: 52,
    z: 5,
    d: 15,
    knots: [3, 7.8, 14, 8, 5.2, 2.4],
    shift: -0.08,
    lift: -0.8,
    skew: 6,
  },
  {
    min: -48,
    max: 54,
    z: -16.5,
    d: 15,
    knots: [4, 5.7, 9.1, 14.4, 10.1, 4.3],
    shift: 0.13,
    lift: 0.7,
    skew: -5,
  },
  {
    min: -44,
    max: 53,
    z: -34,
    d: 12,
    knots: [7.2, 8.7, 10, 10.5, 8, 11.8],
    shift: -0.07,
    lift: 1.2,
    skew: 2,
  },
];
function cubic(values: number[], u: number) {
  const f = Math.max(0, Math.min(0.999999, u)) * (values.length - 1),
    i = Math.floor(f),
    t = f - i;
  const a = values[Math.max(0, i - 1)],
    b = values[i],
    c = values[Math.min(values.length - 1, i + 1)],
    d = values[Math.min(values.length - 1, i + 2)];
  return (
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t * t +
      (-a + 3 * b - 3 * c + d) * t * t * t)
  );
}
export function ribbonSurface(r: (typeof ribbons)[number]) {
  const width = r.max - r.min;
  const front = (u: number) =>
    r.z + r.d / 2 + r.skew * (u - 0.5) + 2 * Math.sin(u * Math.PI);
  const rear = (u: number) =>
    r.z - r.d / 2 + r.skew * (u - 0.5) + 0.8 * Math.sin(u * Math.PI);
  const height: Height = (x, z) => {
    const u = (x - r.min) / width,
      v = THREEClamp((front(u) - z) / (front(u) - rear(u)), 0, 1);
    return THREEClamp(
      cubic(r.knots, u) * (1 - v) + (cubic(r.knots, u + r.shift) + r.lift) * v,
      0.9,
      15.35,
    );
  };
  const frontLine: P2[] = Array.from({ length: 97 }, (_, i) => {
    const u = i / 96;
    return [r.min + u * width, front(u)];
  });
  const rearLine: P2[] = Array.from({ length: 97 }, (_, i) => {
    const u = i / 96;
    return [r.min + u * width, rear(u)];
  });
  return {
    height,
    front,
    rear,
    outline: [...frontLine, ...rearLine.slice().reverse()],
    frontLine,
    rearLine,
  };
}
function THREEClamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
export const duneOutline = smoothContour(
  [
    [-54, 31],
    [-53, 13],
    [-48, 1],
    [-53, -13],
    [-45, -30],
    [-28, -38],
    [-3, -40],
    [24, -38],
    [49, -34],
    [54, -20],
    [50, -5],
    [54, 11],
    [50, 26],
    [54, 38],
    [33, 36],
    [17, 39],
    [-5, 35],
    [-26, 37],
    [-44, 34],
  ],
  180,
).map(([x, z]) => [THREEClamp(x, -55, 55), THREEClamp(z, -41, 41)] as P2);
export const duneCourts = [
  {
    id: 'entrance-oculus',
    center: [-26, 29] as P2,
    rx: 3.1,
    rz: 2,
    angle: 0.1,
  },
  { id: 'front-garden', center: [28, 24] as P2, rx: 13, rz: 4.3, angle: -0.18 },
  { id: 'central-slit', center: [-1, 14] as P2, rx: 17, rz: 3.1, angle: 0.07 },
  { id: 'west-court', center: [-29, -1] as P2, rx: 14, rz: 5.7, angle: -0.1 },
  { id: 'east-court', center: [21, -8] as P2, rx: 21, rz: 5.6, angle: 0.13 },
  {
    id: 'rear-west-court',
    center: [-15, -27] as P2,
    rx: 18,
    rz: 6,
    angle: 0.07,
  },
  {
    id: 'rear-east-court',
    center: [30, -29] as P2,
    rx: 12,
    rz: 5.1,
    angle: -0.13,
  },
].map((c) => ({
  ...c,
  outline: ellipse(...c.center, c.rx, c.rz, c.angle, 64),
}));
const gaussian = (
  x: number,
  z: number,
  cx: number,
  cz: number,
  sx: number,
  sz: number,
) => Math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2));
export const duneHeight: Height = (x, z) => {
  const front =
    2.15 +
    9.0 * gaussian(x, z, -27, 31, 23, 17) +
    6.8 * gaussian(x, z, 26, 31, 19, 16);
  const middle =
    6.7 +
    6.3 * gaussian(x, z, -16, 0, 22, 18) +
    4.5 * gaussian(x, z, 34, -3, 21, 20) +
    4.2 * gaussian(x, z, -10, -32, 25, 16) +
    3.7 * gaussian(x, z, 38, -31, 18, 14);
  const t = THREEClamp((25 - z) / 19, 0, 1),
    blend = t * t * (3 - 2 * t);
  const raw =
    front * (1 - blend) +
    middle * blend -
    5.2 * gaussian(x, z, 53, 12, 7, 12) -
    4.5 * gaussian(x, z, -52, -9, 7, 14) -
    2.2 * gaussian(x, z, 54, 37, 6, 10) -
    1.6 * gaussian(x, z, -54, 31, 5, 10);
  return 1.15 + Math.log1p(Math.exp((raw - 1.15) * 3)) / 3;
};
export const halls = [
  { id: 'west-front', x: -31, z: 23, w: 41, d: 22, y: 0, h: 8.2 },
  { id: 'west-middle', x: -33, z: -3, w: 39, d: 21, y: 1.8, h: 8.4 },
  { id: 'west-rear', x: -30, z: -29, w: 43, d: 18, y: 3.6, h: 8.6 },
  { id: 'east-front', x: 32, z: 14, w: 40, d: 23, y: 0, h: 8.2 },
  { id: 'east-middle', x: 31, z: -12, w: 42, d: 20, y: 1.8, h: 8.4 },
  { id: 'east-rear', x: 33, z: -32.7, w: 38, d: 16.6, y: 3.6, h: 8.6 },
];
export const pavilions = [
  { x: 4, z: 32.5, w: 18, d: 15, y: 0, h: 7.5 },
  { x: 0, z: 13, w: 15, d: 24, y: 0, h: 6.3 },
  { x: -3, z: -9.25, w: 16, d: 20.5, y: 1.8, h: 6.4 },
  { x: 1, z: -29, w: 15, d: 19, y: 3.6, h: 6 },
];
