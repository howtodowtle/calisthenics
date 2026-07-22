import { useState } from 'preact/hooks'
import { isResultEditable } from '../core/derive'
import { editResult } from '../core/store'
import type { Result, Unit } from '../core/types'
import { actualsSummary, formatDate, maxHint, SessionBadges, stagger } from './format'

/** Past sessions, newest first — across all plans of the exercise. Sessions
 * finished within the last 24h stay editable (fat-finger fixes on the day);
 * everything older is a read-only fact. */
export function HistoryList({
  results,
  unit,
  today,
  predictedMax,
}: {
  results: Result[]
  unit: Unit
  today: string
  /** Predicted max per "planId:sessionIndex", for plans whose generator models one. */
  predictedMax?: ReadonlyMap<string, number>
}) {
  const [open, setOpen] = useState<string | null>(null)
  if (results.length === 0) return null
  const now = Date.now()
  const sorted = [...results].sort(
    (a, b) => b.date.localeCompare(a.date) || b.sessionIndex - a.sessionIndex,
  )

  return (
    <>
      <h2>History</h2>
      <div class="card" data-size="sm" style={{ paddingBlock: 4 }}>
        <section>
          {sorted.map((r, i) => {
            const pm = predictedMax?.get(`${r.planId}:${r.sessionIndex}`)
            if (open === r.id) {
              return <ResultEditor key={r.id} result={r} onClose={() => setOpen(null)} />
            }
            const editable = isResultEditable(r, now, today)
            const Row = editable ? 'button' : 'div'
            return (
              <Row
                key={r.id}
                class="session-row done"
                style={stagger(i)}
                {...(editable ? { onClick: () => setOpen(r.id) } : {})}
              >
                <span class="date">{formatDate(r.date, today)}</span>
                <span class="sets-line" style={{ flex: 1 }}>
                  {actualsSummary(r.sets, unit)}
                </span>
                <SessionBadges type={r.sessionType} />
                {pm != null && <span class="max-hint">{maxHint(pm, unit)}</span>}
                {editable && <span class="chev">›</span>}
              </Row>
            )
          })}
        </section>
      </div>
    </>
  )
}

/** Inline editor for a just-finished session: correct the actual counts only.
 * Targets, date and set count are facts of the day and can't change here. */
function ResultEditor({
  result,
  onClose,
}: {
  result: Result
  onClose: () => void
}) {
  const [values, setValues] = useState<number[]>(() => result.sets.map((s) => s.actual))
  const isTest = result.sessionType === 'test'

  const save = () => {
    editResult(result.id, values.map((v) => Math.max(0, v || 0)))
    onClose()
  }

  return (
    <div class="session-editor">
      <div class="dim" style={{ marginBottom: 6 }}>
        {formatDate(result.date, result.date)} · fix what you logged
      </div>
      <div class="set-grid" style={{ margin: '6px 0 10px' }}>
        {result.sets.map((s, i) => (
          <div class="set-chip" key={i}>
            <input
              class="input"
              type="number"
              min={0}
              inputMode="numeric"
              value={values[i]}
              onInput={(e) => {
                const next = [...values]
                next[i] = Number((e.target as HTMLInputElement).value)
                setValues(next)
              }}
            />
            <div class="lbl">{s.isMinimum ? 'min' : isTest ? 'max' : `set ${i + 1}`}</div>
          </div>
        ))}
      </div>
      <div class="row" style={{ justifyContent: 'flex-start' }}>
        <button class="btn" data-size="sm" onClick={save}>
          Save
        </button>
        <button class="btn" data-variant="ghost" data-size="sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
