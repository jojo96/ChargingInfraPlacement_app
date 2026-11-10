import { useRef, useState } from 'react'
import { CATALOG, ICON_SVG, KIND_COLOR, spec } from '../lib/catalog.js'
import { METHODS } from '../lib/iec.js'
import { bom, cableSchedule, eur, downloadText, slug, toCsv } from '../lib/project.js'
import CableWizard from './CableWizard.jsx'

/* ---------- shared bits ---------- */

function Tile({ kind, type, ui, patchUi, api }) {
  const s = CATALOG[kind][type]
  const armed = ui.arm && ui.arm[0] === kind && ui.arm[1] === type
  const meta = kind === 'charger' || kind === 'node' ? s.note : kind === 'grid' ? 'MV feed' : `${s.w} × ${s.h} m`
  const title = kind === 'tx' ? `${s.kva} kVA` : s.name
  const glyph = kind === 'bay'
    ? <svg viewBox="0 0 24 24" width="18" height="18"><rect x={12 - s.w * 1.6} y={12 - Math.min(s.h, 7) * 1.5} width={s.w * 3.2} height={Math.min(s.h, 7) * 3} fill="none" stroke="#17212b" strokeWidth="1.6" /></svg>
    : <span dangerouslySetInnerHTML={{ __html: ICON_SVG[kind] }} />
  const bg = kind === 'bay' ? { background: s.color, border: '1px solid #0003' } : { background: KIND_COLOR[kind] }
  return (
    <div
      className={'tile' + (armed ? ' armed' : '')}
      draggable
      tabIndex={0}
      role="button"
      title="Drag onto the map, or click then click the map"
      onDragStart={(e) => { e.dataTransfer.setData('text/x-chargesite', `${kind}:${type}`); e.dataTransfer.effectAllowed = 'copy' }}
      onClick={() => patchUi({ arm: armed ? null : [kind, type], pickSite: false })}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.addAtCentre?.(kind, type) } }}
    >
      <div className="gl" style={bg}>{glyph}</div>
      <div><b>{title}</b><span>{meta}</span></div>
    </div>
  )
}

export function IssueRow({ x, onClick }) {
  return (
    <div className={'li' + (onClick ? ' res' : '')} onClick={onClick}>
      <span className={'pill ' + x.sev}>{x.sev === 'bad' ? 'FAIL' : 'WARN'}</span>
      <span className="grow">{x.msg}</span>
    </div>
  )
}

function Issues({ A, api }) {
  if (!A.issues.length) return <div className="list"><div className="li"><span className="pill ok">OK</span><span className="grow">All constraints satisfied</span></div></div>
  return <div className="list">{A.issues.map((x, i) => <IssueRow key={i} x={x} onClick={x.ids?.[0] ? () => api.focusItem(x.ids[0]) : undefined} />)}</div>
}

function Nav({ ui, patchUi, next }) {
  return (
    <div className="foot">
      {ui.step > 0 ? <button className="btn" onClick={() => patchUi({ step: ui.step - 1, arm: null })}>Back</button> : <span />}
      {next && <button className="btn pri" onClick={() => patchUi({ step: ui.step + 1, arm: null })}>Next: {next}</button>}
    </div>
  )
}

function NumField({ id, label, value, step = 1, onChange, ...rest }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" step={step} defaultValue={value} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }} {...rest} />
    </div>
  )
}

/* ---------- 1. Site ---------- */

export function SiteStep({ project, ui, patchUi, api }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [copied, setCopied] = useState(false)
  const [bStatus, setBStatus] = useState('')

  const search = async () => {
    const v = q.trim()
    if (!v) return
    const m = v.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/)
    if (m) { api.setSite(+m[1], +m[2]); setResults(null); return }
    setResults({ loading: true })
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' + encodeURIComponent(v), { headers: { 'Accept-Language': 'en' } })
      setResults({ list: await r.json() })
    } catch (e) {
      setResults({ error: 'Search is unreachable. Paste coordinates instead, e.g. 51.2194, 4.4025.' })
    }
  }
  const myLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((p) => api.setSite(p.coords.latitude, p.coords.longitude), () => setResults({ error: 'Location permission was refused.' }))
  }
  const copy = () => {
    const t = `${project.site[0].toFixed(6)}, ${project.site[1].toFixed(6)}`
    navigator.clipboard?.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {})
  }
  const loadB = async () => {
    setBStatus('Loading buildings…')
    try { const n = await api.loadBuildings(); setBStatus(`${n} buildings loaded`) } catch { setBStatus('Could not reach OpenStreetMap. Try again later.') }
  }

  return (
    <>
      <div className="sec"><h2>Where is the site?</h2><p className="muted small">Search an address, paste coordinates, or click the map to pin the site.</p></div>
      <div className="sec">
        <div className="field">
          <label htmlFor="q">Address or "lat, lng"</label>
          <div className="row">
            <input id="q" type="text" style={{ flex: 1 }} placeholder="e.g. Pleinlaan 2, Brussels · 51.2194, 4.4025" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
            <button className="btn pri" onClick={search}>Find</button>
          </div>
        </div>
        {results && (
          <div className="list">
            {results.loading && <div className="li muted">Searching…</div>}
            {results.error && <div className="li muted">{results.error}</div>}
            {results.list && !results.list.length && <div className="li muted">No match. Try a street and city.</div>}
            {results.list?.map((x) => (
              <div key={x.place_id} className="li res" onClick={() => { api.setSite(+x.lat, +x.lon); setResults(null) }}><span className="grow">{x.display_name}</span></div>
            ))}
          </div>
        )}
        <div className="row">
          <button className="btn" onClick={myLocation}>Use my location</button>
          <button className="btn" onClick={() => patchUi({ pickSite: true, arm: null })}>Pin on map</button>
        </div>
      </div>
      <div className="sec">
        <h3>Site coordinate</h3>
        {project.site ? (
          <div className="list"><div className="li">
            <span className="dot" style={{ background: 'var(--bad)' }} />
            <span className="grow mono">{project.site[0].toFixed(6)}, {project.site[1].toFixed(6)}</span>
            <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            <button className="btn" onClick={() => api.goTo(project.site[0], project.site[1])}>Go</button>
          </div></div>
        ) : <p className="muted small">No site pinned yet.</p>}
      </div>
      <div className="sec">
        <h3>Surroundings</h3>
        <p className="muted small">Load real building footprints and heights from OpenStreetMap around the site. They appear on the map and in 3D.</p>
        <div className="row"><button className="btn" onClick={loadB} disabled={!project.site}>{project.buildings?.length ? 'Reload buildings' : 'Load OSM buildings'}</button>{bStatus && <span className="small muted">{bStatus}</span>}</div>
      </div>
      <Nav ui={ui} patchUi={patchUi} next="parking" />
    </>
  )
}

/* ---------- 2. Parking ---------- */

export function ParkingStep({ project, A, ui, patchUi, api }) {
  const [type, setType] = useState('truck')
  const [n, setN] = useState(6)
  const [rot, setRot] = useState(project.defaultRot || 0)
  const [angle, setAngle] = useState(45)
  const counts = A.bays.reduce((m, b) => ((m[b.type] = (m[b.type] || 0) + 1), m), {})
  return (
    <>
      <div className="sec"><h2>Lay out parking bays</h2><p className="muted small">Drag a bay onto the map, or click it and then click the map. Sizes are real metres. Select a bay to set its angle; <span className="mono">R</span> steps through 90/60/45/30°.</p></div>
      <div className="tiles">{Object.keys(CATALOG.bay).map((t) => <Tile key={t} kind="bay" type={t} ui={ui} patchUi={patchUi} api={api} />)}</div>
      <div className="sec">
        <h3>Add a row of bays</h3>
        <div className="row">
          <div className="field">
            <label htmlFor="rowType">Type</label>
            <select id="rowType" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(CATALOG.bay).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
          </div>
          <div className="field" style={{ maxWidth: 70 }}><label htmlFor="rowN">Count</label><input id="rowN" type="number" min="1" max="40" value={n} onChange={(e) => setN(+e.target.value)} /></div>
          <div className="field" style={{ maxWidth: 80 }}><label htmlFor="rowRot">Aisle°</label><input id="rowRot" type="number" min="0" max="359" value={rot} onChange={(e) => setRot(+e.target.value)} /></div>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="Bay arrangement">
            {[[90, '90°'], [60, '60°'], [45, '45° fishbone'], [30, '30°']].map(([a, t]) => (
              <button key={a} aria-pressed={angle === a} onClick={() => setAngle(a)}>{t}</button>
            ))}
          </div>
        </div>
        {type === 'truck' && <p className="small muted">CharIN recommends 45° fishbone with drive-through bays (forward only). The arrow on each bay shows the driving direction; the driver's left is where MCS goes.</p>}
        <button className="btn" onClick={() => api.addRow(type, Math.max(1, Math.min(40, n || 1)), ((rot || 0) % 360 + 360) % 360, angle)}>Add row at map centre</button>
      </div>
      <div className="sec">
        <h3>Bays placed</h3>
        <div className="list">
          {Object.keys(counts).length ? Object.entries(counts).map(([t, c]) => (
            <div className="li" key={t}><span className="dot" style={{ background: CATALOG.bay[t].color, border: '1px solid #0004' }} /><span className="grow">{CATALOG.bay[t].name}</span><span className="mono">{c}</span></div>
          )) : <div className="li muted">None yet</div>}
        </div>
      </div>
      <Nav ui={ui} patchUi={patchUi} next="hardware" />
    </>
  )
}

/* ---------- 3. Hardware (sequence) ---------- */

export function HardwareStep({ project, A, ui, patchUi, api }) {
  const hasCh = A.ch.length > 0, hasTx = A.tx.length > 0, hasG = A.grid.length > 0
  const R = project.rules
  const kw = A.ch.reduce((s, c) => s + spec(c).kw, 0)
  const tiles = (kind) => <div className="tiles">{Object.keys(CATALOG[kind]).map((t) => <Tile key={t} kind={kind} type={t} ui={ui} patchUi={patchUi} api={api} />)}</div>
  return (
    <>
      <div className="sec"><h2>Place hardware in sequence</h2><p className="muted small">Chargers first, then the transformer that feeds them, then the grid connection. Each step unlocks the next.</p></div>
      <div className="seq">
        <div className={'seqi' + (hasCh ? ' ok' : '')} data-n="1">
          <h4>Select DC chargers</h4>
          {tiles('charger')}
          <p className="small muted">{A.ch.length} placed · {kw.toLocaleString()} kW installed</p>
        </div>
        <div className={'seqi' + (hasTx ? ' ok' : '') + (hasCh ? '' : ' locked')} data-n="2">
          <h4>Set the transformer</h4>
          {!hasCh && <p className="small muted">Place a DC charger first.</p>}
          {tiles('tx')}
          {A.loads.map((l) => (
            <div key={l.t.id} className="row small between">
              <span className="mono">{l.t.label} · {l.kva.toFixed(0)} / {l.cap} kVA</span>
              <span className={'pill ' + (l.pct > 100 ? 'bad' : l.pct > 85 ? 'warn' : 'ok')}>{l.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
        <div className={'seqi' + (A.nodes.length ? ' ok' : '') + (hasTx ? '' : ' locked')} data-n="3">
          <h4>Distribution <span className="muted small">(optional)</span></h4>
          <p className="small muted">A cabinet or junction box between transformer and chargers gives a star layout with one long feeder and short branch cables. Select a charger and set <b>Fed from</b> to the cabinet.</p>
          {tiles('node')}
        </div>
        <div className={'seqi' + (hasG ? ' ok' : '') + (hasTx ? '' : ' locked')} data-n="4">
          <h4>Grid connection point</h4>
          {!hasTx && <p className="small muted">Set a transformer first.</p>}
          {tiles('grid')}
        </div>
        <div className="seqi" data-n="5">
          <h4>Distance constraints</h4>
          <div className="row">
            <NumField id="r_txClear" label="Transformer clearance (m)" step={0.5} value={R.txClear} onChange={(v) => api.setRule('txClear', v)} />
            <NumField id="r_chargerReach" label="Charger → bay reach (m)" step={0.5} value={R.chargerReach} onChange={(v) => api.setRule('chargerReach', v)} />
          </div>
          <div className="row">
            <NumField id="r_chargerGap" label="Charger spacing (m)" step={0.5} value={R.chargerGap} onChange={(v) => api.setRule('chargerGap', v)} />
            <NumField id="r_maxLv" label="Max LV cable (m)" step={5} value={R.maxLv} onChange={(v) => api.setRule('maxLv', v)} />
          </div>
          <div className="row">
            <NumField id="r_maxVd" label="Max voltage drop (%)" step={0.5} value={R.maxVd} onChange={(v) => api.setRule('maxVd', v)} />
            <NumField id="r_simult" label="Simultaneity factor" step={0.05} min="0.1" max="1" value={R.simult} onChange={(v) => api.setRule('simult', v)} />
          </div>
          <h4 style={{ marginTop: 6 }}>Truck charging spot (CharIN / FLEXMCS)</h4>
          <p className="small muted">MCS goes on the driver's left. The green strip on each truck bay shows the allowed zone. Select a charger and use <b>Snap to charging spot</b> to place it there.</p>
          <div className="row">
            <NumField id="r_mcsFrontMin" label="From bay front, min (m)" step={0.1} value={R.mcsFrontMin} onChange={(v) => api.setRule('mcsFrontMin', v)} />
            <NumField id="r_mcsFrontMax" label="From bay front, max (m)" step={0.1} value={R.mcsFrontMax} onChange={(v) => api.setRule('mcsFrontMax', v)} />
          </div>
          <div className="row">
            <NumField id="r_mcsMaxGap" label="Max gap to truck (m)" step={0.1} value={R.mcsMaxGap} onChange={(v) => api.setRule('mcsMaxGap', v)} />
            <NumField id="r_truckW" label="Truck width (m)" step={0.05} value={R.truckW} onChange={(v) => api.setRule('truckW', v)} />
          </div>
          <div className="row">
            <NumField id="r_bayMinW" label="Bay min width (m)" step={0.05} value={R.bayMinW} onChange={(v) => api.setRule('bayMinW', v)} />
            <NumField id="r_bayMinL" label="Bay min length (m)" step={0.5} value={R.bayMinL} onChange={(v) => api.setRule('bayMinL', v)} />
          </div>
          <Issues A={A} api={api} />
        </div>
      </div>
      <Nav ui={ui} patchUi={patchUi} next="wiring" />
    </>
  )
}

/* ---------- 4. Wiring ---------- */

export function WiringStep({ project, A, ui, patchUi, api }) {
  const d = project.defaults, c0 = project.cable
  const sel = A.cables.find((c) => c.id === ui.sel)
  if (sel) {
    return (
      <>
        <button className="btn back" onClick={() => patchUi({ sel: null })}>← All cables</button>
        <CableWizard key={sel.id} cable={sel} project={project} api={api} />
        <Nav ui={ui} patchUi={patchUi} next="report" />
      </>
    )
  }
  const setC = (k, v) => api.setCableDefault(k, v)
  return (
    <>
      <div className="sec"><h2>Route and size the cables</h2><p className="muted small">Each charger is fed from its nearest transformer, or from the cabinet or transformer you pick. Select a cable to drag its route and size it to IEC 60364-5-52.</p></div>
      <div className="sec">
        <h3>Routing defaults</h3>
        <div className="row">
          <div className="seg" role="group" aria-label="Default mode">
            <button aria-pressed={d.mode === 'ug'} onClick={() => api.setDefault('mode', 'ug')}>Underground</button>
            <button aria-pressed={d.mode === 'oh'} onClick={() => api.setDefault('mode', 'oh')}>Overground</button>
          </div>
          <div className="seg" role="group" aria-label="Default route">
            <button aria-pressed={d.route === 'L'} onClick={() => api.setDefault('route', 'L')}>L-route</button>
            <button aria-pressed={d.route === 'straight'} onClick={() => api.setDefault('route', 'straight')}>Straight</button>
          </div>
        </div>
      </div>
      <div className="sec">
        <h3>Cable defaults</h3>
        <div className="row">
          <div className="seg" role="group" aria-label="Material">
            <button aria-pressed={c0.material === 'al'} onClick={() => setC('material', 'al')}>Al</button>
            <button aria-pressed={c0.material === 'cu'} onClick={() => setC('material', 'cu')}>Cu</button>
          </div>
          <div className="seg" role="group" aria-label="Insulation">
            <button aria-pressed={c0.insulation === 'xlpe'} onClick={() => setC('insulation', 'xlpe')}>XLPE</button>
            <button aria-pressed={c0.insulation === 'pvc'} onClick={() => setC('insulation', 'pvc')}>PVC</button>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="d_ug">Underground method</label>
            <select id="d_ug" value={c0.methodUg} onChange={(e) => setC('methodUg', e.target.value)}>{METHODS.filter((m) => m.ground).map((m) => <option key={m.id} value={m.id}>{m.id} · {m.label}</option>)}</select>
          </div>
          <div className="field">
            <label htmlFor="d_oh">Overground method</label>
            <select id="d_oh" value={c0.methodOh} onChange={(e) => setC('methodOh', e.target.value)}>{METHODS.filter((m) => !m.ground).map((m) => <option key={m.id} value={m.id}>{m.id} · {m.label}</option>)}</select>
          </div>
        </div>
      </div>
      <div className="sec">
        <h3>Cables</h3>
        <div className="list">
          {A.cables.length ? A.cables.map((c) => (
            <div className="li res" key={c.id} onClick={() => api.focusItem(c.id)}>
              <span className="dot" style={{ background: !c.size?.chosen ? 'var(--bad)' : c.mode === 'ug' ? 'var(--ug)' : 'var(--oh)' }} />
              <span className="grow">
                <b>{c.from.label} → {c.to.label}</b> <span className="muted small">{c.method}</span><br />
                <span className="mono small muted">{c.len.toFixed(1)} m · {c.Ib.toFixed(0)} A · {c.name} · ΔU {c.vd.toFixed(2)}%</span>
              </span>
              <span className={'pill ' + (!c.size?.chosen ? 'bad' : c.size.warnings.length ? 'warn' : 'ok')}>{!c.size?.chosen ? 'FAIL' : c.size.warnings.length ? 'CHECK' : 'OK'}</span>
            </div>
          )) : <div className="li muted">Place chargers and a transformer to generate cables.</div>}
        </div>
      </div>
      <Nav ui={ui} patchUi={patchUi} next="report" />
    </>
  )
}

/* ---------- 5. Report ---------- */

export function ReportStep({ project, A, ui, patchUi, api }) {
  const B = bom(project, A)
  const sched = cableSchedule(A)
  const kw = A.ch.reduce((s, c) => s + spec(c).kw, 0)
  const kva = A.tx.reduce((s, t) => s + spec(t).kva, 0)
  const fails = A.issues.filter((x) => x.sev === 'bad').length
  const warns = A.issues.length - fails
  const fileRef = useRef(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [importErr, setImportErr] = useState('')

  const exportCsv = () => {
    const rows = [['Category', 'Item', 'Qty', 'Unit', 'Unit price EUR', 'Total EUR'], ...B.rows.map((r) => [r.cat, r.item, r.qty, r.unit, r.price, r.total]), ['', 'Total', '', '', '', B.total]]
    downloadText(slug(project.name) + '-bom.csv', toCsv(rows), 'text/csv')
  }
  const exportSched = () => {
    const rows = [['From', 'To', 'Length m', 'Load kW', 'Ib A', 'Method', 'Circuits in group', 'Cable', 'Iz A', 'Voltage drop %', 'Laying', 'OK'],
      ...sched.map((r) => [r.from, r.to, r.len.toFixed(1), r.kw.toFixed(0), r.Ib.toFixed(0), r.method, r.groupN, r.cable, r.Iz.toFixed(0), r.vd.toFixed(2), r.mode, r.ok ? 'yes' : 'no'])]
    downloadText(slug(project.name) + '-cable-schedule.csv', toCsv(rows), 'text/csv')
  }
  const onImport = (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    f.text().then((t) => {
      try { const p = JSON.parse(t); if (!Array.isArray(p.items)) throw new Error(); api.importProject(p); setImportErr('') }
      catch { setImportErr('That file is not a ChargeSite project.') }
    })
  }

  return (
    <>
      <div className="sec"><h2>{project.name}</h2><p className="muted small mono">{project.site ? `${project.site[0].toFixed(5)}, ${project.site[1].toFixed(5)}` : 'No site pinned'}</p></div>
      <div className="kpis">
        <div className="kpi"><div className="v">{A.bays.length}</div><div className="l">Parking bays</div></div>
        <div className="kpi"><div className="v">{A.ch.length}</div><div className="l">Chargers · {kw.toLocaleString()} kW</div></div>
        <div className="kpi"><div className="v">{kva.toLocaleString()}</div><div className="l">kVA transformer</div></div>
        <div className="kpi"><div className="v">{eur(B.total)}</div><div className="l">Indicative CAPEX</div></div>
      </div>
      <div className="sec">
        <h3>Checks</h3>
        <div className="row"><span className={'pill ' + (fails ? 'bad' : 'ok')}>{fails} fail</span><span className={'pill ' + (warns ? 'warn' : 'ok')}>{warns} warning</span></div>
        <Issues A={A} api={api} />
      </div>
      <div className="sec">
        <h3>Cable schedule</h3>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Circuit</th><th>Cable</th><th className="n">m</th><th className="n">ΔU</th></tr></thead>
            <tbody>
              {sched.map((r, i) => (
                <tr key={i}><td>{r.from} → {r.to}<br /><span className="muted small">{r.Ib.toFixed(0)} A · {r.method}</span></td><td>{r.cable}</td><td className="n">{r.len.toFixed(0)}</td><td className="n">{r.vd.toFixed(1)}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="sec">
        <h3>Indicative cost</h3>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Item</th><th className="n">Qty</th><th className="n">Total</th></tr></thead>
            <tbody>
              {B.rows.map((r, i) => (
                <tr key={i}><td>{r.item}<br /><span className="muted small">{r.cat} · {eur(r.price)}/{r.unit}</span></td><td className="n">{r.qty}{r.unit === 'm' ? ' m' : ''}</td><td className="n">{eur(r.total)}</td></tr>
              ))}
              <tr><th>Total CAPEX (excl. VAT)</th><th /><th className="n">{eur(B.total)}</th></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">Unit prices are placeholders. Edit them below to match your quotes.</p>
      </div>
      <div className="sec">
        <h3>Unit prices</h3>
        <div className="row">
          <NumField id="p_trench" label="Trench €/m" value={project.prices.trench} onChange={(v) => api.setPrice('trench', v)} />
          <NumField id="p_overhead" label="Overground €/m" value={project.prices.overhead} onChange={(v) => api.setPrice('overhead', v)} />
          <NumField id="p_mvCable" label="MV €/m" value={project.prices.mvCable} onChange={(v) => api.setPrice('mvCable', v)} />
        </div>
      </div>
      <div className="sec">
        <h3>Project file</h3>
        <div className="row">
          <button className="btn" onClick={() => downloadText(slug(project.name) + '.chargesite.json', JSON.stringify(project, null, 2), 'application/json')}>Export project</button>
          <button className="btn" onClick={() => fileRef.current.click()}>Import project</button>
          <button className="btn" onClick={exportCsv}>Export BOM (CSV)</button>
          <button className="btn" onClick={exportSched}>Export cable schedule (CSV)</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} />
        </div>
        {importErr && <p className="hint">{importErr}</p>}
        <div className="row">
          <button className="btn" onClick={api.loadExample}>Load example depot here</button>
          <button className="btn danger" onClick={() => { if (confirmClear) { api.clear(); setConfirmClear(false) } else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000) } }}>
            {confirmClear ? 'Click again to clear' : 'Clear layout'}
          </button>
        </div>
      </div>
      <Nav ui={ui} patchUi={patchUi} />
    </>
  )
}