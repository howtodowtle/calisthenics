import type { ComponentChildren } from 'preact'
import { useRef, useState } from 'preact/hooks'

/** Travel that arms the delete on release. Must exceed the action strip's
 * label inset + width so "Delete" reads fully before it arms. */
const TRIGGER_PX = 88
/** Hard stop a little past the trigger, for a sense of pull. */
const MAX_PX = 132
/** Movement below this is a tap, not a drag. */
const SLOP_PX = 8
/** How long after a drag a click is still the drag's echo, not a new tap. */
const CLICK_GUARD_MS = 350

/**
 * Wraps a list row so dragging it left reveals a red "Delete" strip;
 * releasing past the trigger fires `onDelete`, anything less snaps back.
 * The caller owns the warning — `if (confirm(...))` at the call site, like
 * every destructive action here — and a blocking dialog holds the row
 * mid-swipe beneath it, since nothing repaints before the handler returns.
 * The first clear movement decides the gesture: mostly vertical hands it to
 * the scroller untouched (`touch-action: pan-y` does the same for the
 * browser), and a drag suppresses the row's own click so a swipe never
 * opens the row.
 */
export function SwipeToDelete({
  onDelete,
  children,
}: {
  onDelete: () => void
  children: ComponentChildren
}) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  // Timestamp, not a flag: a touch swipe fires no click at all, so a flag
  // consumed on click would leak into suppressing the next real tap.
  const dragEndedAt = useRef(0)

  const settle = () => {
    start.current = null
    setDragging(false)
    setDx(0)
  }

  return (
    <div
      class="swipe-row"
      onPointerDown={(e) => {
        if (e.isPrimary) start.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const mx = e.clientX - start.current.x
        const my = e.clientY - start.current.y
        if (!dragging) {
          if (Math.abs(mx) < SLOP_PX && Math.abs(my) < SLOP_PX) return
          if (Math.abs(my) >= Math.abs(mx)) {
            start.current = null // a scroll — let it be
            return
          }
          setDragging(true)
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        setDx(Math.max(-MAX_PX, Math.min(0, mx)))
      }}
      onPointerUp={() => {
        if (!dragging) {
          start.current = null
          return
        }
        const past = dx <= -TRIGGER_PX
        settle()
        if (past) onDelete()
        // Stamped after onDelete: its confirm blocks, and the click to
        // suppress lands right after the dialog closes.
        dragEndedAt.current = Date.now()
      }}
      onPointerCancel={settle}
      onClickCapture={(e) => {
        if (Date.now() - dragEndedAt.current < CLICK_GUARD_MS) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <div class="swipe-action" aria-hidden="true">
        Delete
      </div>
      <div
        class="swipe-content"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : undefined,
          willChange: dragging ? 'transform' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
}
