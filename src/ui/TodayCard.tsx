import { Check } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { countDone, fitProgress, type SessionView } from '../core/derive'
import { cancelEarlySession, logSet, startSessionEarly, undoSet } from '../core/store'
import type { Exercise } from '../core/types'
import { formatDate, SessionBadges, setLabel, unitSuffix } from './format'
import { TargetsEditor } from './TargetsEditor'

/**
 * Per-set logging, and only per-set: tap a set the moment you've done it — one
 * in the morning, two at lunch — and the card keeps score until the last one
 * completes the session. Tapping a checked set undoes it. Sets that need a real
 * number (max tests, minimum "all you've got" sets) ask for it on tap. There is
 * no bulk log; "Adjust reps" edits today's targets without logging anything.
 */
type Mode =
  | { kind: 'view' }
  /** One tapped set (min/test) waiting for its actual count. */
  | { kind: 'entry'; set: number; value: number }
  /** "Adjust reps": editing today's targets, not logging what was done. */
  | { kind: 'targets' }

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
  const [mode, setMode] = useState<Mode>({ kind: 'view' })

  const progress = fitProgress(session.progress ?? [], session.sets.length)
  const doneCount = countDone(progress)
  const isTest = session.type === 'test'

  const sfx = unitSuffix(exercise.unit)
  /** Sets whose actual can't be assumed: max tests and minimum sets. */
  const needsCount = (i: number) => isTest || session.sets[i].isMinimum

  const tapSet = (i: number) => {
    if (progress[i] != null) undoSet(planId, session.index, i)
    else if (needsCount(i)) setMode({ kind: 'entry', set: i, value: session.sets[i].target })
    else logSet(planId, session.index, i, undefined, today)
  }

  const logEntry = () => {
    if (mode.kind !== 'entry') return
    logSet(planId, session.index, mode.set, mode.value, today)
    setMode({ kind: 'view' })
  }

  const hint = (): string => {
    if (mode.kind === 'entry') {
      if (isTest) return 'How many did you get?'
      return `At least ${session.sets[mode.set].target}${sfx} — how many did you get?`
    }
    if (isTest) return 'Tap the set to enter your result.'
    if (doneCount === 0) return 'Tap each set as you do it.'
    return `${doneCount} of ${session.sets.length} sets done. Tap a set to undo.`
  }

  const overdue = session.date < today
  /** Pulled forward: being done today ahead of its scheduled date. */
  const early = session.scheduledDate > today

  return (
    <div class="card" data-size="sm">
      <section>
      <div class={overdue ? 'eyebrow overdue' : 'eyebrow'}>
        {overdue
          ? `Overdue · ${formatDate(session.date, today)}`
          : early
            ? `Early · ${formatDate(session.scheduledDate, today)}`
            : 'Today'}
      </div>
      <div class="row">
        <span class="today-title">
          Week {session.week} · Session {session.index}
        </span>
        <SessionBadges type={session.type} overridden={session.overridden} />
      </div>
      {isTest ? (
        <p class="dim">Single set — as many as you can. Result recalibrates the rest of the plan.</p>
      ) : null}
      {mode.kind === 'targets' ? (
        <TargetsEditor
          session={session}
          planId={planId}
          header="Adjust today's targets — nothing gets logged."
          onClose={() => setMode({ kind: 'view' })}
        />
      ) : (
        <>
          <div class="set-grid">
            {session.sets.map((s, i) => {
              const done = progress[i] != null
              const label = setLabel(s, i, isTest)
              return mode.kind === 'entry' && mode.set === i ? (
                <div class="set-chip" key={i}>
                  <input
                    class="input"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={mode.value}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && logEntry()}
                    onInput={(e) =>
                      setMode({ ...mode, value: Number((e.target as HTMLInputElement).value) })
                    }
                  />
                  <div class="lbl">{label}</div>
                </div>
              ) : (
                <button
                  key={i}
                  type="button"
                  class={done ? 'set-chip done' : 'set-chip'}
                  disabled={mode.kind !== 'view'}
                  aria-pressed={done}
                  onClick={() => tapSet(i)}
                >
                  <div class="n">
                    {done ? progress[i] : s.target}
                    {sfx}
                    {!done && s.isMinimum ? '+' : ''}
                  </div>
                  <div class="lbl">
                    {done && <Check size={11} strokeWidth={3} aria-hidden />}
                    {label}
                  </div>
                </button>
              )
            })}
          </div>
          <p class="dim set-hint">{hint()}</p>
          {mode.kind === 'entry' ? (
            <>
              <button class="btn block" onClick={logEntry}>
                Log set
              </button>
              <button
                class="btn block"
                data-variant="ghost"
                style={{ marginTop: 6 }}
                onClick={() => setMode({ kind: 'view' })}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Outline, not ghost: with the bulk-log button gone this is the
                * card's only button, and a ghost one reads as plain text. */}
              <button
                class="btn block"
                data-variant="outline"
                onClick={() => setMode({ kind: 'targets' })}
              >
                Adjust {exercise.unit === 'seconds' ? 'times' : 'reps'}
              </button>
              {early && doneCount === 0 && (
                <button
                  class="btn block"
                  data-variant="ghost"
                  style={{ marginTop: 6 }}
                  onClick={() => cancelEarlySession(planId, session.index)}
                >
                  Not today
                </button>
              )}
            </>
          )}
        </>
      )}
      </section>
    </div>
  )
}

export function RestCard({
  next,
  planId,
  today,
  completedToday,
}: {
  next: SessionView | null
  planId: string
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
            {/* Pulls `next` forward to today — early on a rest day, or a second
              * session after today's. Only that session moves (see store.ts). */}
            <button
              class="btn block"
              data-variant="ghost"
              onClick={() => startSessionEarly(planId, next.index, today)}
            >
              {completedToday ? 'Go again — do it today' : 'Do it today'}
            </button>
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
