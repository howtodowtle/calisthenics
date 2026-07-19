import { useEffect, useState } from 'preact/hooks'
import { todayISO } from '../core/dates'
import { db, sortedExercises } from '../core/store'
import { ExerciseTab } from './ExerciseTab'
import { Settings } from './Settings'

/** Re-render on app foregrounding so "today" stays correct across midnight. */
function useToday(): string {
  const [today, setToday] = useState(todayISO())
  useEffect(() => {
    const refresh = () => setToday(todayISO())
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
    }
  }, [])
  return today
}

export function App() {
  const data = db.value
  const today = useToday()
  const exercises = sortedExercises(data)

  const [tab, setTab] = useState<string>(
    () => localStorage.getItem('ui.tab') ?? exercises[0]?.id ?? 'settings',
  )
  const activeTab = tab === 'settings' || exercises.some((e) => e.id === tab)
    ? tab
    : (exercises[0]?.id ?? 'settings')

  const selectTab = (id: string) => {
    setTab(id)
    localStorage.setItem('ui.tab', id)
  }

  const exercise = exercises.find((e) => e.id === activeTab)

  // Settings is not a tab: it lives behind the fixed gear button top-right,
  // which toggles back to the exercise that was open when it was pressed.
  const [lastExercise, setLastExercise] = useState<string | null>(null)
  const openSettings = () => {
    if (exercise) setLastExercise(exercise.id)
    selectTab('settings')
  }
  const closeSettings = () => {
    const target = lastExercise && exercises.some((e) => e.id === lastExercise)
      ? lastExercise
      : exercises[0]?.id
    if (target) selectTab(target)
  }

  return (
    <>
      {exercises.length > 0 && (
        <button
          class="settings-btn"
          aria-label={exercise ? 'Settings' : 'Close settings'}
          onClick={exercise ? openSettings : closeSettings}
        >
          {exercise ? '⚙️' : '✕'}
        </button>
      )}
      {exercise ? (
        <ExerciseTab key={exercise.id} exercise={exercise} today={today} onOpenSettings={openSettings} />
      ) : (
        <Settings onSelectExercise={selectTab} />
      )}
      {exercises.length > 0 && (
        <nav class="tabbar">
          {exercises.map((e) => (
            <button
              key={e.id}
              class={activeTab === e.id ? 'active' : ''}
              onClick={() => selectTab(e.id)}
            >
              <span class="icon">{e.emoji}</span>
              {e.name}
            </button>
          ))}
        </nav>
      )}
    </>
  )
}
