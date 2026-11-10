import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { defaultProject, CATALOG } from './lib/catalog.js'
import { analyse, snapPosition, isPowered } from './lib/analysis.js'
import { exampleItems, loadProject, saveProject, makeItem, duplicateOf, rowItems, withDefaults, BAY_ANGLES, bayAngle, withAngle, fetchBuildings } from './lib/project.js'
import { offset, dist } from './lib/geometry.js'
import TopBar from './components/TopBar.jsx'
import MapView from './components/MapView.jsx'
import Scene3D from './components/Scene3D.jsx'
import Inspector from './components/Inspector.jsx'
import { SiteStep, ParkingStep, HardwareStep, WiringStep, ReportStep } from './components/Steps.jsx'

const START = { lat: 51.2194, lng: 4.4025 }

const nearestHeavyBay = (c, bays) => (bays.length ? bays.reduce((b, x) => (dist(c, x) < dist(c, b) ? x : b)) : null)

function initialProject() {
  const saved = loadProject()
  if (saved) return saved
  // first visit: empty map. The example is under Report → Load example depot.
  return { ...defaultProject(), name: 'New site', site: null, view: { c: [START.lat, START.lng], z: 17 }, items: [] }
}

export default function App() {
  const [project, setProjectRaw] = useState(initialProject)
  const [ui, setUi] = useState({ step: 0, sel: null, arm: null, pickSite: false, base: 'sat', labels: true, vehicles: true, view: '2d' })
  const [seen3d, setSeen3d] = useState(false)
  const mapRef = useRef(null)
  const A = useMemo(() => analyse(project), [project])

  // ---- undo / redo: every change goes through commit(); rapid changes (drags, typing) merge into one step
  const cur = useRef(project)
  const hist = useRef({ past: [], future: [], last: 0, hold: false })
  const [, bump] = useState(0)
  const commit = useCallback((fn, silent = false) => {
    const prev = cur.current
    const next = typeof fn === 'function' ? fn(prev) : fn
    if (next === prev) return
    const h = hist.current, now = Date.now()
    if (!silent) {
      if (!h.hold && now - h.last > 400) { h.past.push(prev); if (h.past.length > 150) h.past.shift(); h.future = [] }
      h.last = now
    }
    cur.current = next
    setProjectRaw(next)
  }, [])
  const undo = useCallback(() => {
    const h = hist.current
    if (!h.past.length) return
    h.future.push(cur.current)
    cur.current = h.past.pop()
    h.last = 0
    setProjectRaw(cur.current)
    bump((n) => n + 1)
  }, [])
  const redo = useCallback(() => {
    const h = hist.current
    if (!h.future.length) return
    h.past.push(cur.current)
    cur.current = h.future.pop()
    h.last = 0
    setProjectRaw(cur.current)
    bump((n) => n + 1)
  }, [])

  useEffect(() => { saveProject(project) }, [project])
  useEffect(() => { if (ui.view === '3d') setSeen3d(true) }, [ui.view])

  const patchUi = useCallback((p) => setUi((u) => ({ ...u, ...p })), [])
  const patch = useCallback((p) => commit((pr) => ({ ...pr, ...p })), [commit])
  const setItems = useCallback((fn) => commit((pr) => ({ ...pr, items: fn(pr.items) })), [commit])

  const api = useMemo(() => ({
    patch,
    setRule: (k, v) => commit((p) => ({ ...p, rules: { ...p.rules, [k]: v } })),
    setPrice: (k, v) => commit((p) => ({ ...p, prices: { ...p.prices, [k]: v } })),
    setDefault: (k, v) => commit((p) => ({ ...p, defaults: { ...p.defaults, [k]: v } })),
    setCableDefault: (k, v) => commit((p) => ({ ...p, cable: { ...p.cable, [k]: v } })),
    applyCableToAll: (id) => {
      const src = cur.current.items.find((i) => i.id === id)?.cable || {}
      const { choice, Ib, groupN, ...rest } = src
      setItems((items) => items.map((i) => (isPowered(i) ? { ...i, cable: { ...rest } } : i)))
      commit((p) => ({ ...p, cable: { ...p.cable, ...rest } }))
    },
    updateItem: (id, ch) => setItems((items) => items.map((i) => (i.id === id ? { ...i, ...ch } : i))),
    addItem: (kind, type, lat, lng) => {
      const created = makeItem(cur.current.items, kind, type, lat, lng, { rot: kind === 'bay' ? cur.current.defaultRot || 0 : 0 })
      setItems((items) => [...items, created])
      patchUi({ sel: created.id })
    },
    addAtCentre: (kind, type) => {
      const c = mapRef.current.getCenter()
      const created = makeItem(cur.current.items, kind, type, c.lat, c.lng, { rot: kind === 'bay' ? cur.current.defaultRot || 0 : 0 })
      setItems((items) => [...items, created])
      patchUi({ sel: created.id })
    },
    removeItem: (id) => {
      setItems((items) => items.filter((i) => i.id !== id).map((i) => (i.feed === id || i.tx === id ? { ...i, feed: 'auto', tx: undefined } : i)))
      setUi((u) => (u.sel === id ? { ...u, sel: null } : u))
    },
    duplicate: (id) => {
      const src = cur.current.items.find((i) => i.id === id)
      if (!src) return
      const created = duplicateOf(cur.current.items, src)
      setItems((items) => [...items, created])
      patchUi({ sel: created.id })
    },
    addRow: (type, n, rot, angle = 90) => {
      const c = mapRef.current.getCenter()
      commit((p) => ({ ...p, items: rowItems(p.items, type, n, c, rot, angle), defaultRot: rot }))
    },
    snapCharger: (id) => {
      const c = cur.current.items.find((i) => i.id === id)
      const bay = A.placements[id]?.bay || nearestHeavyBay(c, A.heavy)
      if (c && bay) setItems((items) => items.map((i) => (i.id === id ? { ...i, ...snapPosition(i, bay, cur.current.rules) } : i)))
    },
    openWizard: (id) => patchUi({ step: 3, sel: id }),
    loadBuildings: async () => {
      const p = cur.current
      const c = p.site ? { lat: p.site[0], lng: p.site[1] } : mapRef.current.getCenter()
      const b = await fetchBuildings(c.lat, c.lng)
      commit((pr) => ({ ...pr, buildings: b }))
      return b.length
    },
    setSite: (lat, lng) => { patch({ site: [lat, lng] }); mapRef.current?.setView([lat, lng], 19) },
    loadExample: () => {
      const c = mapRef.current.getCenter()
      commit((p) => ({ ...p, site: [c.lat, c.lng], items: exampleItems(c, p.rules) }))
      patchUi({ sel: null })
    },
    clear: () => { setItems(() => []); patchUi({ sel: null }) },
    importProject: (p) => { commit(withDefaults(p)); patchUi({ sel: null }); setTimeout(() => mapRef.current?.fit(), 50) },
    goTo: (lat, lng, z = 19) => mapRef.current?.setView([lat, lng], z),
    focusItem: (id) => { const it = cur.current.items.find((i) => i.id === id); if (it) { if (ui.view !== '3d') mapRef.current?.panTo([it.lat, it.lng]); patchUi({ sel: id }) } },
  }), [commit, patch, setItems, patchUi, A, ui.view])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return }
      if (e.key === 'Escape') { patchUi({ arm: null, pickSite: false, sel: null }); return }
      const it = project.items.find((i) => i.id === ui.sel)
      if (!it) return
      if (e.key === 'Delete' || e.key === 'Backspace') api.removeItem(it.id)
      else if (e.key === 'r' || e.key === 'R') {
        if (it.kind === 'bay') {
          // cycle the parking angle 90 → 60 → 45 → 30 (Shift reverses)
          const i = BAY_ANGLES.indexOf(bayAngle(it)), n = BAY_ANGLES.length
          const next = BAY_ANGLES[((i < 0 ? n - 1 : i) + (e.shiftKey ? 1 : -1) + n) % n]
          api.updateItem(it.id, withAngle(it, next))
        } else api.updateItem(it.id, { rot: ((it.rot || 0) + (e.shiftKey ? -90 : 90) + 360) % 360 })
      }
      else if (e.key === 'd' || e.key === 'D') api.duplicate(it.id)
      else {
        const s = e.shiftKey ? 1 : 0.25
        const mv = { ArrowUp: [0, s], ArrowDown: [0, -s], ArrowLeft: [-s, 0], ArrowRight: [s, 0] }[e.key]
        if (mv) { e.preventDefault(); const [lat, lng] = offset(it.lat, it.lng, mv[0], mv[1]); api.updateItem(it.id, { lat, lng }) }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [project.items, ui.sel, api, patchUi, undo, redo])

  const stepProps = { project, A, ui, patchUi, api }
  const Step = [SiteStep, ParkingStep, HardwareStep, WiringStep, ReportStep][ui.step]
  const selected = project.items.find((i) => i.id === ui.sel)
  const is3d = ui.view === '3d'

  return (
    <>
      <TopBar project={project} A={A} ui={ui} patchUi={patchUi} onName={(name) => patch({ name })}
        canUndo={hist.current.past.length > 0} canRedo={hist.current.future.length > 0} onUndo={undo} onRedo={redo} />
      <div className="main">
        <aside className="side"><Step {...stepProps} /></aside>
        <div className="mapwrap">
          <div className="viewpane" hidden={is3d}>
            <MapView
              ref={mapRef}
              project={project}
              A={A}
              ui={ui}
              onSelect={(id) => patchUi({ sel: id })}
              onMove={(id, lat, lng) => api.updateItem(id, { lat, lng })}
              onDragStart={() => { hist.current.past.push(cur.current); hist.current.future = []; hist.current.hold = true }}
              onDragEnd={() => { hist.current.hold = false; hist.current.last = Date.now(); bump((n) => n + 1) }}
              onRoute={(id, wp) => api.updateItem(id, { wp })}
              onPlace={(lat, lng, keep) => { const [k, t] = ui.arm; api.addItem(k, t, lat, lng); if (!keep) patchUi({ arm: null }) }}
              onDrop={(k, t, lat, lng) => { api.addItem(k, t, lat, lng); patchUi({ arm: null }) }}
              onPickSite={(lat, lng) => { patch({ site: [lat, lng] }); patchUi({ pickSite: false }) }}
              onView={(c, z) => commit((p) => ({ ...p, view: { c, z } }), true)}
              onBase={(base) => patchUi({ base })}
              onLabels={() => patchUi({ labels: !ui.labels })}
              onVehicles={() => patchUi({ vehicles: !ui.vehicles })}
            />
            {(ui.arm || ui.pickSite) && (
              <div className="placing">
                <span>{ui.pickSite ? 'Click the map to pin the site' : `Click the map to place ${CATALOG[ui.arm[0]][ui.arm[1]].name} · Shift-click to keep placing`}</span>
                <button onClick={() => patchUi({ arm: null, pickSite: false })}>Esc</button>
              </div>
            )}
          </div>
          {seen3d && (
            <div className="viewpane" hidden={!is3d}>
              <Scene3D project={project} A={A} ui={ui} active={is3d}
                onSelect={(id) => patchUi({ sel: id })}
                onBase={(base) => patchUi({ base })}
                onVehicles={() => patchUi({ vehicles: !ui.vehicles })}
                onLoadBuildings={api.loadBuildings} />
            </div>
          )}
          {selected && <Inspector it={selected} A={A} project={project} api={api} onClose={() => patchUi({ sel: null })} />}
        </div>
      </div>
    </>
  )
}