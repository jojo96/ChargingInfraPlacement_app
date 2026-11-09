import { METHODS, METHOD_BY_ID, CONFIGS, ARRANGEMENTS, MAX_TEMP, designCurrent } from '../lib/iec.js'
import { eur } from '../lib/project.js'

const GROUPS = ['In conduit / pipe', 'Clipped to surface', 'Underground', 'Free air / cable tray']

function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg wide" role="group" aria-label={label}>
      {options.map(([v, t]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}
    </div>
  )
}

export default function CableWizard({ cable, project, api }) {
  const it = cable.to
  const s = cable.settings
  const R = project.rules
  const set = (patch) => api.updateItem(it.id, { cable: { ...(it.cable || {}), ...patch, choice: patch.choice !== undefined ? patch.choice : undefined } })
  const m = METHOD_BY_ID[cable.method]
  const res = cable.size
  const autoIb = designCurrent(cable.kw, s.config, R.voltage, R.pf)
  const arrangements = ARRANGEMENTS[cable.method] || ARRANGEMENTS.other
  const num = (v) => { const x = parseFloat(v); return isNaN(x) ? undefined : x }

  return (
    <div className="wiz">
      <div className="wiz-head">
        <div>
          <h2>{cable.from.label} → {cable.to.label}</h2>
          <p className="muted small mono">{cable.len.toFixed(1)} m route · {cable.kw.toFixed(0)} kW · {cable.mode === 'ug' ? 'underground' : 'overground'}</p>
        </div>
        <button className="btn" onClick={() => api.updateItem(it.id, { cable: undefined })} title="Use the project defaults again">Apply standard values</button>
      </div>

      {/* 1 */}
      <section className="wiz-step">
        <h3><span className="num">1</span>Conductor material &amp; insulation</h3>
        <label className="lbl-s">Circuit configuration</label>
        <Seg label="Circuit" value={s.config} onChange={(v) => set({ config: v })} options={Object.entries(CONFIGS).map(([k, c]) => [k, `${c.label} (${c.cores} cond.)`])} />
        <p className="hint-s">{CONFIGS[s.config].note}. {CONFIGS[s.config].loaded} loaded conductors · IEC 60364-5-52 §523</p>
        <div className="row">
          <div className="field">
            <label className="lbl-s">Conductor material</label>
            <Seg label="Material" value={s.material} onChange={(v) => set({ material: v })} options={[['al', 'Aluminium (Al)'], ['cu', 'Copper (Cu)']]} />
          </div>
        </div>
        <p className="hint-s">Aluminium is usual for underground feeders above 50 mm².</p>
        <div className="row">
          <div className="field">
            <label className="lbl-s">Insulation</label>
            <Seg label="Insulation" value={s.insulation} onChange={(v) => set({ insulation: v })} options={[['xlpe', 'XLPE'], ['pvc', 'PVC']]} />
          </div>
          <div className="field" style={{ maxWidth: 120 }}>
            <label className="lbl-s">Max. conductor temp.</label>
            <div className="ro mono">{MAX_TEMP[s.insulation]} °C</div>
          </div>
        </div>
      </section>

      {/* 2 */}
      <section className="wiz-step">
        <h3><span className="num">2</span>Installation method</h3>
        {GROUPS.map((gname) => (
          <div key={gname}>
            <div className="lbl-s cap">{gname}</div>
            <div className="methods">
              {METHODS.filter((x) => x.group === gname).map((x) => (
                <button key={x.id} className={'method' + (cable.method === x.id ? ' on' : '')} onClick={() => set({ method: x.id })}>
                  {x.ev && <span className="ev">{x.ev}</span>}
                  <b>{x.id}</b>
                  <span>{x.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="row">
          {m?.ground ? (
            <>
              <div className="field">
                <label className="lbl-s" htmlFor="w_soil">Soil thermal resistivity</label>
                <select id="w_soil" value={s.soilR} onChange={(e) => set({ soilR: +e.target.value })}>
                  {[0.5, 0.7, 1, 1.5, 2, 2.5, 3].map((v) => <option key={v} value={v}>{v.toFixed(1)} K·m/W</option>)}
                </select>
              </div>
              <div className="field">
                <label className="lbl-s" htmlFor="w_gt">Ground temperature</label>
                <select id="w_gt" value={s.groundT} onChange={(e) => set({ groundT: +e.target.value })}>
                  {[10, 15, 20, 25, 30, 35, 40].map((v) => <option key={v} value={v}>{v} °C</option>)}
                </select>
              </div>
            </>
          ) : (
            <div className="field">
              <label className="lbl-s" htmlFor="w_at">Air temperature</label>
              <select id="w_at" value={s.airT} onChange={(e) => set({ airT: +e.target.value })}>
                {[10, 15, 20, 25, 30, 35, 40, 45, 50].map((v) => <option key={v} value={v}>{v} °C</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="row">
          <div className="field">
            <label className="lbl-s" htmlFor="w_arr">Cable grouping</label>
            <select id="w_arr" value={arrangements.some(([k]) => k === s.arrangement) ? s.arrangement : arrangements[0][0]} onChange={(e) => set({ arrangement: e.target.value })}>
              {arrangements.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
          <div className="field" style={{ maxWidth: 130 }}>
            <label className="lbl-s" htmlFor="w_grp">Circuits in group</label>
            <input id="w_grp" type="number" min="1" placeholder={`auto (${cable.groupN})`} value={it.cable?.groupN ?? ''} onChange={(e) => set({ groupN: num(e.target.value) })} />
          </div>
        </div>
        <div className="lbl-s cap">Standard rules for grouping</div>
        <label className={'radio' + (s.rule === 'none' ? ' on' : '')}>
          <input type="radio" name="rule" checked={s.rule === 'none'} onChange={() => set({ rule: 'none' })} />
          <span><b>No simplification</b><br /><span className="hint-s">Grouping factor from the IEC tables for every circuit in the group.</span></span>
        </label>
        <label className={'radio' + (s.rule === '30' ? ' on' : '')}>
          <input type="radio" name="rule" checked={s.rule === '30'} onChange={() => set({ rule: '30' })} />
          <span><b>30% rule</b> <span className="tag">IEC 60364-5-52</span><br /><span className="hint-s">Circuits in the group carrying less than 30% of their capacity are left out of the grouping factor.</span></span>
        </label>
      </section>

      {/* 3 */}
      <section className="wiz-step">
        <h3><span className="num">3</span>Electrical requirements</h3>
        <div className="row">
          <div className="field">
            <label className="lbl-s" htmlFor="w_ib">Design current I<sub>b</sub> (A)</label>
            <input id="w_ib" type="number" placeholder={`auto ${autoIb.toFixed(0)}`} value={it.cable?.Ib ?? ''} onChange={(e) => set({ Ib: num(e.target.value) })} />
          </div>
          <div className="field">
            <label className="lbl-s" htmlFor="w_par">Max parallel cables</label>
            <input id="w_par" type="number" min="1" max="20" value={s.maxParallel} onChange={(e) => set({ maxParallel: num(e.target.value) || 1 })} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label className="lbl-s" htmlFor="w_ex">Extra length per run (m)</label>
            <input id="w_ex" type="number" value={s.extra} onChange={(e) => set({ extra: num(e.target.value) ?? 0 })} />
          </div>
          <div className="field">
            <label className="lbl-s">Route length on map</label>
            <div className="ro mono">{cable.len.toFixed(1)} m</div>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label className="lbl-s" htmlFor="w_isc">Short-circuit current I<sub>sc</sub> (kA)</label>
            <input id="w_isc" type="number" step="0.1" placeholder="enter to check k²S² ≥ I²t" value={s.isc ?? ''} onChange={(e) => set({ isc: num(e.target.value) ?? null })} />
          </div>
          <div className="field">
            <label className="lbl-s" htmlFor="w_t">Disconnection time (s)</label>
            <input id="w_t" type="number" step="0.05" value={s.tsc} onChange={(e) => set({ tsc: num(e.target.value) ?? 0.2 })} />
          </div>
        </div>
        <p className="hint-s">Voltage-drop limit {R.maxVd}% (change it in the Hardware step) · {R.voltage} V · cos φ {R.pf}</p>
      </section>

      {/* results */}
      <section className="wiz-step">
        <h3><span className="num">✓</span>Cable selection</h3>
        <p className="mono small">I<sub>b</sub> {cable.Ib.toFixed(0)} A · k1 {res.k1.toFixed(2)} · k2 {res.k2.toFixed(2)} · k4 {res.k4.toFixed(2)} · {cable.method} · {cable.groupN} circuit{cable.groupN > 1 ? 's' : ''} in group</p>
        {res.error && <div className="warnbox bad">{res.error}</div>}
        {res.warnings.map((w, i) => <div key={i} className="warnbox">{w}</div>)}
        <div className="cands">
          {res.candidates.map((c) => {
            const on = res.chosen && c.n === res.chosen.n && c.mm2 === res.chosen.mm2
            return (
              <label key={c.n + '-' + c.mm2} className={'cand' + (on ? ' on' : '')}>
                <input type="radio" name="cand" checked={!!on} onChange={() => set({ choice: { n: c.n, mm2: c.mm2 } })} />
                <div className="grow">
                  <div><b>{c.name}</b> {c.recommended && <span className="tag ok">Cheapest</span>} {c.minimum && <span className="tag">Least conductor</span>}</div>
                  <div className="mono small muted">I<sub>z</sub> {c.Iz.toFixed(0)} A · k4 {c.k4.toFixed(2)} ({c.groupN} circ.) · ΔU {c.vd.toFixed(2)}%{c.sMin ? ` · S ≥ ${c.sMin.toFixed(0)} mm²` : ''}</div>
                </div>
                <div className="mono price">{eur(c.price)}</div>
              </label>
            )
          })}
        </div>
        <div className="row">
          <button className="btn" onClick={() => api.applyCableToAll(it.id)}>Use these settings for every cable</button>
        </div>
        <p className="hint-s">Ampacities and correction factors follow IEC 60364-5-52 Annex B; prices are indicative. Check national deviations before issuing a design.</p>
      </section>
    </div>
  )
}