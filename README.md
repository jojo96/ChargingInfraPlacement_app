# ChargeSite Planner — Charging Infrastructure Placement App

React + Vite web app for laying out EV / e-truck charging sites on a real satellite map.

## Workflow
1. **Site** – search an address, paste `lat, lng`, use your location or click the map.
2. **Parking** – drag car / van / bus / truck bays (real metre sizes) onto the map; move, rotate, add rows.
3. **Hardware (in sequence)** – DC chargers → transformer → grid connection, with editable distance constraints
   (transformer clearance, charger reach, spacing, max cable length, voltage drop, simultaneity).
4. **Wiring** – auto-routed LV cables (nearest or assigned transformer), underground / overground, L-route or straight,
   with indicative cable sizing and voltage drop.
5. **Report** – checks, bill of materials, indicative CAPEX, export/import project JSON, BOM CSV.

## Run it
Requires Node.js 18+.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Code layout
```
src/
  lib/catalog.js     equipment catalogue (sizes, kW/kVA, prices) and project defaults
  lib/geometry.js    metre-based footprint geometry and clearance distances
  lib/analysis.js    cable assignment/sizing, transformer loading, constraint checks
  lib/project.js     BOM/costing, labels, example layout, local storage, file export
  components/        TopBar, MapView (Leaflet), Steps (5 workflow panels), Inspector
```
The `lib/` modules have no React dependency, so they can be moved to a FastAPI/Node backend later.

## Notes
- Map tiles: Esri World Imagery (satellite) and OpenStreetMap. Address search: OpenStreetMap Nominatim.
- Cable sizes, clearances and prices are indicative placeholders, not a substitute for an IEC 60364 design.
- Projects auto-save in the browser (localStorage).

## Keyboard
`R` rotate 15° (Shift+R back) · `D` duplicate · arrows nudge 0.25 m (Shift = 1 m) · `Delete` remove · `Esc` cancel
