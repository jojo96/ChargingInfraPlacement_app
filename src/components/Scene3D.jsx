import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { spec, VEHICLE } from '../lib/catalog.js'
import { MLAT, mLng } from '../lib/geometry.js'

const TILE_URL = {
  sat: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  osm: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  light: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
}
const lon2x = (lng, z) => ((lng + 180) / 360) * 2 ** z
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z }
const x2lon = (x, z) => (x / 2 ** z) * 360 - 180
const y2lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...o })
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  b.position.set(x, y, z)
  b.castShadow = true
  b.receiveShadow = true
  return b
}
function rod(a, b, r, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b)
  const len = A.distanceTo(B)
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m)
  c.position.copy(A).add(B).multiplyScalar(0.5)
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())
  return c
}
function letterTexture(ch) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.font = 'bold 104px Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(ch, 64, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
const CAR_COLORS = ['#c8ced6', '#2f3a48', '#b0332f', '#e8e8e8', '#36597a', '#6b7280']

export default function Scene3D({ project, A, ui, active, onSelect, onBase, onVehicles, onLoadBuildings }) {
  const host = useRef(null)
  const S = useRef(null)
  const [xray, setXray] = useState(true)
  const [bStatus, setBStatus] = useState('')
  const activeRef = useRef(active)
  activeRef.current = active

  const origin = useMemo(() => {
    if (project.site) return { lat: project.site[0], lng: project.site[1] }
    if (project.items.length) return { lat: project.items[0].lat, lng: project.items[0].lng }
    return { lat: project.view.c[0], lng: project.view.c[1] }
  }, [project.site, project.items.length > 0, project.view.c])
  const L = (lat, lng) => [(lng - origin.lng) * mLng(origin.lat), -(lat - origin.lat) * MLAT]

  // one-time renderer / scene / controls
  useEffect(() => {
    const el = host.current
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#dbe4ec')
    scene.fog = new THREE.Fog('#dbe4ec', 260, 800)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 4000)
    camera.position.set(60, 50, 60)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7c66, 0.95))
    const sun = new THREE.DirectionalLight(0xffffff, 1.5)
    sun.position.set(70, 130, 40)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 1, far: 400 })
    scene.add(sun)
    const groundG = new THREE.Group(), world = new THREE.Group(), bld = new THREE.Group()
    scene.add(groundG, world, bld)
    const pTex = letterTexture('P')

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    // click-to-select (ignore drags)
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
    let down = null
    const onDown = (e) => { down = [e.clientX, e.clientY] }
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
      const r = renderer.domElement.getBoundingClientRect()
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(world.children, true)[0]
      let o = hit?.object
      while (o && !o.userData.id) o = o.parent
      S.current.onSelect(o ? o.userData.id : null)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    let raf
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!activeRef.current) return
      controls.update()
      renderer.render(scene, camera)
    }
    loop()
    S.current = { renderer, scene, camera, controls, groundG, world, bld, pTex, fitted: false, groundKey: '', onSelect }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])
  if (S.current) S.current.onSelect = onSelect

  const clear = (g) => {
    for (const c of [...g.children]) {
      g.remove(c)
      c.traverse((o) => {
        o.geometry?.dispose()
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        for (const m of ms) { if (m.map && m.map !== S.current.pTex) m.map.dispose(); m.dispose() }
      })
    }
  }

  // extents of the layout in local metres
  const extent = () => {
    const pts = project.items.map((i) => L(i.lat, i.lng))
    if (!pts.length) pts.push([0, 0])
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1])
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2
    const r = Math.max(30, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 + 12
    return { cx, cz, r }
  }

  // ground: map tiles stitched into one texture
  useEffect(() => {
    const st = S.current
    const { cx, cz, r } = extent()
    const half = Math.max(90, r + 60)
    const key = `${ui.base}|${origin.lat.toFixed(6)}|${origin.lng.toFixed(6)}|${Math.round(cx / 20)}|${Math.round(cz / 20)}|${Math.round(half / 20)}`
    if (key === st.groundKey) return
    st.groundKey = key
    clear(st.groundG)
    const north = origin.lat + (-cz + half) / MLAT, south = origin.lat + (-cz - half) / MLAT
    const west = origin.lng + (cx - half) / mLng(origin.lat), east = origin.lng + (cx + half) / mLng(origin.lat)
    let z = ui.base === 'light' ? 16 : 19, x0, x1, y0, y1 // Esri light gray canvas stops at zoom 16
    for (; z > 12; z--) {
      x0 = Math.floor(lon2x(west, z)); x1 = Math.floor(lon2x(east, z)); y0 = Math.floor(lat2y(north, z)); y1 = Math.floor(lat2y(south, z))
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 64) break
    }
    const nx = x1 - x0 + 1, ny = y1 - y0 + 1
    const canvas = document.createElement('canvas')
    canvas.width = nx * 256
    canvas.height = ny * 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#c9c4b8'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, (tx - x0) * 256, (ty - y0) * 256); tex.needsUpdate = true }
      img.src = TILE_URL[ui.base] ? TILE_URL[ui.base](z, tx, ty) : TILE_URL.sat(z, tx, ty)
    }
    const [gx0, gz0] = L(y2lat(y0, z), x2lon(x0, z))
    const [gx1, gz1] = L(y2lat(y1 + 1, z), x2lon(x1 + 1, z))
    const w = gx1 - gx0, d = gz1 - gz0
    const geo = new THREE.PlaneGeometry(w, d)
    geo.rotateX(-Math.PI / 2)
    const ground = new THREE.Mesh(geo, mat('#ffffff', { map: tex, roughness: 1, metalness: 0, transparent: true }))
    ground.position.set(gx0 + w / 2, 0, gz0 + d / 2)
    ground.receiveShadow = true
    ground.name = 'ground'
    const soil = box(w, 2.4, d, mat('#6b5034', { transparent: true, opacity: 0.22, depthWrite: false }), gx0 + w / 2, -1.22, gz0 + d / 2)
    soil.castShadow = soil.receiveShadow = false
    soil.name = 'soil'
    st.groundG.add(ground, soil)
    st.setXray?.()
  }, [ui.base, origin, project.items])

  // see-through ground
  useEffect(() => {
    const st = S.current
    st.setXray = () => {
      const g = st.groundG.getObjectByName('ground'), s = st.groundG.getObjectByName('soil')
      if (g) { g.material.opacity = xray ? 0.42 : 1; g.material.depthWrite = !xray; g.material.needsUpdate = true }
      if (s) s.visible = xray
      st.controls.maxPolarAngle = xray ? Math.PI * 0.62 : Math.PI * 0.49
    }
    st.setXray()
  }, [xray])

  // buildings
  useEffect(() => {
    const st = S.current
    clear(st.bld)
    const m = mat('#e7dfcf', { roughness: 0.95 })
    for (const b of project.buildings || []) {
      const shape = new THREE.Shape(b.pts.map(([lat, lng]) => { const [x, z] = L(lat, lng); return new THREE.Vector2(x, -z) }))
      const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      const mesh = new THREE.Mesh(geo, m.clone())
      mesh.castShadow = mesh.receiveShadow = true
      st.bld.add(mesh)
    }
  }, [project.buildings, origin])

  // layout: bays, vehicles, equipment, cables
  useEffect(() => {
    const st = S.current
    clear(st.world)
    const selId = ui.sel
    const place = (it, g) => {
      const [x, z] = L(it.lat, it.lng)
      g.position.set(x, 0, z)
      g.rotation.y = (-(it.rot || 0) * Math.PI) / 180
      g.userData.id = it.id
      st.world.add(g)
      return g
    }
    const ring = (g, s) => {
      const r = Math.max(s.w, s.h) / 2 + 0.7
      const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.3, 40), new THREE.MeshBasicMaterial({ color: '#3b82f6', side: THREE.DoubleSide }))
      m.rotation.x = -Math.PI / 2
      m.position.y = 0.06
      g.add(m)
    }

    for (const it of project.items) {
      const s = spec(it), g = new THREE.Group(), sel = it.id === selId, bad = A.bad.has(it.id)
      if (it.kind === 'bay') {
        const geo = new THREE.PlaneGeometry(s.w, s.h)
        geo.rotateX(-Math.PI / 2)
        const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#3d8fe0', transparent: true, opacity: sel ? 0.6 : 0.42, depthWrite: false }))
        fill.position.y = 0.04
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: bad ? '#ff5a5a' : sel ? '#ffd23f' : '#e9f3ff' }))
        edge.position.y = 0.05
        const pg = new THREE.PlaneGeometry(1.8, 1.8)
        pg.rotateX(-Math.PI / 2)
        const p = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: st.pTex, transparent: true, depthWrite: false }))
        p.position.set(0, 0.06, s.h / 2 - 1.4)
        p.rotation.y = Math.PI
        g.add(fill, edge, p)
        // vehicle
        const vk = s.vehicle, V = VEHICLE[vk]
        if (ui.vehicles && V) {
          const front = s.h / 2 - 0.6 // local v; scene z = -v
          const wheel = mat('#1f2328')
          const wheels = (vs, half) => vs.forEach((v) => [-half, half].forEach((u) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.35, 16), wheel); w.rotation.z = Math.PI / 2; w.position.set(u, 0.48, -v); w.castShadow = true; g.add(w) }))
          if (vk === 'truck') {
            g.add(box(2.5, 3.0, 2.4, mat('#d6dbe1'), 0, 1.95, -(front - 1.2)))
            g.add(box(2.3, 0.95, 0.05, mat('#26313c', { roughness: 0.3 }), 0, 2.75, -(front + 0.01)))
            g.add(box(2.55, 2.9, 13.6, mat('#f3f5f7'), 0, 2.6, -(front - 2.7 - 6.8)))
            wheels([front - 0.8, front - 2.0, front - 13.8, front - 15.1], 1.05)
          } else if (vk === 'bus') {
            g.add(box(2.55, 2.9, 12, mat('#eef2f5'), 0, 1.85, -(front - 6)))
            g.add(box(2.58, 0.9, 10.4, mat('#2a3540', { roughness: 0.3 }), 0, 2.3, -(front - 6.3)))
            wheels([front - 2.6, front - 9.5], 1.05)
          } else if (vk === 'van') {
            g.add(box(2.0, 2.3, 6, mat('#f1f3f5'), 0, 1.5, -(front - 3)))
            wheels([front - 1.0, front - 4.8], 0.85)
          } else {
            const col = CAR_COLORS[[...it.id].reduce((a, c) => a + c.charCodeAt(0), 0) % CAR_COLORS.length]
            g.add(box(1.8, 0.75, 4.5, mat(col, { metalness: 0.3, roughness: 0.5 }), 0, 0.65, -(front - 2.25)))
            g.add(box(1.6, 0.6, 2.4, mat('#34404c', { roughness: 0.25 }), 0, 1.3, -(front - 2.45)))
          }
        }
      } else if (it.kind === 'disp') {
        // dispenser post with screen and status light
        const H = s.height || 2.0
        g.add(box(s.w + 0.5, 0.15, s.h + 0.5, mat('#cfcfca'), 0, 0.075, 0))
        g.add(box(s.w, H, s.h, mat(bad ? '#7a2e2e' : '#f2f4f6', { metalness: 0.1 }), 0, 0.15 + H / 2, 0))
        g.add(box(s.w + 0.02, 0.08, s.h + 0.02, mat('#21d07a', { emissive: '#21d07a', emissiveIntensity: 0.9 }), 0, 0.15 + H - 0.25, 0))
        g.add(box(s.w * 0.6, 0.4, 0.03, mat('#8fd3ff', { emissive: '#1d6fa5', emissiveIntensity: 0.5 }), 0, 0.15 + H * 0.68, s.h / 2 + 0.01))
        g.add(box(s.w * 0.6, 0.4, 0.03, mat('#8fd3ff', { emissive: '#1d6fa5', emissiveIntensity: 0.5 }), 0, 0.15 + H * 0.68, -s.h / 2 - 0.01))
      } else if (it.kind === 'charger') {
        // DC charger power unit: dark cabinet
        const H = s.height || 2.1
        g.add(box(s.w + 0.4, 0.15, s.h + 0.4, mat('#cfcfca'), 0, 0.075, 0))
        g.add(box(s.w, H, s.h, mat(bad ? '#7a2e2e' : '#2f363e', { metalness: 0.2 }), 0, 0.15 + H / 2, 0))
        g.add(box(s.w + 0.02, 0.07, s.h + 0.02, mat('#21d07a', { emissive: '#21d07a', emissiveIntensity: 0.8 }), 0, 0.15 + H - 0.3, 0))
        g.add(box(s.w * 0.7, H * 0.35, 0.03, mat('#1e242b'), 0, 0.15 + H * 0.3, s.h / 2 + 0.01))
      } else if (it.kind === 'conv') {
        // AC/DC converter: large cabinet with ventilation doors
        const H = s.height || 2.3
        g.add(box(s.w + 0.4, 0.2, s.h + 0.4, mat('#bfc4c8'), 0, 0.1, 0))
        g.add(box(s.w, H, s.h, mat(bad ? '#7a2e2e' : '#3b7c8c', { metalness: 0.15 }), 0, 0.2 + H / 2, 0))
        const nDoor = Math.max(2, Math.round(s.w / 1.1))
        for (let i = 0; i < nDoor; i++) {
          const x = -s.w / 2 + (i + 0.5) * (s.w / nDoor)
          g.add(box((s.w / nDoor) * 0.82, H * 0.8, 0.04, mat('#2c6270'), x, 0.2 + H * 0.5, s.h / 2 + 0.02))
        }
      } else if (it.kind === 'node') {
        const H = s.height || 1.2
        g.add(box(s.w, H, s.h, mat('#5b8fd6'), 0, H / 2, 0))
        g.add(box(s.w * 0.8, H * 0.75, 0.03, mat('#3e6fb3'), 0, H * 0.5, s.h / 2 + 0.01))
      } else if (it.kind === 'tx') {
        g.add(box(s.w, 2.4, s.h, mat('#cdd2d6'), 0, 1.2, 0))
        g.add(box(s.w + 0.3, 0.16, s.h + 0.3, mat('#8e979f'), 0, 2.48, 0))
        for (const x of [-s.w / 4, s.w / 4]) {
          g.add(box(s.w * 0.36, 1.9, 0.04, mat('#9aa3ab'), x, 1.05, s.h / 2 + 0.02))
          g.add(box(0.32, 0.28, 0.02, mat('#f2c230', { emissive: '#6b5300' }), x, 1.65, s.h / 2 + 0.05))
        }
      } else if (it.kind === 'grid') {
        g.add(box(1.2, 1.7, 1.2, mat('#8d86a6'), 0, 0.85, 0))
      }
      if (sel && it.kind !== 'bay') ring(g, s)
      place(it, g)
    }

    // cables (underground ones sit in a trench 0.8 m deep)
    const cab = (pts, mode, color, id, runs, r = 0.09) => {
      const y = mode === 'ug' ? -0.8 : 0.35
      const P = pts.map(([lat, lng]) => { const [x, z] = L(lat, lng); return [x, y, z] })
      const m = mat(color, { emissive: color, emissiveIntensity: 0.25 })
      const g = new THREE.Group()
      g.userData.id = id
      for (let i = 1; i < P.length; i++) {
        if (Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]) < 0.05) continue
        g.add(rod(P[i - 1], P[i], r, m))
        if (mode === 'ug' && xray) {
          const a = new THREE.Vector3(...P[i - 1]), b = new THREE.Vector3(...P[i])
          const len = a.distanceTo(b)
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.5 + 0.05 * Math.min(runs, 10), 1.0, len + 0.5), mat('#d8b98a', { transparent: true, opacity: 0.35, depthWrite: false }))
          t.position.copy(a).add(b).multiplyScalar(0.5)
          t.position.y = -0.5
          t.lookAt(b.x, -0.5, b.z)
          g.add(t)
        }
      }
      if (mode === 'ug') for (const p of [P[0], P[P.length - 1]]) g.add(rod([p[0], -0.8, p[2]], [p[0], 0.1, p[2]], r, m))
      st.world.add(g)
    }
    for (const c of A.cables) cab(c.pts, c.mode, c.id === selId ? '#ffd23f' : !c.size?.chosen ? '#ff4d4d' : c.dc ? '#19c3b1' : c.mode === 'ug' ? '#ff8a3d' : '#4c8dff', c.id, c.runs)
    for (const m of A.mv) cab(m.pts, 'ug', m.id === selId ? '#ffd23f' : '#a16bf0', m.id, 1, 0.11)

    if (!st.fitted && project.items.length) { st.fitted = true; preset('iso') }
  }, [project.items, A, ui.sel, ui.vehicles, xray, origin])

  const preset = (k) => {
    const st = S.current
    const { cx, cz, r } = extent()
    const c = new THREE.Vector3(cx, 0, cz)
    const pos = { iso: [r * 1.15, r * 0.95, r * 1.15], top: [0.01, r * 2.6, 0.01], street: [r * 0.95, 2.2, r * 0.75], under: [r * 0.7, -0.6, r * 0.9] }[k]
    if (k === 'under') setXray(true)
    st.camera.position.set(cx + pos[0], pos[1], cz + pos[2])
    st.controls.target.copy(c)
    st.controls.update()
  }

  const loadBuildings = async () => {
    setBStatus('Loading…')
    try { const n = await onLoadBuildings(); setBStatus(`${n} buildings`) } catch (e) { setBStatus('Could not reach OpenStreetMap') }
  }

  return (
    <div className="scene3d">
      <div ref={host} className="scene3d-canvas" />
      <div className="mapbar">
        <div className="seg" role="group" aria-label="Camera">
          {[['iso', 'Isometric'], ['top', 'Top'], ['street', 'Street level'], ['under', 'Underground']].map(([k, t]) => (
            <button key={k} onClick={() => preset(k)}>{t}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Ground map">
          {[['sat', 'Satellite'], ['osm', 'Streets'], ['light', 'Light']].map(([k, t]) => (
            <button key={k} aria-pressed={ui.base === k} onClick={() => onBase(k)}>{t}</button>
          ))}
        </div>
        <button className="btn" aria-pressed={xray} onClick={() => setXray(!xray)}>{xray ? 'Solid ground' : 'See-through ground'}</button>
        <button className="btn" aria-pressed={ui.vehicles} onClick={onVehicles}>{ui.vehicles ? 'Hide vehicles' : 'Show vehicles'}</button>
        <button className="btn" onClick={loadBuildings}>{project.buildings?.length ? 'Reload buildings' : 'Load OSM buildings'}</button>
        {bStatus && <span className="chip">{bStatus}</span>}
      </div>
      <div className="status">Drag to orbit · right-drag to pan · scroll to zoom · click to select</div>
    </div>
  )
}
