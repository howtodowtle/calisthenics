import { derivePlanView, predictedMaxIndex, sessionKey } from '../core/derive'
import { exerciseStats } from '../core/stats'
import { activePlanFor, db, plansForExercise, resultsForExercise } from '../core/store'
import type { Exercise } from '../core/types'
import { Chart } from './Chart'
import { formatDate } from './format'
import { HistoryList } from './HistoryList'
import { ScheduleList } from './ScheduleList'
import { RestCard, TodayCard } from './TodayCard'

function Stat({ value, label, index }: { value: string | number; label: string; index: number }) {
  return (
    <div class="stat" style={{ animationDelay: `${index * 50}ms` }}>
      <div class="value">{value}</div>
      <div class="label">{label}</div>
    </div>
  )
}

export function ExerciseTab({
  exercise,
  today,
  onOpenSettings,
}: {
  exercise: Exercise
  today: string
  onOpenSettings: () => void
}) {
  const data = db.value
  const activePlan = activePlanFor(data, exercise.id)
  const results = resultsForExercise(data, exercise.id)
  const stats = exerciseStats(results, plansForExercise(data, exercise.id), today)
  const view = activePlan ? derivePlanView(activePlan, results, today) : null
  // History rows of the active plan show the max they were planned around.
  const predictedMax = view ? predictedMaxIndex(view) : undefined

  return (
    <>
      <h1>
        {exercise.emoji} {exercise.name}
        {view && (
          <small>
            {view.completedCount}/{view.sessions.length} · ends {formatDate(view.endDate, today)}
          </small>
        )}
      </h1>

      {view ? (
        <>
          {view.due ? (
            <TodayCard
              key={sessionKey(view.plan.id, view.due.index)}
              session={view.due}
              planId={view.plan.id}
              exercise={exercise}
              today={today}
            />
          ) : (
            <RestCard
              next={view.next}
              planId={view.plan.id}
              today={today}
              completedToday={view.completedToday}
            />
          )}

          <div class="stats-row">
            {[
              { value: stats.streak > 0 ? `🔥 ${stats.streak}` : '—', label: 'streak' },
              { value: stats.sessionsDone, label: 'sessions' },
              { value: `${stats.weeksTrained}/${stats.weeksSpan}`, label: 'weeks trained' },
              { value: stats.sessionsPerWeek.toFixed(1), label: 'sessions/wk' },
              {
                value: stats.totalActual.toLocaleString(),
                label: exercise.unit === 'seconds' ? 'total secs' : 'total reps',
              },
              {
                value: Math.round(stats.actualPerWeek).toLocaleString(),
                label: exercise.unit === 'seconds' ? 'secs/wk' : 'reps/wk',
              },
              { value: Math.round(stats.avgPerSession).toLocaleString(), label: 'avg/session' },
              { value: stats.bestSession.toLocaleString(), label: 'best session' },
            ].map((tile, index) => (
              <Stat key={tile.label} value={tile.value} label={tile.label} index={index} />
            ))}
          </div>

          <h2>Progress</h2>
          <Chart sessions={view.sessions} unit={exercise.unit} today={today} />

          <ScheduleList
            sessions={view.sessions}
            planId={view.plan.id}
            exercise={exercise}
            today={today}
          />
        </>
      ) : (
        <div class="card empty" data-size="sm">
          <section>
            <div class="big-emoji">{exercise.emoji}</div>
            <strong>No active plan</strong>
            <p class="dim">Set a goal and get a full session-by-session schedule.</p>
            <button class="btn block" onClick={onOpenSettings}>
              Create a plan
            </button>
          </section>
        </div>
      )}

      <HistoryList results={results} unit={exercise.unit} today={today} predictedMax={predictedMax} />
    </>
  )
}
