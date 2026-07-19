import { useRef, useState } from 'preact/hooks'
import type { SessionView } from '../core/derive'
import { formatDate } from '../core/dates'
import type { Unit } from '../core/types'
import { unitSuffix } from './format'

/**
 * Progress chart: planned session volume as a line, completed volume as dots,
 * max tests as diamonds, and — when the generator models one — the predicted
 * max as a dotted line on its own right-hand scale. Tap/drag reveals a
 * crosshair + tooltip. Colors live in --viz-* tokens (validated for both
 * themes); text wears text tokens only.
 */

const W = 560
const H = 190
const PAD = { top: 12, right: 12, bottom: 24, left: 34 }
const PAD_RIGHT_AXIS = 34 // right padding when the predicted-max axis is shown

const volume = (sets: { target: number }[]) => sets.reduce((s, x) => s + x.target, 0)
const actualVolume = (sets: { actual: number }[]) => sets.reduce((s, x) => s + x.actual, 0)

function niceTicks(max: number): number[] {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => max / s <= 4) ?? 1000
  const ticks = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return ticks
}

export function Chart({ sessions, unit, today }: { sessions: SessionView[]; unit: Unit; today: string }) {
  const [picked, setPicked] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  if (sessions.length < 2) return null

  const planned = sessions.map((s) => volume(s.sets))
  const actuals = sessions.map((s) => (s.result ? actualVolume(s.result.sets) : null))
  const predicted = sessions.map((s) => s.predictedMax ?? null)
  const hasMax = predicted.some((v) => v !== null)
  const padRight = hasMax ? PAD_RIGHT_AXIS : PAD.right

  const maxY = Math.max(...planned, ...actuals.map((a) => a ?? 0)) * 1.08
  const ticks = niceTicks(maxY)
  const maxY2 = hasMax ? Math.max(...predicted.map((v) => v ?? 0)) * 1.08 : 1
  const ticks2 = hasMax ? niceTicks(maxY2).filter((t) => t > 0) : []

  const x = (i: number) => PAD.left + (i * (W - PAD.left - padRight)) / (sessions.length - 1)
  const y = (v: number) => H - PAD.bottom - (v / maxY) * (H - PAD.top - PAD.bottom)
  const y2 = (v: number) => H - PAD.bottom - (v / maxY2) * (H - PAD.top - PAD.bottom)

  const linePath = planned.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const maxPath = hasMax
    ? predicted
        .map((v, i) => (v === null ? '' : `${i === 0 || predicted[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(1)},${y2(v).toFixed(1)}`))
        .join(' ')
    : ''

  const weekTicks = sessions
    .map((s, i) => ({ week: s.week, i }))
    .filter(({ week, i }) => i === 0 || sessions[i - 1].week !== week)
    .filter(({ week }) => week % 3 === 1)

  const pick = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.left) / (W - PAD.left - padRight)) * (sessions.length - 1))
    setPicked(Math.max(0, Math.min(sessions.length - 1, i)))
  }

  const sel = picked !== null ? sessions[picked] : null
  const sfx = unitSuffix(unit)

  return (
    <div class="card" data-size="sm" style={{ position: 'relative' }}>
      <section>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => e.buttons > 0 && pick(e.clientX)}
        onPointerLeave={() => setPicked(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - padRight} y1={y(t)} y2={y(t)} class="viz-grid" />
            <text x={PAD.left - 6} y={y(t) + 3.5} class="viz-tick" text-anchor="end">
              {t}
            </text>
          </g>
        ))}
        {ticks2.map((t) => (
          <text key={`r${t}`} x={W - padRight + 6} y={y2(t) + 3.5} class="viz-tick" text-anchor="start">
            {t}
          </text>
        ))}
        {weekTicks.map(({ week, i }) => (
          <text key={week} x={x(i)} y={H - 8} class="viz-tick" text-anchor="middle">
            W{week}
          </text>
        ))}

        {picked !== null && (
          <line x1={x(picked)} x2={x(picked)} y1={PAD.top} y2={H - PAD.bottom} class="viz-crosshair" />
        )}

        {hasMax && <path d={maxPath} class="viz-maxline" />}
        <path d={linePath} class="viz-line" />

        {sessions.map((s, i) =>
          s.type === 'test' ? (
            <path
              key={`t${i}`}
              d={`M${x(i)},${y(planned[i]) - 6} l5.5,6 l-5.5,6 l-5.5,-6 z`}
              class="viz-diamond"
            />
          ) : null,
        )}

        {actuals.map((a, i) =>
          a !== null ? <circle key={`a${i}`} cx={x(i)} cy={y(a)} r={4.5} class="viz-dot" /> : null,
        )}
      </svg>

      <div class="viz-legend">
        <span>
          <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" class="viz-line" /></svg> Planned
        </span>
        <span>
          <svg width="10" height="10"><circle cx="5" cy="5" r="4" class="viz-dot" /></svg> Done
        </span>
        <span>
          <svg width="12" height="12"><path d="M6,1 l4.5,5 l-4.5,5 l-4.5,-5 z" class="viz-diamond" /></svg> Max test
        </span>
        {hasMax && (
          <span>
            <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" class="viz-maxline" /></svg> Predicted max (right)
          </span>
        )}
      </div>
      </section>

      {sel && (
        <div class="viz-tooltip" style={{ left: `${(x(sessions.indexOf(sel)) / W) * 100}%` }}>
          <strong>Session {sel.index}</strong> · {formatDate(sel.date, today)}
          <br />
          planned {planned[sessions.indexOf(sel)]}
          {sfx}
          {sel.result ? ` · done ${actualVolume(sel.result.sets)}${sfx}` : ''}
          {sel.predictedMax != null ? ` · max ~${sel.predictedMax}${sfx}` : ''}
        </div>
      )}
    </div>
  )
}
