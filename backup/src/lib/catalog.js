// Equipment catalogue. Sizes in metres, power in kW / kVA, cost in EUR (indicative placeholders).
export const CATALOG = {
  bay: {
    car:   { name: 'Car bay',        w: 2.5, h: 5.0,  cost: 150, color: '#ffffff', vehicle: 'car' },
    acc:   { name: 'Accessible bay', w: 3.6, h: 5.0,  cost: 250, color: '#7fd4ff', vehicle: 'car' },
    van:   { name: 'Van bay',        w: 3.5, h: 7.5,  cost: 250, color: '#ffe08a', vehicle: 'van' },
    bus:   { name: 'Bus bay',        w: 4.0, h: 15.0, cost: 450, color: '#9cf0c4', heavy: true, vehicle: 'bus' },
    truck: { name: 'Truck charging bay', w: 4.7, h: 19.0, cost: 600, color: '#ffb27a', heavy: true, vehicle: 'truck' }, // CharIN 3.3.1.7: min 4.7–5.05 m × 19 m
  },
  charger: {
    dc50:  { name: 'DC 50 kW',  kw: 50,   w: 0.8, h: 0.6, cost: 25000,  note: 'Car', height: 1.9 },
    dc150: { name: 'DC 150 kW', kw: 150,  w: 1.0, h: 0.8, cost: 55000,  note: 'Car / van', height: 2.1 },
    dc400: { name: 'DC 400 kW', kw: 400,  w: 1.4, h: 1.0, cost: 120000, note: 'Truck / bus', height: 2.3 },
    mcs:   { name: 'MCS 1 MW',  kw: 1000, w: 2.2, h: 1.4, cost: 300000, note: 'Megawatt truck', height: 2.5 },
  },
  node: {
    jb:  { name: 'Junction box',          w: 0.8, h: 0.5, cost: 1500,  note: 'Splits one feeder', height: 0.9 },
    cab: { name: 'Distribution cabinet',  w: 1.6, h: 0.6, cost: 12000, note: 'LV switchgear', height: 1.4 },
  },
  tx: {
    t630:  { name: 'Transformer 630 kVA',  kva: 630,  w: 3.0, h: 2.5, cost: 45000 },
    t1000: { name: 'Transformer 1000 kVA', kva: 1000, w: 3.5, h: 2.6, cost: 60000 },
    t1600: { name: 'Transformer 1600 kVA', kva: 1600, w: 4.0, h: 2.8, cost: 80000 },
    t2500: { name: 'Transformer 2500 kVA', kva: 2500, w: 5.0, h: 3.0, cost: 110000 },
  },
  grid: {
    mv: { name: 'Grid connection (MV)', w: 1.2, h: 1.2, cost: 15000 },
  },
}

// Vehicle outlines drawn on bays (metres)
export const VEHICLE = {
  truck: { w: 2.55, len: 16.5, cab: 2.4, h: 4.0 },
  bus:   { w: 2.55, len: 12.0, h: 3.2 },
  van:   { w: 2.0,  len: 6.0,  h: 2.6 },
  car:   { w: 1.85, len: 4.6,  h: 1.5 },
}

export const KIND_LABEL = { bay: 'Parking bay', charger: 'DC charger', node: 'Distribution', tx: 'Transformer', grid: 'Grid connection' }

export const KIND_COLOR = { charger: '#119a63', node: '#2b7de9', tx: '#d98a00', grid: '#7a3fd0' }

export const ICON_SVG = {
  charger: '<svg viewBox="0 0 24 24"><path d="M13 2 5 13h6l-1 9 8-12h-6z" fill="#fff"/></svg>',
  node: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" fill="#fff"/><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
  tx: '<svg viewBox="0 0 24 24"><path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><path d="M12 2 6 22M12 2l6 20M8 9h8M7 14h10" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
}

export const spec = (it) => CATALOG[it.kind][it.type]

// Default cable design settings (IEC 60364-5-52). Each cable can override any of these.
export const CABLE_DEFAULTS = {
  config: '3PN',        // '1PN' | '3PN' | '3PNPE'
  material: 'al',       // 'cu' | 'al'
  insulation: 'xlpe',   // 'xlpe' | 'pvc'
  methodUg: 'D2',       // underground cables
  methodOh: 'E',        // overground cables (tray)
  soilR: 1.0,           // K·m/W
  groundT: 20,          // °C
  airT: 30,             // °C
  arrangement: 'touching',
  rule: 'none',         // 'none' | '30'
  extra: 3,             // m extra length per run
  maxParallel: 12,
  isc: null,            // kA prospective short-circuit current (optional)
  tsc: 0.2,             // s disconnection time
}

export const defaultProject = () => ({
  name: 'Untitled depot',
  site: null,
  view: { c: [51.2194, 4.4025], z: 17 },
  items: [],
  buildings: [],
  defaultRot: 0,
  defaults: { mode: 'ug', route: 'L' },
  cable: { ...CABLE_DEFAULTS },
  rules: {
    txClear: 3, chargerReach: 6, chargerGap: 1, maxLv: 150, maxVd: 3, simult: 0.8, pf: 0.95, voltage: 400,
    // CharIN whitepaper 3.3.1.7 / 3.3.2.2 and FLEXMCS D2.1 VEH_RQ-09, -20, -21, -24
    bayMinW: 4.7, bayMinL: 19, truckW: 2.55, mcsFrontMin: 2, mcsFrontMax: 4.8, mcsMaxGap: 0.9,
  },
  prices: { trench: 120, overhead: 60, mvCable: 150 },
})