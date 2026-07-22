import { Check } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { fitProgress, type SessionView } from '../core/derive'
import { completeSession, logSet, setOverride, undoSet } from '../core/store'
import type { Exercise } from '../core/types'
import { formatDate, SessionBadges, setLabel, unitSuffix } from './format'

/**
 * Per-set logging: tap a set the moment you've done it — one in the morning,
 * two at lunch — and the card keeps score until the last one completes the
 * session. Tapping a checked set undoes it. Sets that need a real number
 * (max tests, minimum "all you've got" sets) ask for it on tap. The button
 * below logs everything remaining in one go; "Adjust" opens every set for
 * exact numbers.
 */
type Mode =
  | { kind: 'view' }
  /** One tapped set (min/test) waiting for its actual count. */
  | { kind: 'entry'; set: number }
  /** Bulk inputs: the remaining sets that need a number, or all sets. */
  | { kind: 'edit'; scope: 'required' | 'all' }

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
  // Only read in entry/edit modes; enter() seeds it on every transition.
  const [values, setValues] = useState<number[]>([])

  const progress = fitProgress(session.progress ?? [], session.sets.length)
  const doneCount = progress.filter((a) => a != null).length
  const remaining = session.sets.length - doneCount
  const isTest = session.type === 'test'
  /** "Adjust reps": editing today's targets, not logging what was done. */
  const editingTargets = mode.kind === 'edit' && mode.scope === 'all'

  const sfx = unitSuffix(exercise.unit)
  /** Sets whose actual can't be assumed: max tests and minimum sets. */
  const needsCount = (i: number) => isTest || session.sets[i].isMinimum
  /** Not done yet and needs a real number before the session can complete. */
  const needsEntry = (i: number) => progress[i] == null && needsCount(i)
  const showsInput = (i: number) =>
    (mode.kind === 'entry' && mode.set === i) ||
    (mode.kind === 'edit' && (mode.scope === 'all' || needsEntry(i)))

  /** Mode transitions seed the inputs. "Adjust reps" (edit-all) edits the
   * planned targets, so it seeds from targets. Logging modes seed from the
   * logged actual where a set is done, planned target otherwise — so saving
   * unedited inputs logs exactly what the chips showed. */
  const enter = (next: Mode) => {
    const editingTargets = next.kind === 'edit' && next.scope === 'all'
    setValues(session.sets.map((s, i) => (editingTargets ? s.target : progress[i] ?? s.target)))
    setMode(next)
  }

  const tapSet = (i: number) => {
    if (progress[i] != null) undoSet(planId, session.index, i)
    else if (needsCount(i)) enter({ kind: 'entry', set: i })
    else logSet(planId, session.index, i, undefined, today)
  }

  const onPrimary = () => {
    if (mode.kind === 'entry') {
      logSet(planId, session.index, mode.set, values[mode.set], today)
      setMode({ kind: 'view' })
    } else if (editingTargets) {
      // "Adjust reps": store an override of the targets — no set gets logged.
      setOverride(
        planId,
        session.index,
        session.sets.map((s, i) => ({ target: Math.max(1, values[i] || 1), isMinimum: s.isMinimum })),
      )
      setMode({ kind: 'view' })
    } else if (mode.kind === 'edit') {
      completeSession(planId, session.index, values, today)
    } else if (session.sets.some((_, i) => needsEntry(i))) {
      enter({ kind: 'edit', scope: 'required' })
    } else {
      completeSession(planId, session.index, undefined, today)
    }
  }

  const primaryLabel = (): string => {
    if (mode.kind === 'entry') return 'Log set'
    if (mode.kind === 'edit') return 'Save'
    if (doneCount === 0) return isTest ? 'Enter result' : 'Log all sets'
    // remaining can hit 0 without a Result when an override shrank the set
    // count under existing check-offs — still needs an explicit log.
    if (remaining === 0) return 'Log session'
    return remaining === 1 ? 'Log last set' : `Log remaining ${remaining} sets`
  }

  const hint = (): string | null => {
    if (mode.kind !== 'view') {
      if (editingTargets) return 'Adjust the target numbers — saved without logging the session.'
      if (isTest) return 'How many did you get?'
      return mode.kind === 'entry'
        ? `At least ${session.sets[mode.set].target}${sfx} — how many did you get?`
        : 'Enter what you actually did.'
    }
    if (isTest) return null
    if (doneCount === 0) return 'Tap each set as you do it — or log them all at once below.'
    return `${doneCount} of ${session.sets.length} sets done. Tap a set to undo.`
  }
  const hintText = hint()

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
      {isTest ? (
        <p class="dim">Single set — as many as you can. Result recalibrates the rest of the plan.</p>
      ) : null}
      <div class="set-grid">
        {session.sets.map((s, i) => {
          const done = progress[i] != null
          const label = setLabel(s, i, isTest)
          return showsInput(i) ? (
            <div class="set-chip" key={i}>
              <input
                class="input"
                type="number"
                min={0}
                inputMode="numeric"
                value={values[i]}
                autoFocus={mode.kind === 'entry'}
                onKeyDown={(e) => e.key === 'Enter' && onPrimary()}
                onInput={(e) => {
                  const next = [...values]
                  next[i] = Number((e.target as HTMLInputElement).value)
                  setValues(next)
                }}
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
      {hintText && <p class="dim set-hint">{hintText}</p>}
      <button class="btn block" onClick={onPrimary}>
        {primaryLabel()}
      </button>
      {mode.kind === 'view' ? (
        <button
          class="btn block"
          data-variant="ghost"
          style={{ marginTop: 6 }}
          onClick={() => enter({ kind: 'edit', scope: 'all' })}
        >
          Adjust {exercise.unit === 'seconds' ? 'times' : 'reps'}
        </button>
      ) : (
        <button
          class="btn block"
          data-variant="ghost"
          style={{ marginTop: 6 }}
          onClick={() => setMode({ kind: 'view' })}
        >
          Cancel
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
