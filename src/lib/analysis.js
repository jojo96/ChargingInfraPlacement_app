// Engineering checks: power chain & capacities, cable network & IEC sizing, transformer loading, distance constraints.
//
// Power chain:  Grid → Transformer → (Distribution) → Converter → DC charger → Dispenser
//   - the chargers on a converter may not add up to more than the converter's capacity
//   - the dispensers on a charger may not add up to more than the charger's power
//   - cables up to the converter are AC; from the converter onwards they are DC
import { spec, powerOf, CABLE_DEFAULTS } from './catalog.js'
import { dist, rectGap, centresOverlap, toLocal, fromLocal, cornersInBay, pathLen } from './geometry.js'
import { sizeCable, designCurrent } from './iec.js'

const isHeavyBay = (b) => b.kind === 'bay' && spec(b).heavy
export const isPowered = (it) => ['node', 'conv', 'charger', 'disp'].includes(it.kind)
export const isMcsType = (it) => it.type === 'mcs' || it.type === 'dmcs'

// Which kinds of item may feed which. Chargers fed straight from a transformer or cabinet are
// accepted for older projects, with a warning.
export const FEEDER_KINDS = { node: ['tx', 'node'], conv: ['tx', 'node'], charger: ['conv', 'tx', 'node'], disp: ['charger'] }

// Where a charger or dispenser sits relative to the truck in a bay (bay frame, metres)
export function placementIn(c, bay, R) {
  const s = spec(bay), { u, v } = toLocal(bay, c.lat, c.lng)
  const pts = cornersInBay(c, bay)
  const truckL = -R.truckW / 2, truckR = R.truckW / 2
  const side = u < 0 ? 'left' : 'right'
  // clear gap between the footprint and the truck body (negative = intrudes into the truck envelope)
  const gap = side === 'left' ? truckL - Math.max(...pts.map((p) => p.u)) : Math.min(...pts.map((p) => p.u)) - truckR
  const fromFront = s.h / 2 - v
  return { bay, side, gap, fromFront, u, v }
}

// The heavy bay an outlet most plausibly serves: the one whose truck envelope is closest
function servedBay(c, heavyBays, R) {
  let best = null, bd = Infinity
  for (const b of heavyBays) {
    const { u, v } = toLocal(b, c.lat, c.lng), h = spec(b).h / 2
    const du = Math.max(0, Math.abs(u) - R.truckW / 2), dv = Math.max(0, Math.abs(v) - h)
    const d = Math.hypot(du, dv)
    if (d < bd) { bd = d; best = b }
  }
  return bd <= 6 ? best : null
}

// Spec-compliant spot beside a bay: driver's left, mid-way in the 2–4.8 m window, close to the truck
export function snapPosition(c, bay, R) {
  const cs = spec(c), bs = spec(bay)
  const rot = ((bay.rot || 0) + 90) % 360 // long side runs along the bay
  const gap = Math.min(0.5, R.mcsMaxGap / 2)
  const u = -R.truckW / 2 - gap - cs.h / 2
  const v = bs.h / 2 - (R.mcsFrontMin + R.mcsFrontMax) / 2
  const [lat, lng] = fromLocal(bay, u, v)
  return { lat, lng, rot }
}

const nearest = (from, list) => list.reduce((b, x) => (dist(from, x) < dist(from, b) ? x : b), list[0])
const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0)

// Route from feeder to item: user waypoints if any, otherwise L-shaped or straight
export function routeOf(from, to, route, wp) {
  if (wp && wp.length) return [[from.lat, from.lng], ...wp, [to.lat, to.lng]]
  if (route === 'L') return [[from.lat, from.lng], [from.lat, to.lng], [to.lat, to.lng]]
  return [[from.lat, from.lng], [to.lat, to.lng]]
}

export function cableSettings(project, it) {
  return { ...CABLE_DEFAULTS, ...(project.cable || {}), ...(it.cable || {}) }
}

export function analyse(project) {
  const R = project.rules, items = project.items
  const by = (k) => items.filter((i) => i.kind === k)
  const bays = by('bay'), ch = by('charger'), conv = by('conv'), disp = by('disp'), nodes = by('node'), tx = by('tx'), grid = by('grid')
  const powered = [...nodes, ...conv, ...ch, ...disp]
  const byId = Object.fromEntries(items.map((i) => [i.id, i]))
  const issues = [], cables = [], mv = [], lines = []
  const bad = new Set()
  const fail = (msg, ids = []) => { issues.push({ sev: 'bad', msg, ids }); ids.forEach((i) => bad.add(i)) }
  const warn = (msg, ids = []) => issues.push({ sev: 'warn', msg, ids })

  // 1. Network: who feeds whom
  const feederOf = (it) => {
    const f = it.feed ?? it.tx // `tx` = older projects
    if (f && f !== 'auto' && f !== it.id && byId[f] && FEEDER_KINDS[it.kind].includes(byId[f].kind)) return byId[f]
    if (it.kind === 'disp') return ch.length ? nearest(it, ch) : null
    if (it.kind === 'charger' && conv.length) return nearest(it, conv)
    return tx.length ? nearest(it, tx) : null
  }
  const feeder = {}
  for (const it of powered) feeder[it.id] = feederOf(it)
  const fedBy = (f, list) => list.filter((c) => feeder[c.id] === f)
  const rootTx = (it) => {
    let cur = it
    for (let i = 0; i < 12 && cur; i++) { if (cur.kind === 'tx') return cur; cur = feeder[cur.id] }
    return null
  }
  // power a distribution node has to pass on
  const demand = (it, seen = new Set()) => {
    if (it.kind !== 'node') return powerOf(it)
    if (seen.has(it.id)) return 0
    seen.add(it.id)
    return sum(fedBy(it, [...nodes, ...conv, ...ch]), (c) => demand(c, seen))
  }

  // 2. Capacity of each level
  const caps = []
  for (const c of conv) {
    const kids = fedBy(c, ch), used = sum(kids, powerOf), cap = powerOf(c)
    caps.push({ it: c, used, cap, n: kids.length, pct: cap ? (100 * used) / cap : 0, what: 'charger' })
    if (used > cap + 1e-6) fail(`${c.label} feeds ${used.toLocaleString()} kW of chargers but is rated ${cap.toLocaleString()} kW`, [c.id])
    if (!kids.length) warn(`${c.label} feeds no DC chargers`, [c.id])
    if (!rootTx(c)) warn(`${c.label} is not connected to a transformer`, [c.id])
  }
  for (const c of ch) {
    const kids = fedBy(c, disp), used = sum(kids, powerOf), cap = powerOf(c)
    caps.push({ it: c, used, cap, n: kids.length, pct: cap ? (100 * used) / cap : 0, what: 'dispenser' })
    if (used > cap + 1e-6) fail(`${c.label} feeds ${used.toLocaleString()} kW of dispensers but is rated ${cap.toLocaleString()} kW`, [c.id])
  }
  const noConv = ch.filter((c) => feeder[c.id]?.kind !== 'conv')
  if (noConv.length) warn(`${noConv.map((c) => c.label).join(', ')} ${noConv.length > 1 ? 'are' : 'is'} not fed from a converter`, noConv.map((c) => c.id))
  for (const d of disp) if (!feeder[d.id]) warn(`${d.label} is not connected to a DC charger`, [d.id])
  for (const it of nodes) {
    if (!rootTx(it)) warn(`${it.label} is not connected to a transformer (loop or no transformer)`, [it.id])
    if (demand(it) === 0) warn(`${it.label} feeds nothing`, [it.id])
  }

  // 3. Cables: AC up to the converter, DC after it. Sized to IEC 60364-5-52.
  for (const it of powered) {
    const f = feeder[it.id]
    if (!f || !rootTx(it)) continue
    const route = it.route || project.defaults.route
    const mode = it.mode || project.defaults.mode
    const pts = routeOf(f, it, route, it.wp)
    const dc = f.kind === 'conv' || f.kind === 'charger'
    const kw = it.kind === 'node' ? demand(it) * R.simult : powerOf(it)
    cables.push({ id: it.id, to: it, from: f, ch: it, tx: f, pts, len: pathLen(pts), kw, mode, route, dc })
  }
  const elec = (c) => {
    let s = cableSettings(project, c.to)
    if (c.dc) s = { ...s, config: 'DC', material: 'cu', insulation: 'xlpe' } // DC tables are loaded for copper / XLPE
    return { s, V: c.dc ? R.dcVoltage || 800 : R.voltage, pf: c.dc ? 1 : R.pf }
  }
  // grouping: circuits leaving the same feeder in the same way share a trench / tray
  const groupBase = (c) => cables.filter((o) => o.from === c.from && o.mode === c.mode).length
  for (const c of cables) {
    const { s, V, pf } = elec(c)
    const method = s.method || (c.mode === 'ug' ? s.methodUg : s.methodOh)
    const Ib = s.Ib ?? designCurrent(c.kw, s.config, V, pf)
    let groupN = s.groupN ?? groupBase(c)
    if (s.rule === '30' && s.groupN == null) {
      // IEC 60364-5-52 §B.52.18 note: circuits loaded below 30 % of their capacity may be left out of the group
      const sib = cables.filter((o) => o !== c && o.from === c.from && o.mode === c.mode)
      const light = sib.filter((o) => {
        const e = elec(o)
        const Io = designCurrent(o.kw, e.s.config, e.V, e.pf)
        const solo = sizeCable({ ...e.s, method, Ib: Io, len: o.len, groupN: 1, vdMax: R.maxVd, voltage: e.V, pf: e.pf })
        return solo.chosen && Io < 0.3 * solo.chosen.Iz
      }).length
      groupN = Math.max(1, groupN - light)
    }
    const res = sizeCable({ ...s, method, Ib, len: c.len, groupN, vdMax: R.maxVd, voltage: V, pf })
    const best = res.chosen
    Object.assign(c, {
      method, Ib, groupN, settings: s, size: res, voltage: V, pf,
      runs: best?.n ?? 1, mm2: best?.mm2 ?? 0, Iz: best?.Iz ?? 0, vd: best?.vd ?? 0, material: s.material, cores: res.cores,
      price: best?.price ?? 0, name: best?.name ?? 'No valid cable',
    })
    if (c.len > R.maxLv) fail(`${c.to.label} cable is ${c.len.toFixed(0)} m (max ${R.maxLv} m)`, [c.to.id])
    if (res.error) fail(`${c.to.label}: ${res.error}`, [c.to.id])
    else if (!best) fail(`${c.to.label}: no standard cable meets ${Ib.toFixed(0)} A within ΔU ${R.maxVd}%`, [c.to.id])
    for (const w of res.warnings) warn(`${c.to.label}: ${w}`, [c.to.id])
  }

  // 4. MV link: each transformer to nearest grid connection (with optional waypoints on the transformer)
  if (grid.length) for (const t of tx) {
    const g = nearest(t, grid)
    const pts = routeOf(g, t, 'straight', t.wp)
    mv.push({ id: t.id, tx: t, g, pts, len: pathLen(pts) })
  }
  if (tx.length && !grid.length) warn('No grid connection point placed')
  if ((conv.length || ch.length) && !tx.length) warn('Converters or chargers placed but no transformer yet')

  // 5. Transformer clearance
  for (const t of tx) {
    for (const o of [...bays, ...conv, ...ch, ...disp, ...nodes, ...tx.filter((x) => x !== t && x.id > t.id)]) {
      const g = rectGap(t, o)
      if (g < R.txClear) {
        fail(`${t.label} is ${g.toFixed(1)} m from ${o.label} (min ${R.txClear} m)`, [t.id, o.id])
        lines.push({ a: t, b: o, g })
      }
    }
  }

  // 6. Outlets = what the vehicle plugs into: every dispenser, plus chargers that have no dispenser of their own
  const withDisp = new Set(disp.map((d) => feeder[d.id]?.id))
  const outlets = [...disp, ...ch.filter((c) => !withDisp.has(c.id))]
  for (const c of outlets) {
    if (!bays.length) { warn(`${c.label} has no parking bay to serve`, [c.id]); continue }
    let best = Infinity, bb = null
    for (const b of bays) { const g = rectGap(c, b); if (g < best) { best = g; bb = b } }
    if (best > R.chargerReach) {
      fail(`${c.label} is ${best.toFixed(1)} m from nearest bay (reach ${R.chargerReach} m)`, [c.id])
      lines.push({ a: c, b: bb, g: best })
    } else if (best === 0 && !isHeavyBay(bb) && centresOverlap(c, bb)) warn(`${c.label} stands inside ${bb.label}`, [c.id])
    for (const d of outlets) if (d.id > c.id) {
      const g = rectGap(c, d)
      if (g < R.chargerGap) warn(`${c.label} and ${d.label} are ${g.toFixed(1)} m apart (min ${R.chargerGap} m)`, [c.id, d.id])
    }
  }

  // 7. CharIN / FLEXMCS charging-spot rules for heavy-vehicle bays
  const heavy = bays.filter(isHeavyBay)
  const placements = {}
  const servedBays = new Set()
  for (const c of outlets) {
    const b = servedBay(c, heavy, R)
    if (!b) continue
    const p = placementIn(c, b, R)
    placements[c.id] = p
    servedBays.add(b)
    if (p.gap < 0) fail(`${c.label} intrudes ${(-p.gap).toFixed(2)} m into the truck envelope in ${b.label}`, [c.id])
    if (!isMcsType(c)) continue // side, gap and front rules are mandatory for MCS only (CCS may be either side)
    if (p.side !== 'left') fail(`${c.label} is on the right of ${b.label}. MCS inlets are on the truck's left`, [c.id])
    if (p.gap > R.mcsMaxGap) fail(`${c.label} is ${p.gap.toFixed(2)} m from the truck (max ${R.mcsMaxGap} m)`, [c.id])
    if (p.fromFront < R.mcsFrontMin || p.fromFront > R.mcsFrontMax)
      fail(`${c.label} is ${p.fromFront.toFixed(1)} m from the front of ${b.label} (needs ${R.mcsFrontMin}–${R.mcsFrontMax} m)`, [c.id])
  }
  for (const b of servedBays) {
    const s = spec(b)
    if (s.w < R.bayMinW || s.h < R.bayMinL)
      warn(`${b.label} is ${s.w} × ${s.h} m; truck charging bays need at least ${R.bayMinW} × ${R.bayMinL} m`, [b.id])
  }

  // 8. Bay overlaps
  for (let i = 0; i < bays.length; i++) for (let j = i + 1; j < bays.length; j++) {
    if (rectGap(bays[i], bays[j]) === 0 && centresOverlap(bays[i], bays[j])) warn(`${bays[i].label} overlaps ${bays[j].label}`, [bays[i].id, bays[j].id])
  }

  // 9. Transformer loading: connected charger power, capped by each converter's capacity, times simultaneity
  const loads = tx.map((t) => {
    const under = (it) => rootTx(it) === t
    const viaConv = sum(conv.filter(under), (c) => Math.min(powerOf(c), sum(fedBy(c, ch), powerOf)))
    const direct = sum(ch.filter((c) => under(c) && feeder[c.id]?.kind !== 'conv'), powerOf)
    const kw = viaConv + direct
    const kva = (kw * R.simult) / R.pf
    const cap = spec(t).kva
    const pct = cap ? (100 * kva) / cap : 0
    if (pct > 100) fail(`${t.label} loaded ${pct.toFixed(0)}% (${kva.toFixed(0)} of ${cap} kVA)`, [t.id])
    return { t, kw, kva, cap, pct }
  })

  return { bays, ch, conv, disp, outlets, nodes, tx, grid, cables, mv, issues, bad, lines, loads, caps, placements, heavy, feeder }
}
