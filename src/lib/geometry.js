// Local flat-earth geometry in metres. Accurate enough for site-scale layouts (< a few km).
import { spec } from './catalog.js'

export const MLAT = 111320
export const mLng = (lat) => MLAT * Math.cos((lat * Math.PI) / 180)

export function offset(lat, lng, dx, dy) {
  return [lat + dy / MLAT, lng + dx / mLng(lat)]
}

export function dist(a, b) {
  const dy = (b.lat - a.lat) * MLAT
  const dx = (b.lng - a.lng) * mLng((a.lat + b.lat) / 2)
  return Math.hypot(dx, dy)
}

// Footprint corners in metres relative to `ref`; rot = heading in degrees, clockwise
export function cornersXY(it, ref) {
  const s = spec(it)
  const a = ((it.rot || 0) * Math.PI) / 180
  const c = Math.cos(a), sn = Math.sin(a)
  const cx = (it.lng - ref.lng) * mLng(ref.lat)
  const cy = (it.lat - ref.lat) * MLAT
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const x = (u * s.w) / 2, y = (v * s.h) / 2
    return [cx + x * c + y * sn, cy - x * sn + y * c]
  })
}

export function cornersLL(it) {
  return cornersXY(it, it).map(([x, y]) => [it.lat + y / MLAT, it.lng + x / mLng(it.lat)])
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L = dx * dx + dy * dy
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

export function inPoly(p, P) {
  let ins = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ins = !ins
  }
  return ins
}

function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)
}

// Clear distance in metres between two footprints (0 = touching or overlapping)
export function rectGap(A, B) {
  const P = cornersXY(A, A), Q = cornersXY(B, A)
  if (P.some((p) => inPoly(p, Q)) || Q.some((q) => inPoly(q, P))) return 0
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (segX(P[i], P[(i + 1) % 4], Q[j], Q[(j + 1) % 4])) return 0
  let m = Infinity
  for (const p of P) for (let j = 0; j < 4; j++) m = Math.min(m, segDist(p, Q[j], Q[(j + 1) % 4]))
  for (const q of Q) for (let i = 0; i < 4; i++) m = Math.min(m, segDist(q, P[i], P[(i + 1) % 4]))
  return m
}

// True when the centre of one footprint lies inside the other (real overlap, not a shared edge)
export function centresOverlap(A, B) {
  const P = cornersXY(A, A), Q = cornersXY(B, A)
  const bc = [(B.lng - A.lng) * mLng(A.lat), (B.lat - A.lat) * MLAT]
  return inPoly(bc, P) || inPoly([0, 0], Q)
}

/* ---------- Bay frame ----------
 * u = lateral metres (+ = driver's right, − = driver's left)
 * v = longitudinal metres (+ = towards the bay front / driving direction)
 * Bay heading `rot` is the driving direction, clockwise from north.
 */
export function toLocal(bay, lat, lng) {
  const a = ((bay.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const X = (lng - bay.lng) * mLng(bay.lat), Y = (lat - bay.lat) * MLAT
  return { u: X * c - Y * s, v: X * s + Y * c }
}

export function fromLocal(bay, u, v) {
  const a = ((bay.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const X = u * c + v * s, Y = -u * s + v * c
  return [bay.lat + Y / MLAT, bay.lng + X / mLng(bay.lat)]
}

// Footprint corners of `it` expressed in `bay`'s frame
export function cornersInBay(it, bay) {
  return cornersLL(it).map(([lat, lng]) => toLocal(bay, lat, lng))
}

// Length in metres of a path given as [[lat, lng], ...]
export function pathLen(pts) {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += dist({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] })
  return L
}

// Local metres (x east, y north) of a point relative to an origin
export function toXY(o, lat, lng) {
  return [(lng - o.lng) * mLng(o.lat), (lat - o.lat) * MLAT]
}
