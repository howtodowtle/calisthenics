import { useState } from 'preact/hooks'
import { isPending, type SessionView } from '../core/derive'
import type { Exercise } from '../core/types'
import { formatDate, maxHint, SessionBadges, setsSummary, stagger } from './format'
import { TargetsEditor } from './TargetsEditor'

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
  const upcoming = sessions.filter(isPending)
  const [open, setOpen] = useState<number | null>(null)

  if (upcoming.length === 0) return null

  return (
    <>
      <h2>Schedule</h2>
      <div class="card" data-size="sm" style={{ paddingBlock: 4 }}>
        <section>
          {upcoming.map((s, i) =>
            open === s.index ? (
              <TargetsEditor
                key={s.index}
                session={s}
                planId={planId}
                header={`Session ${s.index} · edit targets`}
                onClose={() => setOpen(null)}
              />
            ) : (
              <button
                key={s.index}
                class="session-row"
                style={stagger(i)}
                onClick={() => setOpen(s.index)}
              >
                <span class="date">{formatDate(s.date, today)}</span>
                <span class="sets-line">{setsSummary(s.sets, exercise.unit)}</span>
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
