import {
  countSessions,
  deriveOverview,
  OVERVIEW_DAYS,
  type OverviewDay,
  progressNote,
} from '../core/overview'
import { db } from '../core/store'
import { formatDate, SessionBadges, setsSummary, stagger } from './format'

/**
 * The week at a glance: every exercise's upcoming sessions, grouped by day.
 *
 * Read-only by design — logging lives on the exercise's Today card, and one
 * owner for that interaction is worth more than a second place to tap sets.
 * Rows are shortcuts: tapping one opens that exercise.
 *
 * Rest days are omitted rather than listed: on a 2-3 sessions/week plan the
 * empty rows would outnumber the real ones. `deriveOverview` still returns
 * them, so showing them is a one-line change here.
 */
export function Overview({
  today,
  onSelectExercise,
  onOpenSettings,
}: {
  today: string
  onSelectExercise: (exerciseId: string) => void
  onOpenSettings: () => void
}) {
  const data = db.value
  const days = deriveOverview(data, today, OVERVIEW_DAYS)
  const scheduled = days.filter((d) => d.entries.length > 0)
  const total = countSessions(days)
  const hasActivePlan = data.plans.some((p) => p.status === 'active')

  return (
    <>
      <h1>
        Overview
        <small>
          {total > 0
            ? `${total} session${total === 1 ? '' : 's'} in the next ${OVERVIEW_DAYS} days`
            : `Next ${OVERVIEW_DAYS} days`}
        </small>
      </h1>

      {!hasActivePlan ? (
        <div class="card empty" data-size="sm">
          <section>
            <div class="big-emoji">🗓</div>
            <strong>No active plans</strong>
            <p class="dim">Set a goal for an exercise and its sessions show up here.</p>
            <button class="btn block" onClick={onOpenSettings}>
              Create a plan
            </button>
          </section>
        </div>
      ) : scheduled.length === 0 ? (
        <div class="card rest-card" data-size="sm">
          <section>
            <div class="big-emoji">🌤</div>
            <strong>Nothing scheduled</strong>
            <p class="dim">
              No sessions in the next {OVERVIEW_DAYS} days — a plan has either finished or
              hasn't started yet.
            </p>
          </section>
        </div>
      ) : (
        <>
          <div class="card" data-size="sm">
            <section>
              {scheduled.map((day, i) => (
                <DayGroup
                  key={day.date}
                  day={day}
                  today={today}
                  // Rows cascade in across the whole list, not per day.
                  from={countSessions(scheduled.slice(0, i))}
                  onSelectExercise={onSelectExercise}
                />
              ))}
            </section>
          </div>
          <p class="dim overview-note">
            Everything after today assumes you stay on plan — skip a session and the rest
            shifts forward.
          </p>
        </>
      )}
    </>
  )
}

function DayGroup({
  day,
  today,
  from,
  onSelectExercise,
}: {
  day: OverviewDay
  today: string
  /** Running row count before this day, so the entry animation stays in order. */
  from: number
  onSelectExercise: (exerciseId: string) => void
}) {
  const label = formatDate(day.date, today)
  const isToday = day.date === today

  return (
    <div class="overview-day" role="group" aria-label={label}>
      <div class={isToday ? 'eyebrow is-today' : 'eyebrow'}>{label}</div>
      {day.entries.map(({ exercise, session }, i) => {
        const partial = progressNote(session)
        return (
          <button
            key={exercise.id}
            class="session-row"
            style={stagger(from + i)}
            onClick={() => onSelectExercise(exercise.id)}
          >
            <span class="who">
              <span class="who-emoji" aria-hidden>
                {exercise.emoji}
              </span>
              <span class="who-name">{exercise.name}</span>
            </span>
            <span class="sets-line" style={{ flex: 1 }}>
              {setsSummary(session.sets, exercise.unit)}
            </span>
            <SessionBadges type={session.type} overridden={session.overridden} />
            {partial && (
              <span class="note">
                {partial.done}/{partial.total} done
              </span>
            )}
            <span class="chev" aria-hidden>
              ›
            </span>
          </button>
        )
      })}
    </div>
  )
}
