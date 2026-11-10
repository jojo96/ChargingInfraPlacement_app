export const STEPS = ['Site', 'Parking', 'Hardware', 'Wiring', 'Report']

export default function TopBar({ project, A, ui, patchUi, onName, canUndo, canRedo, onUndo, onRedo }) {
  const done = [!!project.site, A.bays.length > 0, A.ch.length > 0 && A.tx.length > 0, A.cables.length > 0 && A.cables.every((c) => c.size?.chosen), false]
  return (
    <header className="top">
      <div className="brand">
        <svg viewBox="0 0 26 26" aria-hidden="true">
          <rect x="1" y="1" width="24" height="24" rx="6" fill="var(--accent)" />
          <path d="M14.5 4.5 8 14h4.5l-1 7.5L18 12h-4.5z" fill="var(--accent-ink)" />
        </svg>
        ChargeSite
      </div>
      <input id="projName" className="proj" type="text" aria-label="Project name" value={project.name} onChange={(e) => onName(e.target.value)} />
      <div className="row tools">
        <button className="btn icon" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
        <button className="btn icon" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">↷</button>
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={ui.view !== '3d'} onClick={() => patchUi({ view: '2d' })}>2D map</button>
          <button aria-pressed={ui.view === '3d'} onClick={() => patchUi({ view: '3d', arm: null, pickSite: false })}>3D view</button>
        </div>
      </div>
      <nav className="steps" aria-label="Workflow">
        {STEPS.map((t, i) => {
          const isDone = done[i] && ui.step !== i
          return (
            <button key={t} className={'step' + (isDone ? ' done' : '')} aria-current={ui.step === i} onClick={() => patchUi({ step: i, arm: null, pickSite: false })}>
              <span className="n">{isDone ? '✓' : i + 1}</span>
              <span className="t">{t}</span>
            </button>
          )
        })}
      </nav>
    </header>
  )
}