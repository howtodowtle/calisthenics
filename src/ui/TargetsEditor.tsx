import type { SessionView } from '../core/derive'
import { clearOverride, setOverride } from '../core/store'
import { setLabel } from './format'
import { SetGridEditor } from './SetGridEditor'

/**
 * The one editor for a session's *targets*, shared by the schedule list (tap a
 * future session) and the today card ("Adjust reps"). Saving stores a
 * per-session override; an already-overridden session can drop back to what
 * the plan called for. Nothing here logs anything — `HistoryList`'s
 * `ResultEditor` is the counterpart that corrects what was actually done.
 */
export function TargetsEditor({
  session,
  planId,
  header,
  onClose,
}: {
  session: SessionView
  planId: string
  header: string
  onClose: () => void
}) {
  return (
    <SetGridEditor
      header={header}
      labels={session.sets.map((s, i) => setLabel(s, i, session.type === 'test'))}
      initial={session.sets.map((s) => s.target)}
      min={1}
      onSave={(values) =>
        setOverride(
          planId,
          session.index,
          session.sets.map((s, i) => ({ target: values[i], isMinimum: s.isMinimum })),
        )
      }
      onClose={onClose}
      extra={
        session.overridden ? (
          <button
            class="btn danger"
            data-variant="ghost"
            data-size="sm"
            onClick={() => {
              clearOverride(planId, session.index)
              onClose()
            }}
          >
            Revert to plan
          </button>
        ) : undefined
      }
    />
  )
}
