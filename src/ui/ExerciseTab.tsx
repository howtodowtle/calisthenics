import { derivePlanView } from '../core/derive'
import { formatDate } from '../core/dates'
import { exerciseStats } from '../core/stats'
import { db } from '../core/store'
import type { Exercise } from '../core/types'
import { Chart } from './Chart'
import { HistoryList } from './HistoryList'
import { ScheduleList } from './ScheduleList'
import { RestCard, TodayCard } from './TodayCard'

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
  const activePlan = data.plans.find((p) => p.exerciseId === exercise.id && p.status === 'active')
  const planIds = new Set(data.plans.filter((p) => p.exerciseId === exercise.id).map((p) => p.id))
  const results = data.results.filter((r) => planIds.has(r.planId))
  const stats = exerciseStats(results, today)
  const view = activePlan ? derivePlanView(activePlan, data.results, today) : null

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

      {view && activePlan ? (
        <>
          {view.due ? (
            <TodayCard
              key={`${activePlan.id}:${view.due.index}`}
              session={view.due}
              planId={activePlan.id}
              exercise={exercise}
              today={today}
            />
          ) : (
            <RestCard next={view.next} today={today} />
          )}

          <div class="stats-row">
            <div class="stat">
              <div class="value">{stats.streak > 0 ? `🔥 ${stats.streak}` : '—'}</div>
              <div class="label">streak</div>
            </div>
            <div class="stat">
              <div class="value">{stats.totalActual.toLocaleString()}</div>
              <div class="label">{exercise.unit === 'seconds' ? 'total secs' : 'total reps'}</div>
            </div>
            <div class="stat">
              <div class="value">{stats.sessionsDone}</div>
              <div class="label">sessions</div>
            </div>
          </div>

          <h2>Progress</h2>
          <Chart sessions={view.sessions} unit={exercise.unit} today={today} />

          <ScheduleList
            sessions={view.sessions}
            planId={activePlan.id}
            exercise={exercise}
            today={today}
          />
        </>
      ) : (
        <div class="card empty">
          <div class="big-emoji">{exercise.emoji}</div>
          <strong>No active plan</strong>
          <p class="dim">Set a goal and get a full session-by-session schedule.</p>
          <button class="primary" onClick={onOpenSettings}>
            Create a plan
          </button>
        </div>
      )}

      <HistoryList results={results} unit={exercise.unit} today={today} />
    </>
  )
}
