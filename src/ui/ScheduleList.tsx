import { useState } from 'preact/hooks'
import type { SessionView } from '../core/derive'
import { formatDate } from '../core/dates'
import { clearOverride, setOverride } from '../core/store'
import type { Exercise } from '../core/types'
import { badgeVariant, setsSummary, TYPE_LABEL } from './format'

/**
 * Upcoming sessions. Tapping a row opens an inline editor; saving stores a
 * per-session override that survives recalibration and param changes.
 */
export function ScheduleList({
  sessions,
  planId,
  exercise,
  today,
}: {
  sessions: SessionView[]
  planId: string
  exercise: Exercise
  today: string
}) {
  const upcoming = sessions.filter((s) => s.status !== 'done')
  const [open, setOpen] = useState<number | null>(null)

  if (upcoming.length === 0) return null

  return (
    <>
      <h2>Schedule</h2>
      <div class="card" data-size="sm" style={{ paddingBlock: 4 }}>
        <section>
          {upcoming.map((s, i) =>
            open === s.index ? (
              <SessionEditor key={s.index} session={s} planId={planId} onClose={() => setOpen(null)} />
            ) : (
              <button
                key={s.index}
                class="session-row"
                style={{ '--i': `${Math.min(i, 10) * 25}ms` }}
                onClick={() => setOpen(s.index)}
              >
                <span class="date">{formatDate(s.date, today)}</span>
                <span class="sets-line" style={{ flex: 1 }}>
                  {setsSummary(s.sets, exercise.unit)}
                </span>
                {s.type !== 'normal' && (
                  <span class="badge" data-variant={badgeVariant(s.type)}>
                    {TYPE_LABEL[s.type]}
                  </span>
                )}
                {s.overridden && (
                  <span class="badge" data-variant="outline">
                    edited
                  </span>
                )}
                <span class="chev">›</span>
              </button>
            ),
          )}
        </section>
      </div>
    </>
  )
}

function SessionEditor({
  session,
  planId,
  onClose,
}: {
  session: SessionView
  planId: string
  onClose: () => void
}) {
  const [values, setValues] = useState<number[]>(() => session.sets.map((s) => s.target))

  const save = () => {
    setOverride(
      planId,
      session.index,
      session.sets.map((s, i) => ({ target: Math.max(1, values[i] || 1), isMinimum: s.isMinimum })),
    )
    onClose()
  }

  const revert = () => {
    clearOverride(planId, session.index)
    onClose()
  }

  return (
    <div class="session-editor">
      <div class="dim" style={{ marginBottom: 6 }}>
        Session {session.index} · edit targets
      </div>
      <div class="set-grid" style={{ margin: '6px 0 10px' }}>
        {session.sets.map((s, i) => (
          <div class="set-chip" key={i}>
            <input
              class="input"
              type="number"
              min={1}
              value={values[i]}
              onInput={(e) => {
                const next = [...values]
                next[i] = Number((e.target as HTMLInputElement).value)
                setValues(next)
              }}
            />
            <div class="lbl">{s.isMinimum ? 'min' : `set ${i + 1}`}</div>
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
        {session.overridden && (
          <button class="btn danger" data-variant="ghost" data-size="sm" onClick={revert}>
            Revert to plan
          </button>
        )}
      </div>
    </div>
  )
}
