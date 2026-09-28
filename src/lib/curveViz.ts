// Fixed decorative bonding-curve shape (viewBox "0 0 200 28"), reused across
// coin cards and the trade detail page. This is NOT a literal plot of the
// on-chain constant-product formula — it's a consistent visual shape (matching
// the logo mark's curve) with a dot placed at the coin's real progress toward
// migration. The dot position is real data; the curve's exact shape is
// decorative.

type Point = [number, number];

const SEG1: { p0: Point; p1: Point; p2: Point; p3: Point } = {
  p0: [0, 26],
  p1: [60, 26],
  p2: [100, 18],
  p3: [140, 8],
};
const SEG2: { p0: Point; p1: Point; p2: Point; p3: Point } = {
  p0: [140, 8],
  p1: [160, 3],
  p2: [175, 1],
  p3: [200, 0],
};

function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number) {
  const mt = 1 - t;
  const x = mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0];
  const y = mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1];
  return { x, y };
}

export const CURVE_PATH_D = "M0,26 C60,26 100,18 140,8 C160,3 175,1 200,0";

/** progress: 0..1 real fraction of the way to migration */
export function curveDotPosition(progress: number): { x: number; y: number } {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0.5) return cubicBezier(SEG1.p0, SEG1.p1, SEG1.p2, SEG1.p3, p / 0.5);
  return cubicBezier(SEG2.p0, SEG2.p1, SEG2.p2, SEG2.p3, (p - 0.5) / 0.5);
}
