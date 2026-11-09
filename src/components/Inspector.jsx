import { CATALOG, KIND_LABEL, spec } from '../lib/catalog.js'
import { IssueRow } from './Steps.jsx'
import { BAY_ANGLES, bayAngle, bayBase, withAngle } from '../lib/project.js'

export default function Inspector({ it, A, project, api, onClose }) {
  const s = spec(it)
  const up = (ch) => api.updateItem(it.id, ch)
  const myIssues = A.issues.filter((x) => x.ids?.includes(it.id))
  const cable = A.cables.find((c) => c.id === it.id)
  const mvLink = A.mv.find((m) => m.id === it.id)
  const load = A.loads.find((l) => l.t.id === it.id)
  const place = A.placements?.[it.id]
  const isMcs = it.type === 'mcs'
  const R = project.rules
  const isBay = it.kind === 'bay'
  const powered = it.kind === 'charger' || it.kind === 'node'
  const feeders = [...A.tx, ...A.nodes.filter((n) => n.id !== it.id)]

  return (
    <div className="insp">
      <div className="row between">
        <h4>{KIND_LABEL[it.kind]}</h4>
        <button className="btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="row">
        <div className="field" style={{ maxWidth: 80 }}>
          <label htmlFor="i_label">Label</label>
          <input id="i_label" type="text" value={it.label} onChange={(e) => up({ label: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="i_type">Type</label>
          <select id="i_type" value={it.type} onChange={(e) => up({ type: e.target.value })}>
            {Object.entries(CATALOG[it.kind]).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        </div>
      </div>
      {isBay ? (
        <>
          <div className="field">
            <label>Parking angle to aisle</label>
            <div className="seg" role="group" aria-label="Parking angle">
              {BAY_ANGLES.map((a) => (
                <button key={a} aria-pressed={bayAngle(it) === a} onClick={() => up(withAngle(it, a))}>{a}°</button>
              ))}
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ maxWidth: 120 }}>
              <label htmlFor="i_base">Aisle direction (°)</label>
              <input id="i_base" type="number" min="0" max="359" step="1" value={Math.round(bayBase(it))}
                onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) up(withAngle(it, bayAngle(it), v)) }} />
            </div>
            <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => up(withAngle(it, bayAngle(it), bayBase(it) + 180))}>Reverse driving direction</button>
          </div>
        </>
      ) : (
        <div className="row between">
          <span className="small muted">Heading <span className="mono">{Math.round(it.rot || 0)}°</span></span>
          <button className="btn" onClick={() => up({ rot: ((it.rot || 0) + 90) % 360 })}>Rotate 90°</button>
        </div>
      )}

      {powered && (
        <>
          <div className="field">
            <label htmlFor="i_feed">Fed from</label>
            <select id="i_feed" value={it.feed ?? it.tx ?? 'auto'} onChange={(e) => up({ feed: e.target.value, tx: undefined })}>
              <option value="auto">Nearest transformer</option>
              {feeders.map((t) => <option key={t.id} value={t.id}>{t.label} · {KIND_LABEL[t.kind]}</option>)}
            </select>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="i_mode">Laying</label>
              <select id="i_mode" value={it.mode || ''} onChange={(e) => up({ mode: e.target.value || null })}>
                <option value="">Default ({project.defaults.mode === 'ug' ? 'UG' : 'OH'})</option>
                <option value="ug">Underground</option>
                <option value="oh">Overground</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="i_route">Route</label>
              <select id="i_route" value={it.route || ''} onChange={(e) => up({ route: e.target.value || null, wp: [] })}>
                <option value="">Default</option>
                <option value="L">L-route</option>
                <option value="straight">Straight</option>
              </select>
            </div>
          </div>
          {cable && (
            <div className="cablecard">
              <div className="row between"><b>{cable.name}</b><span className={'pill ' + (!cable.size?.chosen ? 'bad' : cable.size.warnings.length ? 'warn' : 'ok')}>{!cable.size?.chosen ? 'FAIL' : 'OK'}</span></div>
              <p className="small mono muted">{cable.len.toFixed(1)} m · I<sub>b</sub> {cable.Ib.toFixed(0)} A · I<sub>z</sub> {cable.Iz.toFixed(0)} A · ΔU {cable.vd.toFixed(2)}% · {cable.method}</p>
              <div className="row">
                <button className="btn pri" onClick={() => api.openWizard(it.id)}>Size cable…</button>
                {it.wp?.length > 0 && <button className="btn" onClick={() => up({ wp: [] })}>Reset route</button>}
              </div>
            </div>
          )}
          {place && (
            <div className="list">
              <div className="li"><span className="grow">Serves</span><span className="mono">{place.bay.label}</span></div>
              <div className="li"><span className="grow">Side of truck</span><span className={'pill ' + (place.side === 'left' ? 'ok' : isMcs ? 'bad' : 'warn')}>{place.side}</span></div>
              <div className="li"><span className="grow">From bay front</span>
                <span className={'pill ' + (place.fromFront >= R.mcsFrontMin && place.fromFront <= R.mcsFrontMax ? 'ok' : isMcs ? 'bad' : 'warn')}>{place.fromFront.toFixed(1)} m</span></div>
              <div className="li"><span className="grow">Gap to truck</span>
                <span className={'pill ' + (place.gap >= 0 && place.gap <= R.mcsMaxGap ? 'ok' : place.gap < 0 || isMcs ? 'bad' : 'warn')}>{place.gap.toFixed(2)} m</span></div>
            </div>
          )}
          {it.kind === 'charger' && A.heavy.length > 0 && <button className="btn" onClick={() => api.snapCharger(it.id)}>Snap to charging spot{place ? ` in ${place.bay.label}` : ''}</button>}
        </>
      )}

      {load && (
        <p className="small mono">
          {load.kw.toLocaleString()} kW connected · {load.kva.toFixed(0)} kVA demand ·{' '}
          <span className={'pill ' + (load.pct > 100 ? 'bad' : load.pct > 85 ? 'warn' : 'ok')}>{load.pct.toFixed(0)}%</span>
        </p>
      )}
      {mvLink && (
        <div className="row between small">
          <span className="mono muted">MV cable {mvLink.len.toFixed(1)} m from {mvLink.g.label}</span>
          {it.wp?.length > 0 && <button className="btn" onClick={() => up({ wp: [] })}>Reset MV route</button>}
        </div>
      )}

      <p className="small mono muted">{s.w} × {s.h} m · {it.lat.toFixed(6)}, {it.lng.toFixed(6)}</p>
      {myIssues.length > 0 && <div className="list">{myIssues.map((x, i) => <IssueRow key={i} x={x} />)}</div>}

      <div className="row">
        <button className="btn" onClick={() => api.duplicate(it.id)}>{isBay ? 'Add next bay' : 'Duplicate'}</button>
        <button className="btn danger" onClick={() => api.removeItem(it.id)}>Delete</button>
      </div>
      <p className="small muted">Drag to move · arrows nudge 0.25 m · R {isBay ? 'changes the angle' : 'rotates 90°'}{cable || mvLink ? ' · drag ○ on the cable to bend it' : ''}</p>
    </div>
  )
}