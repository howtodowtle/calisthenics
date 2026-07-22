import { useState } from 'preact/hooks'
import { isResultEditable } from '../core/derive'
import { editResult } from '../core/store'
import type { Result, Unit } from '../core/types'
import { actualsSummary, formatDate, maxHint, SessionBadges, setLabel, stagger } from './format'
import { SetGridEditor } from './SetGridEditor'

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
                onClick={editable ? () => setOpen(r.id) : undefined}
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
function ResultEditor({ result, onClose }: { result: Result; onClose: () => void }) {
  const isTest = result.sessionType === 'test'
  return (
    <SetGridEditor
      header={`${formatDate(result.date, result.date)} · fix what you logged`}
      labels={result.sets.map((s, i) => setLabel(s, i, isTest))}
      initial={result.sets.map((s) => s.actual)}
      min={0}
      onSave={(values) => editResult(result.id, values)}
      onClose={onClose}
    />
  )
}
