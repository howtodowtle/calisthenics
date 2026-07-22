import { useState } from 'preact/hooks'
import type { SessionView } from '../core/derive'
import { clearOverride, setOverride } from '../core/store'
import type { Exercise } from '../core/types'
import { formatDate, maxHint, SessionBadges, setLabel, setsSummary, stagger } from './format'
import { SetGridEditor } from './SetGridEditor'

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
                style={stagger(i)}
                onClick={() => setOpen(s.index)}
              >
                <span class="date">{formatDate(s.date, today)}</span>
                <span class="sets-line" style={{ flex: 1 }}>
                  {setsSummary(s.sets, exercise.unit)}
                </span>
                <SessionBadges type={s.type} overridden={s.overridden} />
                {s.predictedMax != null && (
                  <span class="max-hint">{maxHint(s.predictedMax, exercise.unit)}</span>
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
  return (
    <SetGridEditor
      header={`Session ${session.index} · edit targets`}
      labels={session.sets.map((s, i) => setLabel(s, i, false))}
      initial={session.sets.map((s) => s.target)}
      min={1}
      onSave={(values) =>
        setOverride(
          planId,
          session.index,
          session.sets.map((s, i) => ({ target: values[i], isMinimum: s.isMinimum })),
        )
      }
      onClose={onClose}
      extra={
        session.overridden ? (
          <button
            class="btn danger"
            data-variant="ghost"
            data-size="sm"
            onClick={() => {
              clearOverride(planId, session.index)
              onClose()
            }}
          >
            Revert to plan
          </button>
        ) : undefined
      }
    />
  )
}
