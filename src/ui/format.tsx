import { FlaskConical, Focus, Pencil, RockingChair } from 'lucide-preact'
import { toUTCNoon } from '../core/dates'
import { flooredMax } from '../core/stats'
import type { ResultSet, SessionType, SetTemplate, Unit } from '../core/types'

/** "Today" / "Tomorrow" / "Yesterday", otherwise a short weekday-and-date. */
export function formatDate(iso: string, today: string): string {
  const noon = toUTCNoon(iso)
  const diff = Math.round((noon - toUTCNoon(today)) / 86400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  return new Date(noon).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Staggered entry-animation delay for list rows, capped so long lists don't crawl. */
export const stagger = (i: number) => ({ '--i': `${Math.min(i, 10) * 25}ms` })

export const unitSuffix = (unit: Unit): string => (unit === 'seconds' ? 's' : '')

/** "12 · 15 · 13 · 10+" — the trailing + marks a minimum ("all you've got") set. */
export function setsSummary(sets: SetTemplate[], unit: Unit): string {
  const sfx = unitSuffix(unit)
  return sets.map((s) => `${s.target}${sfx}${s.isMinimum ? '+' : ''}`).join(' · ')
}

export function actualsSummary(sets: ResultSet[], unit: Unit): string {
  const sfx = unitSuffix(unit)
  return sets.map((s) => `${s.actual}${sfx}`).join(' · ')
}

/** Per-set chip label: "min" / "max" (test) / "set N". */
export const setLabel = (set: { isMinimum: boolean }, i: number, isTest: boolean): string =>
  set.isMinimum ? 'min' : isTest ? 'max' : `set ${i + 1}`

/** The "max ~N" hint printed on rows and in the chart tooltip. Floors the
 * (float) predicted max — the displayed number never rounds up. */
export const maxHint = (value: number, unit: Unit): string =>
  `max ~${flooredMax(value)}${unitSuffix(unit)}`

/** Icon-only badges keep session rows compact on phone-width screens; the
 * label survives as tooltip + accessible name. Max test = the "lab" (flask),
 * taper = narrowing focus on the goal, recovery = rocking chair. */
const TYPE_BADGE: Record<SessionType, { icon: typeof FlaskConical; label: string } | null> = {
  normal: null,
  test: { icon: FlaskConical, label: 'Max test' },
  taper: { icon: Focus, label: 'Taper' },
  recovery: { icon: RockingChair, label: 'Recovery' },
}

/** The session-type badge plus the "edited" (override) badge, shared by the
 * today card, schedule rows and history rows. Tests get the strong (primary)
 * badge, everything else the muted secondary one. */
export function SessionBadges({ type, overridden }: { type: SessionType; overridden?: boolean }) {
  const badge = TYPE_BADGE[type]
  return (
    <>
      {badge && (
        <span
          class="badge badge-icon"
          data-variant={type === 'test' ? undefined : 'secondary'}
          title={badge.label}
          aria-label={badge.label}
        >
          <badge.icon size={13} strokeWidth={2.25} aria-hidden />
        </span>
      )}
      {overridden && (
        <span class="badge badge-icon" data-variant="outline" title="Edited" aria-label="Edited">
          <Pencil size={13} strokeWidth={2.25} aria-hidden />
        </span>
      )}
    </>
  )
}
