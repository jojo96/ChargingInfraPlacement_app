// Cable sizing to IEC 60364-5-52 (2009), Annex B.
// Current-carrying capacities and correction factors are transcribed for planning use.
// Verify against your licensed copy of the standard (and any national deviation) before final design.

export const SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300]
const _ = null
const T = (rows) => Object.fromEntries(rows.map(([m, ...v]) => [m, v]))

// Ampacity in A at 30 °C air / 20 °C ground, 2.5 K·m/W soil, one circuit. Key: material-insulation-loadedConductors
export const AMPACITY = {
  // Table B.52.5 — XLPE/EPR, copper, 3 loaded conductors
  'cu-xlpe-3': T([
    ['A1', 17, 23, 31, 40, 54, 73, 95, 117, 141, 179, 216, 249, 285, 324, 380, 435],
    ['A2', 16.5, 22, 30, 38, 51, 68, 89, 109, 130, 164, 197, 227, 259, 295, 346, 396],
    ['B1', 20, 28, 37, 48, 66, 88, 117, 144, 175, 222, 269, 312, 355, 417, 490, 563],
    ['B2', 19.5, 26, 35, 44, 60, 80, 105, 128, 154, 194, 233, 268, 300, 340, 398, 455],
    ['C', 22, 30, 40, 52, 71, 96, 119, 147, 179, 229, 278, 322, 371, 424, 500, 576],
    ['D1', 21, 28, 36, 44, 58, 75, 96, 115, 135, 167, 197, 223, 251, 281, 324, 365],
    ['D2', 23, 30, 39, 49, 65, 84, 107, 129, 153, 188, 226, 257, 287, 324, 375, 419],
    ['E', 23, 32, 42, 54, 75, 100, 127, 158, 192, 246, 298, 346, 399, 456, 538, 621],
    ['F', _, _, _, _, _, _, 141, 176, 216, 279, 342, 400, 464, 533, 634, 736],
  ]),
  // Table B.52.5 — XLPE/EPR, aluminium, 3 loaded conductors
  'al-xlpe-3': T([
    ['A1', _, _, _, _, _, 56, 73, 89, 108, 136, 164, 188, 216, 245, 286, 328],
    ['A2', _, _, _, _, _, 53, 68, 84, 101, 128, 154, 177, 203, 230, 270, 309],
    ['B1', _, _, _, _, _, 68, 88, 109, 133, 167, 207, 240, 273, 316, 367, 427],
    ['B2', _, _, _, _, _, 62, 80, 99, 118, 149, 179, 206, 236, 268, 313, 358],
    ['C', _, _, _, _, _, 73, 89, 111, 135, 173, 210, 244, 282, 322, 380, 439],
    ['D1', _, _, _, _, _, 58, 74, 89, 105, 128, 150, 171, 192, 216, 246, 278],
    ['D2', _, _, _, _, _, 66, 83, 99, 117, 144, 172, 196, 218, 246, 285, 320],
    ['E', _, _, _, _, _, 77, 97, 120, 146, 187, 227, 263, 304, 347, 409, 471],
    ['F', _, _, _, _, _, _, 107, 135, 165, 215, 264, 308, 358, 413, 492, 571],
  ]),
  // Table B.52.4 — PVC, copper, 3 loaded conductors
  'cu-pvc-3': T([
    ['A1', 13.5, 18, 24, 31, 42, 56, 73, 89, 108, 136, 164, 188, 216, 245, 286, 328],
    ['A2', 13, 17.5, 23, 29, 39, 52, 68, 83, 99, 125, 150, 172, 196, 223, 261, 298],
    ['B1', 15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239, _, _, _, _],
    ['B2', 15, 20, 27, 34, 46, 62, 80, 99, 118, 149, 179, 206, _, _, _, _],
    ['C', 17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259, 299, 341, 403, 464],
    ['D1', 18, 24, 30, 38, 50, 64, 82, 98, 116, 143, 169, 192, 217, 243, 280, 316],
    ['D2', 19, 24, 33, 41, 54, 70, 92, 110, 130, 162, 193, 220, 246, 278, 320, 359],
    ['E', 18.5, 25, 34, 43, 60, 80, 101, 126, 153, 196, 238, 276, 319, 364, 430, 497],
    ['F', _, _, _, _, _, _, 110, 137, 167, 216, 264, 308, 356, 409, 485, 561],
  ]),
  // Table B.52.3 — XLPE/EPR, copper, 2 loaded conductors (single-phase AC and DC links)
  'cu-xlpe-2': T([
    ['A1', 19, 26, 35, 45, 61, 81, 106, 131, 158, 200, 241, 278, 318, 362, 424, 486],
    ['A2', 18.5, 25, 33, 42, 57, 76, 99, 121, 145, 183, 220, 253, 290, 329, 386, 442],
    ['B1', 23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, _, _, _, _],
    ['B2', 22, 30, 40, 51, 69, 91, 119, 146, 175, 221, 265, 305, _, _, _, _],
    ['C', 24, 33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382, 441, 506, 599, 693],
    ['D1', 25, 33, 43, 53, 71, 91, 116, 139, 164, 203, 239, 271, 306, 343, 395, 446],
    ['D2', 27, 35, 46, 58, 77, 100, 129, 155, 183, 225, 270, 306, 343, 387, 448, 502],
    ['E', 26, 36, 49, 63, 86, 115, 149, 185, 225, 289, 352, 410, 473, 542, 641, 741], // Table B.52.12
  ]),
}

export const METHODS = [
  { id: 'A1', group: 'In conduit / pipe', label: 'Single-core in conduit in insulated wall' },
  { id: 'A2', group: 'In conduit / pipe', label: 'Multi-core in conduit in insulated wall' },
  { id: 'B1', group: 'In conduit / pipe', label: 'Single-core in conduit on wall' },
  { id: 'B2', group: 'In conduit / pipe', label: 'Multi-core in conduit on wall', ev: 'EV: indoor wall' },
  { id: 'C', group: 'Clipped to surface', label: 'Clipped directly on wall' },
  { id: 'D1', group: 'Underground', label: 'Cables in buried duct', ev: 'EV: single cable in conduit', ground: true },
  { id: 'D2', group: 'Underground', label: 'Direct buried in ground', ev: 'EV standard', ground: true },
  { id: 'E', group: 'Free air / cable tray', label: 'Multi-core on perforated tray', ev: 'EV: indoor parking' },
  { id: 'F', group: 'Free air / cable tray', label: 'Single-core touching (trefoil)' },
]
export const METHOD_BY_ID = Object.fromEntries(METHODS.map((m) => [m.id, m]))

export const CONFIGS = {
  '1PN': { label: '1P+N', cores: 2, loaded: 2, note: 'Single-phase' },
  '3PN': { label: '3P+N', cores: 4, loaded: 3, note: 'Standard for AC EV feeders' },
  '3PNPE': { label: '3P+N+PE', cores: 5, loaded: 3, note: 'Separate protective earth' },
  DC: { label: 'DC +/−', cores: 2, loaded: 2, note: 'DC link between converter, charger and dispenser' },
}

// Correction factors
const K1_AIR = { // Table B.52.14, reference 30 °C
  pvc: { 10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71 },
  xlpe: { 10: 1.15, 15: 1.12, 20: 1.08, 25: 1.04, 30: 1, 35: 0.96, 40: 0.91, 45: 0.87, 50: 0.82 },
}
const K1_GROUND = { // Table B.52.15, reference 20 °C
  pvc: { 10: 1.10, 15: 1.05, 20: 1, 25: 0.95, 30: 0.89, 35: 0.84, 40: 0.77 },
  xlpe: { 10: 1.07, 15: 1.04, 20: 1, 25: 0.96, 30: 0.93, 35: 0.89, 40: 0.85 },
}
const K2_DUCT = { 0.5: 1.28, 0.7: 1.20, 1: 1.18, 1.5: 1.10, 2: 1.05, 2.5: 1, 3: 0.96 }   // Table B.52.16, D1
const K2_DIRECT = { 0.5: 1.88, 0.7: 1.62, 1: 1.50, 1.5: 1.28, 2: 1.12, 2.5: 1, 3: 0.90 } // Table B.52.16, D2

// Grouping factors k4 by number of circuits
const K4 = {
  bunched: { 1: 1, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.50, 12: 0.45, 16: 0.41, 20: 0.38 }, // B.52.17
  tray: { 1: 1, 2: 0.88, 3: 0.82, 4: 0.79, 6: 0.76, 9: 0.73 },                                                          // B.52.20 single layer
  D2: { // B.52.18 direct buried
    touching: { 1: 1, 2: 0.75, 3: 0.65, 4: 0.60, 5: 0.55, 6: 0.50, 7: 0.45, 8: 0.43, 9: 0.41, 12: 0.36, 16: 0.32, 20: 0.29 },
    diameter: { 1: 1, 2: 0.80, 3: 0.70, 4: 0.60, 5: 0.55, 6: 0.55, 7: 0.51, 8: 0.48, 9: 0.46, 12: 0.42, 16: 0.38, 20: 0.35 },
    '0.125': { 1: 1, 2: 0.85, 3: 0.75, 4: 0.70, 5: 0.65, 6: 0.60, 7: 0.59, 8: 0.57, 9: 0.55, 12: 0.52, 16: 0.49, 20: 0.47 },
    '0.25': { 1: 1, 2: 0.90, 3: 0.80, 4: 0.75, 5: 0.70, 6: 0.70, 7: 0.67, 8: 0.65, 9: 0.63, 12: 0.59, 16: 0.56, 20: 0.53 },
    '0.5': { 1: 1, 2: 0.90, 3: 0.85, 4: 0.80, 5: 0.80, 6: 0.80, 7: 0.76, 8: 0.75, 9: 0.74, 12: 0.71, 16: 0.68, 20: 0.66 },
  },
  D1: { // B.52.19 in buried ducts
    touching: { 1: 1, 2: 0.85, 3: 0.75, 4: 0.70, 5: 0.65, 6: 0.60, 7: 0.57, 8: 0.54, 9: 0.52, 12: 0.47, 16: 0.42, 20: 0.38 },
    '0.25': { 1: 1, 2: 0.90, 3: 0.85, 4: 0.80, 5: 0.80, 6: 0.80, 7: 0.76, 8: 0.74, 9: 0.73, 12: 0.69, 16: 0.65, 20: 0.63 },
    '0.5': { 1: 1, 2: 0.95, 3: 0.90, 4: 0.85, 5: 0.85, 6: 0.80, 7: 0.80, 8: 0.78, 9: 0.77, 12: 0.75, 16: 0.73, 20: 0.72 },
    '1.0': { 1: 1, 2: 0.95, 3: 0.95, 4: 0.90, 5: 0.90, 6: 0.90, 7: 0.89, 8: 0.88, 9: 0.88, 12: 0.86, 16: 0.85, 20: 0.84 },
  },
}

export const ARRANGEMENTS = {
  D2: [['touching', 'Touching'], ['diameter', 'One cable diameter apart'], ['0.125', '0.125 m apart'], ['0.25', '0.25 m apart'], ['0.5', '0.5 m apart']],
  D1: [['touching', 'Ducts touching'], ['0.25', '0.25 m apart'], ['0.5', '0.5 m apart'], ['1.0', '1.0 m apart']],
  other: [['touching', 'Bunched / touching']],
}

// Adiabatic k for k²S² ≥ I²t (IEC 60364-4-43 §434.5.2)
const K_SC = { 'cu-pvc': 115, 'cu-xlpe': 143, 'al-pvc': 76, 'al-xlpe': 94 }
export const MAX_TEMP = { pvc: 70, xlpe: 90 }

function interp(tab, x) {
  const xs = Object.keys(tab).map(Number).sort((a, b) => a - b)
  if (x <= xs[0]) return tab[xs[0]]
  if (x >= xs[xs.length - 1]) return tab[xs[xs.length - 1]]
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) { const a = xs[i - 1], b = xs[i]; return tab[a] + ((tab[b] - tab[a]) * (x - a)) / (b - a) }
  }
  return 1
}

export function groupFactor(method, n, arrangement) {
  if (n <= 1) return 1
  if (method === 'D2' || method === 'D1') return interp(K4[method][arrangement] || K4[method].touching, n)
  if (method === 'E' || method === 'F') return interp(K4.tray, n)
  return interp(K4.bunched, n)
}

export function correction(p) {
  const m = METHOD_BY_ID[p.method]
  const k1 = m?.ground ? interp(K1_GROUND[p.insulation], p.groundT) : interp(K1_AIR[p.insulation], p.airT)
  const k2 = p.method === 'D1' ? interp(K2_DUCT, p.soilR) : p.method === 'D2' ? interp(K2_DIRECT, p.soilR) : 1
  return { k1, k2 }
}

// Indicative supply price in €/m for one multi-core cable (or set of single cores)
export function unitPrice(material, cores, mm2) {
  return material === 'cu' ? 3 + 0.105 * cores * mm2 : 2.5 + 0.032 * cores * mm2
}

export function designCurrent(kw, config, voltage, pf) {
  if (config === 'DC') return (kw * 1000) / voltage
  return config === '1PN' ? (kw * 1000) / ((voltage / Math.sqrt(3)) * pf) : (kw * 1000) / (Math.sqrt(3) * voltage * pf)
}

export function voltageDrop({ config, material, voltage, pf }, I, len, mm2) {
  const rho = material === 'cu' ? 0.0225 : 0.036 // Ω·mm²/m near operating temperature
  const R = rho / mm2
  if (config === 'DC') return (200 * I * len * R) / voltage // out and back, no reactance
  const X = 0.00008, sin = Math.sqrt(1 - pf * pf)
  const z = R * pf + X * sin
  return config === '1PN' ? (200 * I * len * z) / (voltage / Math.sqrt(3)) : (100 * Math.sqrt(3) * I * len * z) / voltage
}

export const cableName = (n, cores, mm2, material) => `${n > 1 ? n + '× ' : ''}${cores}×${mm2} mm² ${material === 'cu' ? 'Cu' : 'Al'}`

/**
 * Size one circuit. p = cable settings + { method, Ib, len, groupN, vdMax, voltage, pf, choice }
 * Returns candidates (one per number of parallel cables, cheapest first) and the chosen one.
 */
export function sizeCable(p) {
  const cfg = CONFIGS[p.config] || CONFIGS['3PN']
  const key = `${p.material}-${p.insulation}-${cfg.loaded}`
  const table = AMPACITY[key]?.[p.method]
  const out = { k1: 1, k2: 1, k4: 1, cores: cfg.cores, candidates: [], chosen: null, warnings: [], error: null }
  if (!table) {
    out.error = `No IEC table loaded for ${p.material.toUpperCase()} / ${p.insulation.toUpperCase()} / ${cfg.loaded} loaded conductors / method ${p.method}. Choose another material, insulation or method.`
    return out
  }
  const { k1, k2 } = correction(p)
  Object.assign(out, { k1, k2 })
  const runLen = p.len + (p.extra || 0)
  const kSc = K_SC[`${p.material}-${p.insulation}`]
  for (let n = 1; n <= (p.maxParallel || 8); n++) {
    const groupN = Math.max(1, (p.groupN || 1) + n - 1)
    const k4 = groupFactor(p.method, groupN, p.arrangement)
    const need = p.Ib / n
    for (let i = 0; i < SIZES.length; i++) {
      const It = table[i]
      if (It == null) continue
      const Iz = It * k1 * k2 * k4
      if (Iz < need) continue
      const mm2 = SIZES[i]
      const vd = voltageDrop(p, need, runLen, mm2)
      if (vd > p.vdMax) continue
      const sMin = p.isc ? ((p.isc * 1000) / n) * Math.sqrt(p.tsc || 0.2) / kSc : 0
      if (mm2 < sMin) continue
      const unit = unitPrice(p.material, cfg.cores, mm2)
      out.candidates.push({ n, mm2, It, Iz: Iz * n, k4, groupN, vd, sMin, unit, price: unit * n * runLen, name: cableName(n, cfg.cores, mm2, p.material) })
      break
    }
  }
  out.candidates.sort((a, b) => a.price - b.price)
  if (out.candidates.length) {
    const minSec = Math.min(...out.candidates.map((c) => c.n * c.mm2))
    out.candidates.forEach((c, i) => { c.recommended = i === 0; c.minimum = c.n * c.mm2 === minSec })
  }
  const want = p.choice && out.candidates.find((c) => c.n === p.choice.n && c.mm2 === p.choice.mm2)
  if (p.choice && !want) {
    // a manual choice that is no longer in the shortlist: keep it if it still passes, otherwise warn
    const i = SIZES.indexOf(p.choice.mm2), It = table[i]
    if (It != null) {
      const k4 = groupFactor(p.method, (p.groupN || 1) + p.choice.n - 1, p.arrangement)
      const Iz = It * k1 * k2 * k4 * p.choice.n
      const vd = voltageDrop(p, p.Ib / p.choice.n, runLen, p.choice.mm2)
      const unit = unitPrice(p.material, cfg.cores, p.choice.mm2)
      const c = { n: p.choice.n, mm2: p.choice.mm2, It, Iz, k4, vd, unit, price: unit * p.choice.n * runLen, name: cableName(p.choice.n, cfg.cores, p.choice.mm2, p.material), manual: true }
      if (Iz >= p.Ib && vd <= p.vdMax) out.chosen = c
      else out.warnings.push(`Your chosen ${c.name} no longer meets the requirements (Iz ${Iz.toFixed(0)} A, ΔU ${vd.toFixed(1)}%). Using the recommended cable.`)
    }
  }
  out.chosen = out.chosen || want || out.candidates[0] || null
  if (out.chosen) {
    out.k4 = out.chosen.k4
    if (out.chosen.k4 < 0.6) out.warnings.push(`Grouping factor k4 = ${out.chosen.k4.toFixed(2)} is below 0.60 for ${out.chosen.groupN} circuits. The cable loses over 40% of its capacity to grouping; consider wider spacing in the trench, fewer parallel circuits or another installation method.`)
  } else {
    out.warnings.push(`No cable up to 300 mm² with ${p.maxParallel || 8} parallel runs meets ${p.Ib.toFixed(0)} A and ΔU ≤ ${p.vdMax}%. Allow more parallel cables, shorten the route, raise the voltage-drop limit, or split the load over several smaller units.`)
  }
  return out
}
