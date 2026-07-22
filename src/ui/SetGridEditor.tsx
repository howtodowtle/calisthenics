import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'

/**
 * Inline number-per-set editor shared by the schedule (edit targets), the today
 * card and history (correct actuals): a labelled grid of numeric inputs plus a
 * Save/Cancel row. Callers supply the labels, the floor value and what Save
 * does; `extra` slots an optional third button (e.g. "Revert to plan").
 */
export function SetGridEditor({
  header,
  labels,
  initial,
  min,
  onSave,
  onClose,
  extra,
}: {
  header: string
  labels: string[]
  initial: number[]
  /** Floor applied to every value on save, and the input's `min`. */
  min: number
  onSave: (values: number[]) => void
  onClose: () => void
  extra?: ComponentChildren
}) {
  const [values, setValues] = useState<number[]>(() => initial)

  const save = () => {
    onSave(values.map((v) => Math.max(min, v || min)))
    onClose()
  }

  return (
    <div class="session-editor">
      <div class="dim" style={{ marginBottom: 6 }}>
        {header}
      </div>
      <div class="set-grid" style={{ margin: '6px 0 10px' }}>
        {labels.map((label, i) => (
          <div class="set-chip" key={i}>
            <input
              class="input"
              type="number"
              min={min}
              inputMode="numeric"
              value={values[i]}
              onInput={(e) =>
                setValues(values.map((v, j) => (j === i ? Number((e.target as HTMLInputElement).value) : v)))
              }
            />
            <div class="lbl">{label}</div>
          </div>
        ))}
      </div>
      <div class="row" style={{ justifyContent: 'flex-start' }}>
        <button class="btn" data-size="sm" onClick={save}>
          Save
        </button>
        <button class="btn" data-variant="ghost" data-size="sm" onClick={onClose}>
          Cancel
        </button>
        {extra}
      </div>
    </div>
  )
}
