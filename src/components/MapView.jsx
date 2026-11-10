import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import L from 'leaflet'
import { CATALOG, ICON_SVG, KIND_COLOR, VEHICLE, spec } from '../lib/catalog.js'
import { cornersLL, fromLocal, dist } from '../lib/geometry.js'
import { bayAngle } from '../lib/project.js'

const BASEMAPS = {
  sat: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Imagery © Esri, Maxar, Earthstar Geographics', 19],
  osm: ['https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap contributors', 19],
  light: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors', 16],
}

function hwIcon(it, sel, err) {
  const s = spec(it)
  const px = it.kind === 'tx' ? 30 : it.kind === 'conv' ? 28 : it.kind === 'grid' ? 26 : it.kind === 'disp' ? 20 : it.kind === 'node' ? 24 : s.kw >= 400 ? 28 : 24
  const radius = ['charger', 'node', 'disp'].includes(it.kind) ? '50%' : '7px'
  return L.divIcon({
    className: '', iconSize: [px, px], iconAnchor: [px / 2, px / 2],
    html: `<div class="hw${sel ? ' sel' : ''}${err ? ' err' : ''}" style="width:${px}px;height:${px}px;background:${KIND_COLOR[it.kind]};border-radius:${radius}">${ICON_SVG[it.kind]}</div>`,
  })
}

function styleFor(it, sel, err) {
  const s = spec(it)
  if (it.kind === 'bay') return { color: err ? '#ff5a5a' : sel ? '#5a93f0' : s.color, weight: sel ? 3 : 2, fillColor: s.color, fillOpacity: sel ? 0.32 : 0.16 }
  const c = KIND_COLOR[it.kind]
  return { color: err ? '#ff5a5a' : c, weight: 2, fillColor: c, fillOpacity: 0.45 }
}

const ll = (p) => ({ lat: p[0], lng: p[1] })
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const vtxIcon = (add) => L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div class="vtx${add ? ' add' : ''}"></div>` })
const segIcon = (t) => L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="seglbl">${t}</div>` })

const MapView = forwardRef(function MapView(props, ref) {
  const { project, A, ui } = props
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const groups = useRef({})
  const layers = useRef({})
  const siteMk = useRef(null)
  const dragRef = useRef(null)
  const latest = useRef(props)
  latest.current = props
  const [coord, setCoord] = useState('—')
  const [dropHl, setDropHl] = useState(false)

  useImperativeHandle(ref, () => ({
    getCenter: () => mapRef.current.getCenter(),
    setView: (c, z) => mapRef.current.setView(c, z),
    panTo: (c) => mapRef.current.panTo(c),
    fit: () => {
      const p = latest.current.project
      const pts = p.items.map((i) => [i.lat, i.lng])
      if (p.site) pts.push(p.site)
      if (pts.length) mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 20 })
    },
  }))

  // create map once
  useEffect(() => {
    const map = L.map(elRef.current, { maxZoom: 22, doubleClickZoom: false }).setView(project.view.c, project.view.z)
    mapRef.current = map
    const tiles = Object.fromEntries(Object.entries(BASEMAPS).map(([k, [url, attribution, mz]]) => [k, L.tileLayer(url, { maxNativeZoom: mz, maxZoom: 22, attribution })]))
    groups.current = {
      tiles,
      bld: L.layerGroup().addTo(map),
      veh: L.layerGroup().addTo(map),
      items: L.layerGroup().addTo(map),
      over: L.layerGroup().addTo(map),
      seg: L.layerGroup().addTo(map),
      edit: L.layerGroup().addTo(map),
    }
    tiles.sat.addTo(map)
    L.control.scale({ metric: true, imperial: false }).addTo(map)

    map.on('mousemove', (e) => {
      setCoord(`${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)} · z${map.getZoom()}`)
      const d = dragRef.current
      if (!d) return
      latest.current.onMove(d.id, d.orig.lat + (e.latlng.lat - d.start.lat), d.orig.lng + (e.latlng.lng - d.start.lng))
    })
    const endDrag = () => { if (dragRef.current) { dragRef.current = null; map.dragging.enable(); latest.current.onDragEnd?.() } }
    map.on('mouseup', endDrag)
    document.addEventListener('mouseup', endDrag)

    map.on('click', (e) => {
      const p = latest.current
      if (p.ui.arm) p.onPlace(e.latlng.lat, e.latlng.lng, e.originalEvent.shiftKey)
      else if (p.ui.pickSite) p.onPickSite(e.latlng.lat, e.latlng.lng)
      else if (p.ui.sel) p.onSelect(null)
    })
    map.on('moveend', () => { const c = map.getCenter(); latest.current.onView([c.lat, c.lng], map.getZoom()) })

    return () => {
      document.removeEventListener('mouseup', endDrag)
      map.remove()
      layers.current = {}
      siteMk.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // base layer
  useEffect(() => {
    const { tiles } = groups.current, map = mapRef.current
    for (const [k, t] of Object.entries(tiles)) { if (k === ui.base) t.addTo(map); else map.removeLayer(t) }
  }, [ui.base])

  // Leaflet needs a size refresh when it becomes visible again
  useEffect(() => { if (ui.view !== '3d') setTimeout(() => mapRef.current?.invalidateSize(), 30) }, [ui.view])

  // cursor
  useEffect(() => { mapRef.current.getContainer().style.cursor = ui.arm || ui.pickSite ? 'crosshair' : '' }, [ui.arm, ui.pickSite])

  // OSM buildings
  useEffect(() => {
    const g = groups.current.bld
    g.clearLayers()
    for (const b of project.buildings || []) L.polygon(b.pts, { color: '#7d8590', weight: 1, fillColor: '#aeb5bf', fillOpacity: 0.5, interactive: false }).addTo(g)
  }, [project.buildings])

  // sync items, overlays and the route editor
  useEffect(() => {
    const g = groups.current
    const startDrag = (id) => (e) => {
      const p = latest.current
      if (p.ui.arm) return
      L.DomEvent.stop(e)
      e.originalEvent?.preventDefault()
      const it = p.project.items.find((i) => i.id === id)
      if (!it) return
      if (p.ui.sel !== id) p.onSelect(id)
      dragRef.current = { id, start: e.latlng, orig: { lat: it.lat, lng: it.lng } }
      mapRef.current.dragging.disable()
      p.onDragStart?.()
    }
    const alive = new Set()
    for (const it of project.items) {
      alive.add(it.id)
      const sel = ui.sel === it.id, err = A.bad.has(it.id)
      let l = layers.current[it.id]
      if (!l || l.type !== it.type) {
        if (l) { g.items.removeLayer(l.poly); if (l.mk) g.items.removeLayer(l.mk) }
        l = layers.current[it.id] = { type: it.type }
        l.poly = L.polygon(cornersLL(it), styleFor(it, sel, err)).addTo(g.items)
        l.poly.on('mousedown', startDrag(it.id))
        l.poly.on('click', (e) => L.DomEvent.stop(e))
        if (it.kind !== 'bay') {
          l.mk = L.marker([it.lat, it.lng], { icon: hwIcon(it, sel, err), title: it.label }).addTo(g.items)
          l.mk.on('mousedown', startDrag(it.id))
          l.mk.on('click', (e) => L.DomEvent.stop(e))
        }
        l.key = ''
      }
      l.poly.setLatLngs(cornersLL(it))
      const s = spec(it)
      const text = it.kind === 'bay' && sel ? `${it.label} · ${s.w} × ${s.h} m · ${bayAngle(it)}°` : it.label
      const key = `${sel}|${err}|${text}|${ui.labels}`
      if (key !== l.key) {
        l.key = key
        l.poly.setStyle(styleFor(it, sel, err))
        if (l.poly.getTooltip()) l.poly.unbindTooltip()
        if (it.kind === 'bay' && (ui.labels || sel)) l.poly.bindTooltip(text, { permanent: true, direction: 'center', className: 'lbl' })
        if (l.mk) {
          l.mk.setIcon(hwIcon(it, sel, err))
          if (l.mk.getTooltip()) l.mk.unbindTooltip()
          if (ui.labels) l.mk.bindTooltip(it.label, { permanent: true, direction: 'right', offset: [14, 0], className: 'lbl' + (err ? ' bad' : '') })
        }
      }
      if (l.mk) l.mk.setLatLng([it.lat, it.lng])
      // permanent tooltips on polygons don't follow setLatLngs, so move the bay label with the bay
      const tip = l.poly.getTooltip()
      if (tip) tip.setLatLng([it.lat, it.lng])
    }
    for (const id of Object.keys(layers.current)) {
      if (!alive.has(id)) { const l = layers.current[id]; g.items.removeLayer(l.poly); if (l.mk) g.items.removeLayer(l.mk); delete layers.current[id] }
    }

    // vehicles parked on bays
    g.veh.clearLayers()
    if (ui.vehicles) for (const b of A.bays) {
      const vk = spec(b).vehicle, V = VEHICLE[vk]
      if (!V) continue
      const front = spec(b).h / 2 - 0.6, w = V.w / 2
      const rect = (v0, v1, style) => L.polygon([fromLocal(b, -w, v0), fromLocal(b, w, v0), fromLocal(b, w, v1), fromLocal(b, -w, v1)], { ...style, interactive: false }).addTo(g.veh)
      if (vk === 'truck') {
        rect(front - V.cab, front, { color: '#3d4650', weight: 1, fillColor: '#56616d', fillOpacity: 0.9 })
        rect(front - V.len, front - V.cab - 0.3, { color: '#8a939d', weight: 1, fillColor: '#e9edf1', fillOpacity: 0.9 })
      } else rect(front - V.len, front, { color: '#4a535d', weight: 1, fillColor: vk === 'car' ? '#c9d1da' : '#e9edf1', fillOpacity: 0.9 })
    }

    // overlays: cables, MV links, constraint violations, truck guides
    g.over.clearLayers()
    const lines = {}
    const selIsCable = A.cables.some((c) => c.id === ui.sel) || A.mv.some((m) => m.id === ui.sel)
    for (const c of A.cables) {
      const sel = c.id === ui.sel
      const ok = !!c.size?.chosen
      const color = !ok ? '#ff5a5a' : c.dc ? '#19c3b1' : c.mode === 'ug' ? '#e08a3c' : '#4c8dff'
      const ln = L.polyline(c.pts, { color, weight: sel ? 5 : 3.5, dashArray: c.mode === 'ug' && !sel ? '7 6' : null, opacity: selIsCable && !sel ? 0.45 : 0.95 }).addTo(g.over)
      ln.bindTooltip(`${c.from.label} → ${c.to.label} · ${c.dc ? 'DC' : 'AC'} · ${c.len.toFixed(1)} m · ${c.name}`, { sticky: true, className: 'lbl' })
      ln.on('click', (e) => { L.DomEvent.stop(e); latest.current.onSelect(c.id) })
      lines[c.id] = ln
    }
    for (const m of A.mv) {
      const sel = m.id === ui.sel
      const ln = L.polyline(m.pts, { color: '#a16bf0', weight: sel ? 5 : 4, opacity: 0.9 }).bindTooltip(`MV ${m.len.toFixed(1)} m`, { sticky: true, className: 'lbl' }).addTo(g.over)
      lines[m.id] = lines[m.id] || ln
      if (sel) lines[m.id] = ln
    }
    for (const v of A.lines) {
      L.polyline([[v.a.lat, v.a.lng], [v.b.lat, v.b.lng]], { color: '#ff5a5a', weight: 2, dashArray: '2 6' })
        .bindTooltip(`${v.g.toFixed(1)} m`, { permanent: ui.labels, direction: 'center', className: 'lbl bad' }).addTo(g.over)
    }
    const R = project.rules
    const showZone = ui.step === 2 || ui.step === 3
    for (const b of A.heavy) {
      const h = spec(b).h / 2
      const P = (u, v) => fromLocal(b, u, v)
      L.polyline([P(0, -h + 2), P(0, h - 2)], { color: '#ffffff', weight: 2, opacity: 0.85, interactive: false }).addTo(g.over)
      L.polyline([P(-0.9, h - 3.4), P(0, h - 2), P(0.9, h - 3.4)], { color: '#ffffff', weight: 2, opacity: 0.85, interactive: false }).addTo(g.over)
      if (showZone) {
        const uIn = -R.truckW / 2, uOut = uIn - R.mcsMaxGap
        const vA = h - R.mcsFrontMin, vB = h - R.mcsFrontMax
        L.polygon([P(uIn, vA), P(uOut, vA), P(uOut, vB), P(uIn, vB)], { color: '#2bd47d', weight: 1.5, dashArray: '4 3', fillColor: '#2bd47d', fillOpacity: 0.3, interactive: false }).addTo(g.over)
      }
    }

    // route editor for the selected cable: drag ● to move a bend, drag ○ to add one, double-click ● to remove
    g.edit.clearLayers()
    g.seg.clearLayers()
    const selCable = A.cables.find((c) => c.id === ui.sel) || A.mv.find((m) => m.id === ui.sel)
    if (selCable) {
      const owner = project.items.find((i) => i.id === selCable.id)
      const line = lines[selCable.id]
      const a = selCable.pts[0], z = selCable.pts[selCable.pts.length - 1]
      const wp = (owner.wp?.length ? owner.wp : selCable.pts.slice(1, -1)).map((p) => [...p])
      const full = () => [a, ...wp, z]
      const drawSegs = () => {
        g.seg.clearLayers()
        const pts = full()
        for (let i = 1; i < pts.length; i++) {
          const d = dist(ll(pts[i - 1]), ll(pts[i]))
          if (d > 0.5) L.marker(mid(pts[i - 1], pts[i]), { icon: segIcon(`${d.toFixed(2)} m`), interactive: false }).addTo(g.seg)
        }
      }
      const commit = () => latest.current.onRoute(selCable.id, wp.map((p) => [...p]))
      const live = () => { line?.setLatLngs(full()); drawSegs() }
      drawSegs()
      wp.forEach((p, i) => {
        const m = L.marker(p, { icon: vtxIcon(false), draggable: true, title: 'Drag to move · double-click to remove' }).addTo(g.edit)
        m.on('drag', (e) => { const q = e.target.getLatLng(); wp[i] = [q.lat, q.lng]; live() })
        m.on('dragend', commit)
        m.on('click', (e) => L.DomEvent.stop(e))
        m.on('dblclick contextmenu', (e) => { L.DomEvent.stop(e); wp.splice(i, 1); commit() })
      })
      const pts = full()
      for (let k = 1; k < pts.length; k++) {
        const m = L.marker(mid(pts[k - 1], pts[k]), { icon: vtxIcon(true), draggable: true, title: 'Drag to add a bend' }).addTo(g.edit)
        let idx = -1
        m.on('dragstart', () => { idx = k - 1; wp.splice(idx, 0, mid(pts[k - 1], pts[k])) })
        m.on('drag', (e) => { const q = e.target.getLatLng(); wp[idx] = [q.lat, q.lng]; live() })
        m.on('dragend', commit)
        m.on('click', (e) => L.DomEvent.stop(e))
      }
    }

    // site pin
    if (project.site) {
      if (!siteMk.current) siteMk.current = L.marker(project.site, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="sitepin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(mapRef.current)
      else siteMk.current.setLatLng(project.site)
    } else if (siteMk.current) { siteMk.current.remove(); siteMk.current = null }
  }, [project.items, project.site, project.rules, A, ui.sel, ui.labels, ui.step, ui.vehicles])

  // HTML5 drag & drop from the palette
  const onDragOver = (e) => { if (e.dataTransfer.types.includes('text/x-chargesite')) { e.preventDefault(); setDropHl(true) } }
  const onDrop = (e) => {
    setDropHl(false)
    const d = e.dataTransfer.getData('text/x-chargesite')
    if (!d) return
    e.preventDefault()
    const [k, t] = d.split(':')
    if (!CATALOG[k]?.[t]) return
    const p = mapRef.current.mouseEventToLatLng(e)
    props.onDrop(k, t, p.lat, p.lng)
  }

  return (
    <div className={'mapbox' + (dropHl ? ' drop-hl' : '')} onDragOver={onDragOver} onDragLeave={() => setDropHl(false)} onDrop={onDrop}>
      <div ref={elRef} className="map" />
      <div className="mapbar">
        <div className="seg" role="group" aria-label="Base map">
          {[['sat', 'Satellite'], ['osm', 'Streets'], ['light', 'Light']].map(([k, t]) => (
            <button key={k} aria-pressed={ui.base === k} onClick={() => props.onBase(k)}>{t}</button>
          ))}
        </div>
        <button className="btn" onClick={() => ref.current?.fit()}>Fit layout</button>
        <button className="btn" aria-pressed={ui.labels} onClick={props.onLabels}>{ui.labels ? 'Hide labels' : 'Show labels'}</button>
        <button className="btn" aria-pressed={ui.vehicles} onClick={props.onVehicles}>{ui.vehicles ? 'Hide vehicles' : 'Show vehicles'}</button>
      </div>
      {A.cables.some((c) => c.id === ui.sel) || A.mv.some((m) => m.id === ui.sel)
        ? <div className="maphint">Route editing: drag ● to move a bend · drag ○ to add one · double-click ● to remove</div>
        : null}
      <div className="status">{coord}</div>
    </div>
  )
})

export default MapView
