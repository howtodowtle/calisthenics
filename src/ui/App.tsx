import { CircleQuestionMark, Settings as SettingsIcon, X } from 'lucide-preact'
import { useEffect, useState } from 'preact/hooks'
import { todayISO } from '../core/dates'
import { db, dueExerciseCount, sortedExercises } from '../core/store'
import { ExerciseTab } from './ExerciseTab'
import { Help } from './Help'
import { Settings } from './Settings'
import { updateTabBadge } from './tabBadge'

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
  const activeTab = tab === 'settings' || tab === 'help' || exercises.some((e) => e.id === tab)
    ? tab
    : (exercises[0]?.id ?? 'settings')

  const selectTab = (id: string) => {
    setTab(id)
    localStorage.setItem('ui.tab', id)
  }

  const exercise = exercises.find((e) => e.id === activeTab)

  // Tab/app-icon notification: how many exercises have a session due today.
  // Effect deps keep the derivation off pure UI re-renders (tab switches etc.).
  useEffect(() => updateTabBadge(dueExerciseCount(data, today)), [data, today])

  // Settings and Help are not tabs: they live behind the fixed buttons
  // top-right, which toggle back to the exercise that was open.
  const [lastExercise, setLastExercise] = useState<string | null>(null)
  const openPage = (page: 'settings' | 'help') => {
    if (exercise) setLastExercise(exercise.id)
    selectTab(page)
  }
  const closePage = () => {
    const target = lastExercise && exercises.some((e) => e.id === lastExercise)
      ? lastExercise
      : exercises[0]?.id
    if (target) selectTab(target)
  }

  return (
    <>
      {exercises.length > 0 &&
        (exercise ? (
          <>
            <button class="settings-btn help-btn" aria-label="Help" onClick={() => openPage('help')}>
              <CircleQuestionMark size={19} aria-hidden />
            </button>
            <button class="settings-btn" aria-label="Settings" onClick={() => openPage('settings')}>
              <SettingsIcon size={19} aria-hidden />
            </button>
          </>
        ) : (
          <button class="settings-btn" aria-label="Close" onClick={closePage}>
            <X size={19} aria-hidden />
          </button>
        ))}
      {exercise ? (
        <ExerciseTab key={exercise.id} exercise={exercise} today={today} onOpenSettings={() => openPage('settings')} />
      ) : activeTab === 'help' ? (
        <Help />
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
