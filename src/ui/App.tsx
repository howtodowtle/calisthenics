import { CalendarDays, CircleQuestionMark, Settings as SettingsIcon, X } from 'lucide-preact'
import { useEffect, useState } from 'preact/hooks'
import { todayISO } from '../core/dates'
import { db, dueExerciseCount, finalizeStalePartials, sortedExercises } from '../core/store'
import { ExerciseTab } from './ExerciseTab'
import { Help } from './Help'
import { Overview } from './Overview'
import { Settings } from './Settings'
import { updateTabBadge } from './tabBadge'

/**
 * Tab ids: the overview, then one per exercise (id = exercise id). Settings
 * and Help are not tabs — they live behind the fixed top-right buttons — but
 * share the same slot so one piece of state tracks "what's on screen".
 */
const OVERVIEW = 'overview'
/** Bumped when the overview landed: a tab remembered from before it existed
 * shouldn't hide the new default. Everyone gets it once, then it remembers. */
const TAB_KEY = 'ui.tab.v2'

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

  const [tab, setTab] = useState<string>(() => localStorage.getItem(TAB_KEY) ?? OVERVIEW)

  // Where to land when a tab can't be shown — the overview, or Settings while
  // the app is still empty (nothing to overview, and no tab bar to escape by).
  const home = exercises.length > 0 ? OVERVIEW : 'settings'
  /** Whether a remembered tab id can actually be rendered right now. */
  const canShow = (id: string | null): id is string =>
    id === 'settings' ||
    id === 'help' ||
    (id === OVERVIEW && exercises.length > 0) ||
    exercises.some((e) => e.id === id)
  const activeTab = canShow(tab) ? tab : home

  const selectTab = (id: string) => {
    setTab(id)
    localStorage.setItem(TAB_KEY, id)
  }

  const exercise = exercises.find((e) => e.id === activeTab)

  // Close out partial sessions from past days when the clock crosses midnight
  // while the app stays open; the store itself sweeps on load and import.
  useEffect(() => finalizeStalePartials(today), [today])

  // Tab/app-icon notification: how many exercises have a session due today.
  // Effect deps keep the derivation off pure UI re-renders (tab switches etc.).
  useEffect(() => updateTabBadge(dueExerciseCount(data, today)), [data, today])

  // Settings and Help are not tabs: they live behind the fixed buttons
  // top-right, which toggle back to whatever tab was open.
  const onPage = activeTab === 'settings' || activeTab === 'help'
  const [lastTab, setLastTab] = useState<string | null>(null)
  const openPage = (page: 'settings' | 'help') => {
    // Guarded, so opening Help from Settings doesn't make Settings the tab to
    // come back to — `lastTab` is only ever a real tab.
    if (!onPage) setLastTab(activeTab)
    selectTab(page)
  }
  const closePage = () => selectTab(canShow(lastTab) ? lastTab : home)

  return (
    <>
      {exercises.length > 0 &&
        (onPage ? (
          <button class="settings-btn" aria-label="Close" onClick={closePage}>
            <X size={19} aria-hidden />
          </button>
        ) : (
          <>
            <button class="settings-btn help-btn" aria-label="Help" onClick={() => openPage('help')}>
              <CircleQuestionMark size={19} aria-hidden />
            </button>
            <button class="settings-btn" aria-label="Settings" onClick={() => openPage('settings')}>
              <SettingsIcon size={19} aria-hidden />
            </button>
          </>
        ))}
      {activeTab === OVERVIEW ? (
        <Overview
          today={today}
          onSelectExercise={selectTab}
          onOpenSettings={() => openPage('settings')}
        />
      ) : exercise ? (
        <ExerciseTab key={exercise.id} exercise={exercise} today={today} onOpenSettings={() => openPage('settings')} />
      ) : activeTab === 'help' ? (
        <Help />
      ) : (
        <Settings onSelectExercise={selectTab} />
      )}
      {exercises.length > 0 && (
        <nav class="tabbar">
          <button
            class={activeTab === OVERVIEW ? 'active' : ''}
            onClick={() => selectTab(OVERVIEW)}
          >
            <span class="icon">
              <CalendarDays size={21} aria-hidden />
            </span>
            Overview
          </button>
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
