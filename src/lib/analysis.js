// Engineering checks: cable network & IEC sizing, transformer loading, distance constraints.
import { spec, CABLE_DEFAULTS } from './catalog.js'
import { dist, rectGap, centresOverlap, toLocal, fromLocal, cornersInBay, pathLen } from './geometry.js'
import { sizeCable, designCurrent } from './iec.js'

const isHeavyBay = (b) => b.kind === 'bay' && spec(b).heavy
export const isPowered = (it) => it.kind === 'charger' || it.kind === 'node'

// Where a charger sits relative to the truck in a bay (bay frame, metres)
export function placementIn(c, bay, R) {
  const s = spec(bay), { u, v } = toLocal(bay, c.lat, c.lng)
  const pts = cornersInBay(c, bay)
  const truckL = -R.truckW / 2, truckR = R.truckW / 2
  const side = u < 0 ? 'left' : 'right'
  // clear gap between charger footprint and the truck body (negative = intrudes into the truck envelope)
  const gap = side === 'left' ? truckL - Math.max(...pts.map((p) => p.u)) : Math.min(...pts.map((p) => p.u)) - truckR
  const fromFront = s.h / 2 - v
  return { bay, side, gap, fromFront, u, v }
}

// The heavy bay a charger most plausibly serves: the one whose truck envelope is closest
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

// Spec-compliant spot for a charger beside a bay: driver's left, mid-way in the 2–4.8 m window, 0.5 m from the truck
export function snapPosition(c, bay, R) {
  const cs = spec(c), bs = spec(bay)
  const rot = ((bay.rot || 0) + 90) % 360 // long side of the cabinet runs along the bay
  const gap = Math.min(0.5, R.mcsMaxGap / 2)
  const u = -R.truckW / 2 - gap - cs.h / 2
  const v = bs.h / 2 - (R.mcsFrontMin + R.mcsFrontMax) / 2
  const [lat, lng] = fromLocal(bay, u, v)
  return { lat, lng, rot }
}

const nearest = (from, list) => list.reduce((b, x) => (dist(from, x) < dist(from, b) ? x : b), list[0])

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
  const bays = by('bay'), ch = by('charger'), nodes = by('node'), tx = by('tx'), grid = by('grid')
  const byId = Object.fromEntries(items.map((i) => [i.id, i]))
  const issues = [], cables = [], mv = [], lines = []
  const bad = new Set()
  const fail = (msg, ids = []) => { issues.push({ sev: 'bad', msg, ids }); ids.forEach((i) => bad.add(i)) }
  const warn = (msg, ids = []) => issues.push({ sev: 'warn', msg, ids })

  // 1. Network: who feeds whom (charger/node → node or transformer)
  const feederOf = (it) => {
    const f = it.feed ?? it.tx // `tx` = older projects
    if (f && f !== 'auto' && f !== it.id && byId[f] && (byId[f].kind === 'tx' || byId[f].kind === 'node')) return byId[f]
    return tx.length ? nearest(it, tx) : null
  }
  const feeder = {}
  for (const it of [...ch, ...nodes]) feeder[it.id] = feederOf(it)
  const rootTx = (it) => {
    let cur = it
    for (let i = 0; i < 12 && cur; i++) { if (cur.kind === 'tx') return cur; cur = feeder[cur.id] }
    return null
  }
  const downKw = {}
  const kwOf = (it, seen = new Set()) => {
    if (it.kind === 'charger') return spec(it).kw
    if (seen.has(it.id)) return 0
    seen.add(it.id)
    if (downKw[it.id] != null) return downKw[it.id]
    const kw = [...ch, ...nodes].filter((c) => feeder[c.id] === it).reduce((s, c) => s + kwOf(c, seen), 0)
    return (downKw[it.id] = kw)
  }
  for (const it of nodes) {
    if (!rootTx(it)) { warn(`${it.label} is not connected to a transformer (loop or no transformer)`, [it.id]) }
    if (kwOf(it) === 0) warn(`${it.label} feeds no chargers`, [it.id])
  }

  // 2. LV cables with IEC 60364-5-52 sizing
  for (const it of [...nodes, ...ch]) {
    const f = feeder[it.id]
    if (!f || !rootTx(it)) continue
    const route = it.route || project.defaults.route
    const mode = it.mode || project.defaults.mode
    const pts = routeOf(f, it, route, it.wp)
    const len = pathLen(pts)
    const kw = it.kind === 'node' ? kwOf(it) * R.simult : spec(it).kw
    cables.push({ id: it.id, to: it, from: f, ch: it, tx: f, pts, len, kw, mode, route })
  }
  // grouping: circuits leaving the same feeder in the same way share a trench / tray
  const groupBase = (c) => cables.filter((o) => o.from === c.from && o.mode === c.mode).length
  for (const c of cables) {
    const s = cableSettings(project, c.to)
    const method = s.method || (c.mode === 'ug' ? s.methodUg : s.methodOh)
    const Ib = s.Ib ?? designCurrent(c.kw, s.config, R.voltage, R.pf)
    let groupN = s.groupN ?? groupBase(c)
    if (s.rule === '30' && s.groupN == null) {
      // IEC 60364-5-52 §B.52.18 note: circuits loaded below 30 % of their capacity may be left out of the group
      const sib = cables.filter((o) => o !== c && o.from === c.from && o.mode === c.mode)
      const light = sib.filter((o) => {
        const so = cableSettings(project, o.to)
        const Io = designCurrent(o.kw, so.config, R.voltage, R.pf)
        const solo = sizeCable({ ...so, method, Ib: Io, len: o.len, groupN: 1, vdMax: R.maxVd, voltage: R.voltage, pf: R.pf })
        return solo.chosen && Io < 0.3 * solo.chosen.Iz
      }).length
      groupN = Math.max(1, groupN - light)
    }
    const res = sizeCable({ ...s, method, Ib, len: c.len, groupN, vdMax: R.maxVd, voltage: R.voltage, pf: R.pf })
    const ch = res.chosen
    Object.assign(c, {
      method, Ib, groupN, settings: s, size: res,
      runs: ch?.n ?? 1, mm2: ch?.mm2 ?? 0, Iz: ch?.Iz ?? 0, vd: ch?.vd ?? 0, material: s.material, cores: res.cores,
      price: ch?.price ?? 0, name: ch?.name ?? 'No valid cable',
    })
    if (c.len > R.maxLv) fail(`${c.to.label} cable is ${c.len.toFixed(0)} m (max ${R.maxLv} m)`, [c.to.id])
    if (res.error) fail(`${c.to.label}: ${res.error}`, [c.to.id])
    else if (!ch) fail(`${c.to.label}: no standard cable meets ${Ib.toFixed(0)} A within ΔU ${R.maxVd}%`, [c.to.id])
    for (const w of res.warnings) warn(`${c.to.label}: ${w}`, [c.to.id])
  }

  // 3. MV link: each transformer to nearest grid connection (with optional waypoints on the transformer)
  if (grid.length) for (const t of tx) {
    const g = nearest(t, grid)
    const pts = routeOf(g, t, 'straight', t.wp)
    mv.push({ id: t.id, tx: t, g, pts, len: pathLen(pts) })
  }

  // 4. Sequence
  if (ch.length && !tx.length) warn('Chargers placed but no transformer yet')
  if (tx.length && !grid.length) warn('No grid connection point placed')

  // 5. Transformer clearance
  for (const t of tx) {
    for (const o of [...bays, ...ch, ...nodes, ...tx.filter((x) => x !== t && x.id > t.id)]) {
      const g = rectGap(t, o)
      if (g < R.txClear) {
        fail(`${t.label} is ${g.toFixed(1)} m from ${o.label} (min ${R.txClear} m)`, [t.id, o.id])
        lines.push({ a: t, b: o, g })
      }
    }
  }

  // 6. Charger reach & spacing
  for (const c of ch) {
    if (!bays.length) { warn(`${c.label} has no parking bay to serve`, [c.id]); continue }
    let best = Infinity, bb = null
    for (const b of bays) { const g = rectGap(c, b); if (g < best) { best = g; bb = b } }
    if (best > R.chargerReach) {
      fail(`${c.label} is ${best.toFixed(1)} m from nearest bay (reach ${R.chargerReach} m)`, [c.id])
      lines.push({ a: c, b: bb, g: best })
    } else if (best === 0 && !isHeavyBay(bb) && centresOverlap(c, bb)) warn(`${c.label} stands inside ${bb.label}`, [c.id])
    for (const d of ch) if (d.id > c.id) {
      const g = rectGap(c, d)
      if (g < R.chargerGap) warn(`${c.label} and ${d.label} are ${g.toFixed(1)} m apart (min ${R.chargerGap} m)`, [c.id, d.id])
    }
  }

  // 7. CharIN / FLEXMCS charging-spot rules for heavy-vehicle bays
  const heavy = bays.filter(isHeavyBay)
  const placements = {}
  const servedBays = new Set()
  for (const c of ch) {
    const b = servedBay(c, heavy, R)
    if (!b) continue
    const p = placementIn(c, b, R)
    placements[c.id] = p
    servedBays.add(b)
    if (p.gap < 0) fail(`${c.label} intrudes ${(-p.gap).toFixed(2)} m into the truck envelope in ${b.label}`, [c.id])
    if (c.type !== 'mcs') continue // side, gap and front rules are mandatory for MCS only (CCS may be either side)
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

  // 9. Transformer loading (all chargers downstream, through any distribution nodes)
  const loads = tx.map((t) => {
    const kw = ch.filter((c) => rootTx(c) === t).reduce((s, c) => s + spec(c).kw, 0)
    const kva = (kw * R.simult) / R.pf
    const cap = spec(t).kva
    const pct = cap ? (100 * kva) / cap : 0
    if (pct > 100) fail(`${t.label} loaded ${pct.toFixed(0)}% (${kva.toFixed(0)} of ${cap} kVA)`, [t.id])
    return { t, kw, kva, cap, pct }
  })

  return { bays, ch, nodes, tx, grid, cables, mv, issues, bad, lines, loads, placements, heavy, feeder }
}