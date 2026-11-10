// Bill of materials, project helpers, persistence, example layout.
import { CATALOG, KIND_LABEL, spec, defaultProject } from './catalog.js'
import { offset } from './geometry.js'
import { snapPosition } from './analysis.js'

// Merge a saved/imported project over the defaults, so projects saved before new settings existed still work
export function withDefaults(p) {
  const d = defaultProject()
  return {
    ...d, ...p,
    rules: { ...d.rules, ...(p.rules || {}) }, prices: { ...d.prices, ...(p.prices || {}) },
    defaults: { ...d.defaults, ...(p.defaults || {}) }, cable: { ...d.cable, ...(p.cable || {}) },
    buildings: p.buildings || [],
  }
}

export const eur = (n) => '€' + Math.round(n).toLocaleString('en-GB')
export const uid = () => Math.random().toString(36).slice(2, 9)

export function bom(project, A) {
  const P = project.prices, rows = []
  for (const kind of ['bay', 'disp', 'charger', 'conv', 'node', 'tx', 'grid']) {
    const counts = {}
    for (const it of project.items.filter((i) => i.kind === kind)) counts[it.type] = (counts[it.type] || 0) + 1
    for (const [type, qty] of Object.entries(counts)) {
      const s = CATALOG[kind][type]
      rows.push({ cat: KIND_LABEL[kind], item: s.name, qty, unit: 'pcs', price: s.cost, total: qty * s.cost })
    }
  }
  const ugLen = A.cables.filter((c) => c.mode === 'ug').reduce((s, c) => s + c.len, 0)
  const ohLen = A.cables.filter((c) => c.mode === 'oh').reduce((s, c) => s + c.len, 0)
  if (ugLen) rows.push({ cat: 'Civil', item: 'Trenching (underground)', qty: Math.round(ugLen), unit: 'm', price: P.trench, total: Math.round(ugLen) * P.trench })
  if (ohLen) rows.push({ cat: 'Civil', item: 'Overground tray / poles', qty: Math.round(ohLen), unit: 'm', price: P.overhead, total: Math.round(ohLen) * P.overhead })
  const byCable = {}
  for (const c of A.cables) {
    if (!c.mm2) continue
    const k = `${c.cores}×${c.mm2} mm² ${c.material === 'cu' ? 'Cu' : 'Al'} ${c.settings.insulation.toUpperCase()}${c.dc ? ' (DC)' : ''}`
    const runLen = (c.len + (c.settings.extra || 0)) * c.runs
    byCable[k] = byCable[k] || { len: 0, unit: c.size.chosen.unit }
    byCable[k].len += runLen
  }
  for (const [k, v] of Object.entries(byCable)) {
    rows.push({ cat: k.endsWith('(DC)') ? 'DC cable' : 'LV cable', item: k, qty: Math.round(v.len), unit: 'm', price: Math.round(v.unit * 100) / 100, total: Math.round(v.len * v.unit) })
  }
  const mvLen = A.mv.reduce((s, m) => s + m.len, 0)
  if (mvLen) rows.push({ cat: 'MV cable', item: 'MV cable grid → transformer', qty: Math.round(mvLen), unit: 'm', price: P.mvCable, total: Math.round(mvLen) * P.mvCable })
  return { rows, total: rows.reduce((s, r) => s + r.total, 0), ugLen, ohLen, mvLen }
}

export function cableSchedule(A) {
  return A.cables.map((c) => ({
    from: c.from.label, to: c.to.label, sys: c.dc ? 'DC' : 'AC', volt: c.voltage, len: c.len, kw: c.kw, Ib: c.Ib,
    method: c.method, groupN: c.groupN, cable: c.name, Iz: c.Iz, vd: c.vd, mode: c.mode === 'ug' ? 'Underground' : 'Overground',
    ok: !!c.size.chosen && !c.size.error,
  }))
}

export function nextLabel(items, kind, type) {
  const pre = kind === 'bay' ? ({ truck: 'T', bus: 'B', van: 'V' }[type] || 'P') : { conv: 'CV', charger: 'DC', disp: 'DP', node: type === 'cab' ? 'DB' : 'JB', tx: 'TR', grid: 'G' }[kind]
  const used = new Set(items.map((i) => i.label))
  let n = 1
  while (used.has(pre + n)) n++
  return pre + n
}

/* ---------- Bay angles ----------
 * Bays are placed at a parking angle to the aisle (FLEXMCS D2.1 Fig. 4): 30°, 45°, 60° or 90°.
 * base  = aisle direction in degrees (free, to match the real road)
 * angle = parking angle between bay and aisle
 * rot   = resulting driving direction of the bay = base + (90 − angle)
 */
export const BAY_ANGLES = [30, 45, 60, 90]
export const bayAngle = (it) => it.angle ?? 90
export const bayBase = (it) => it.base ?? (((it.rot || 0) - (90 - bayAngle(it))) % 360 + 360) % 360
export const withAngle = (it, angle = bayAngle(it), base = bayBase(it)) => {
  const b = ((base % 360) + 360) % 360
  return { angle, base: b, rot: (b + 90 - angle + 360) % 360 }
}

const FED_KINDS = ['node', 'conv', 'charger', 'disp']

export function makeItem(items, kind, type, lat, lng, extra = {}) {
  const it = { id: uid(), kind, type, lat, lng, rot: extra.rot ?? 0, label: extra.label || nextLabel(items, kind, type) }
  if (kind === 'bay') Object.assign(it, withAngle(it, extra.angle ?? 90, extra.base ?? it.rot))
  if (FED_KINDS.includes(kind)) Object.assign(it, { feed: extra.feed || 'auto', mode: null, route: null, wp: [] })
  return it
}

export function duplicateOf(items, it) {
  const s = spec(it)
  if (it.kind === 'bay') {
    // next bay along the aisle, keeping the same parking angle
    const angle = bayAngle(it), base = bayBase(it), a = (base * Math.PI) / 180
    const step = s.w / Math.sin((angle * Math.PI) / 180)
    const [lat, lng] = offset(it.lat, it.lng, step * Math.cos(a), -step * Math.sin(a))
    return makeItem(items, 'bay', it.type, lat, lng, { angle, base })
  }
  const a = ((it.rot || 0) * Math.PI) / 180, step = s.w + 1
  const [lat, lng] = offset(it.lat, it.lng, step * Math.cos(a), -step * Math.sin(a))
  const n = makeItem(items, it.kind, it.type, lat, lng, { rot: it.rot })
  if (FED_KINDS.includes(it.kind)) Object.assign(n, { kw: it.kw, mode: it.mode, route: it.route, feed: it.feed, cable: it.cable ? { ...it.cable, choice: undefined } : undefined })
  return n
}

// Bays in a row. angle = angle between the bays and the row line (90 = perpendicular, 45 = fishbone).
// rot = aisle direction; each bay's driving direction is rot + (90 − angle).
export function rowItems(items, type, n, c, rot, angle = 90) {
  const s = CATALOG.bay[type], a = (rot * Math.PI) / 180
  const pitch = s.w / Math.sin((angle * Math.PI) / 180)
  const out = [...items]
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * pitch
    const [lat, lng] = offset(c.lat, c.lng, off * Math.cos(a), -off * Math.sin(a))
    out.push(makeItem(out, 'bay', type, lat, lng, { angle, base: rot }))
  }
  return out
}

// Example depot built in the order of the power chain:
// grid → transformer → (distribution) → converter → DC charger → dispenser
export function exampleItems(c, rules = defaultProject().rules) {
  const items = []
  const at = (dx, dy) => offset(c.lat, c.lng, dx, dy)
  const add = (kind, type, [lat, lng], extra = {}) => { const it = makeItem(items, kind, type, lat, lng, extra); items.push(it); return it }
  // 4 truck charging bays (4.7 × 19 m), drive-through northwards, 6.5 m pitch; 6 car bays
  const trucks = [0, 1, 2, 3].map((i) => add('bay', 'truck', at(-10 + i * 6.5, 6)))
  for (let i = 0; i < 6; i++) add('bay', 'car', at(16 + i * 2.5, 2))

  add('grid', 'mv', at(-2, -32))
  const tr1 = add('tx', 't2500', at(-2, -14))
  const tr2 = add('tx', 't630', at(22, -17))

  // trucks: three 1 MW converters → four chargers (1 MW, 400 kW, 400 kW, 1 MW) → one dispenser each at the CharIN spot
  const cv = [-8, 0, 8].map((x) => add('conv', 'c1000', at(x, -8.5), { feed: tr1.id }))
  ;[['mcs', 'dmcs', 0], ['dc400', 'd400', 1], ['dc400', 'd400', 1], ['mcs', 'dmcs', 2]].forEach(([ct, dt, k], i) => {
    const charger = add('charger', ct, at(-10 + i * 6.5, -5), { feed: cv[k].id })
    const d = add('disp', dt, [trucks[i].lat, trucks[i].lng], { feed: charger.id })
    Object.assign(d, snapPosition(d, trucks[i], rules))
  })

  // cars: cabinet → 500 kW converter → one 150 kW charger → three 50 kW dispensers
  const db = add('node', 'cab', at(22, -11.5), { feed: tr2.id })
  const cv4 = add('conv', 'c500', at(22, -8.5), { feed: db.id })
  const dc5 = add('charger', 'dc150', at(22.25, -5), { feed: cv4.id })
  ;[17.25, 22.25, 27.25].forEach((x) => add('disp', 'd50', at(x, -1.4), { feed: dc5.id }))
  return items
}

const KEY = 'chargesite.v1'
export function loadProject() {
  try { const t = localStorage.getItem(KEY); if (t) return withDefaults(JSON.parse(t)) } catch (e) { /* storage unavailable */ }
  return null
}
export function saveProject(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch (e) { /* storage unavailable */ }
}

export function downloadText(name, text, type) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

export const toCsv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')

export const slug = (s) => (s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Fetch OSM building footprints around a point (Overpass API). Returns [{ pts: [[lat,lng]...], h }]
export async function fetchBuildings(lat, lng, radius = 180) {
  const dLat = radius / 111320, dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180))
  const bbox = `${lat - dLat},${lng - dLng},${lat + dLat},${lng + dLng}`
  const q = `[out:json][timeout:25];way["building"](${bbox});out geom;`
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  if (!r.ok) throw new Error('Overpass ' + r.status)
  const js = await r.json()
  return (js.elements || []).filter((e) => e.geometry?.length > 2).map((e) => {
    const t = e.tags || {}
    const h = parseFloat(t.height) || (parseFloat(t['building:levels']) ? parseFloat(t['building:levels']) * 3.2 : 8)
    return { pts: e.geometry.map((g) => [g.lat, g.lon]), h: Math.min(Math.max(h, 3), 120) }
  })
}
