import type { ResultSet, SessionType, SetTemplate, Unit } from '../core/types'

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

/** The "max ~N" hint printed on rows and in the chart tooltip. */
export const maxHint = (value: number, unit: Unit): string => `max ~${value}${unitSuffix(unit)}`

const TYPE_LABEL: Record<SessionType, string> = {
  normal: '',
  test: 'Max test',
  taper: 'Taper',
  recovery: 'Recovery',
}

/** Basecoat badge variant per session type: tests get the strong (primary)
 * badge, everything else the muted secondary one. */
const badgeVariant = (type: SessionType): string | undefined =>
  type === 'test' ? undefined : 'secondary'

/** The session-type badge plus the "edited" (override) badge, shared by the
 * today card, schedule rows and history rows. */
export function SessionBadges({ type, overridden }: { type: SessionType; overridden?: boolean }) {
  return (
    <>
      {type !== 'normal' && (
        <span class="badge" data-variant={badgeVariant(type)}>
          {TYPE_LABEL[type]}
        </span>
      )}
      {overridden && (
        <span class="badge" data-variant="outline">
          edited
        </span>
      )}
    </>
  )
}
