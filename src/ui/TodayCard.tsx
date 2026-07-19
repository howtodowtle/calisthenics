import { useState } from 'preact/hooks'
import type { SessionView } from '../core/derive'
import { logSession } from '../core/store'
import type { Exercise, ResultSet } from '../core/types'
import { formatDate, SessionBadges, unitSuffix } from './format'

/**
 * One-tap logging: Done logs every set at target. Sets that need a real
 * number (max tests, minimum "all you've got" sets) open a small prompt
 * first; "Adjust" opens the prompt for every set.
 */
export function TodayCard({
  session,
  planId,
  exercise,
  today,
}: {
  session: SessionView
  planId: string
  exercise: Exercise
  today: string
}) {
  const [editing, setEditing] = useState<'none' | 'required' | 'all'>('none')
  const [values, setValues] = useState<number[]>(() => session.sets.map((s) => s.target))

  const sfx = unitSuffix(exercise.unit)
  const needsInput = (i: number) =>
    editing === 'all' || (editing === 'required' && (session.sets[i].isMinimum || session.type === 'test'))
  const hasRequired = session.type === 'test' || session.sets.some((s) => s.isMinimum)

  const save = (vals: number[]) => {
    const sets: ResultSet[] = session.sets.map((s, i) => ({
      target: s.target,
      isMinimum: s.isMinimum,
      actual: vals[i],
    }))
    logSession(planId, session.index, session.type, sets, today)
  }

  const onDone = () => {
    if (editing === 'none' && hasRequired) setEditing('required')
    else save(values)
  }

  const overdue = session.date < today

  return (
    <div class="card" data-size="sm">
      <section>
      <div class={overdue ? 'eyebrow overdue' : 'eyebrow'}>
        {overdue ? `Overdue · ${formatDate(session.date, today)}` : 'Today'}
      </div>
      <div class="row">
        <span class="today-title">
          Week {session.week} · Session {session.index}
        </span>
        <SessionBadges type={session.type} overridden={session.overridden} />
      </div>
      {session.type === 'test' ? (
        <p class="dim">Single set — as many as you can. Result recalibrates the rest of the plan.</p>
      ) : null}
      <div class="set-grid">
        {session.sets.map((s, i) => (
          <div class="set-chip" key={i}>
            {needsInput(i) ? (
              <input
                class="input"
                type="number"
                min={0}
                value={values[i]}
                onInput={(e) => {
                  const next = [...values]
                  next[i] = Number((e.target as HTMLInputElement).value)
                  setValues(next)
                }}
              />
            ) : (
              <div class="n">
                {s.target}
                {sfx}
                {s.isMinimum ? '+' : ''}
              </div>
            )}
            <div class="lbl">{s.isMinimum ? 'min' : `set ${i + 1}`}</div>
          </div>
        ))}
      </div>
      {editing !== 'none' && (
        <p class="dim">
          {session.type === 'test' ? 'How many did you get?' : 'Enter what you actually did.'}
        </p>
      )}
      <button class="btn block" onClick={onDone}>
        {editing === 'none' ? 'Done' : 'Save'}
      </button>
      {editing === 'none' && (
        <button
          class="btn block"
          data-variant="ghost"
          style={{ marginTop: 6 }}
          onClick={() => setEditing('all')}
        >
          Adjust {exercise.unit === 'seconds' ? 'times' : 'reps'}
        </button>
      )}
      </section>
    </div>
  )
}

export function RestCard({
  next,
  today,
  completedToday,
}: {
  next: SessionView | null
  today: string
  /** A session was already logged today — celebrate it instead of claiming "rest day". */
  completedToday?: boolean
}) {
  return (
    <div class="card rest-card" data-size="sm">
      <section>
        {next ? (
          <>
            <div class="big-emoji">{completedToday ? '💪' : '🌤'}</div>
            <strong>{completedToday ? 'Session done — nice work!' : 'Rest day'}</strong>
            <p class="dim">
              {completedToday && 'Recover well. '}
              Next: {formatDate(next.date, today)} — Week {next.week} · Session {next.index}
            </p>
          </>
        ) : (
          <>
            <div class="big-emoji">🎉</div>
            <strong>Plan complete</strong>
            <p class="dim">Start a new one in Settings.</p>
          </>
        )}
      </section>
    </div>
  )
}
