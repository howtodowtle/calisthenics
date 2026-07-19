import { Settings as SettingsIcon } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { todayISO } from '../core/dates'
import { previewPlan } from '../core/derive'
import { getGenerator, registry } from '../core/generators'
import {
  addExercise,
  createPlan,
  db,
  deleteExercise,
  deletePlan,
  exportJSON,
  importJSON,
  sortedExercises,
  stopPlan,
  updateExercise,
  updatePlanParams,
} from '../core/store'
import type { Exercise, Generator, Plan, Unit } from '../core/types'

export function Settings({ onSelectExercise }: { onSelectExercise: (id: string) => void }) {
  const data = db.value
  const exercises = sortedExercises(data)

  return (
    <>
      <h1>
        <SettingsIcon size={22} aria-hidden /> Settings
      </h1>

      <h2>Exercises</h2>
      {exercises.map((e) => (
        <ExerciseCard
          key={e.id}
          exercise={e}
          plans={data.plans.filter((p) => p.exerciseId === e.id)}
          onSelectExercise={onSelectExercise}
        />
      ))}
      <AddExercise />

      <h2>Backup</h2>
      <Backup />

      <p class="dim" style={{ textAlign: 'center' }}>
        All data lives on this device only. Export a backup now and then.
      </p>
    </>
  )
}

// ---- exercises ----

function ExerciseCard({
  exercise,
  plans,
  onSelectExercise,
}: {
  exercise: Exercise
  plans: Plan[]
  onSelectExercise: (id: string) => void
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'new-plan' | 'edit-plan'>('view')
  const active = plans.find((p) => p.status === 'active')
  const archived = plans.filter((p) => p.status === 'archived')

  return (
    <div class="card" data-size="sm">
      <section>
      <div class="row">
        <strong>
          {exercise.emoji} {exercise.name} <span class="dim">({exercise.unit})</span>
        </strong>
        <span>
          <button
            class="btn"
            data-variant="ghost"
            data-size="sm"
            onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
          >
            Edit
          </button>
          <button
            class="btn danger"
            data-variant="ghost"
            data-size="sm"
            onClick={() => {
              if (confirm(`Delete ${exercise.name}, its plans and ALL logged history?`))
                deleteExercise(exercise.id)
            }}
          >
            Delete
          </button>
        </span>
      </div>

      {mode === 'edit' && (
        <ExerciseForm
          initial={exercise}
          onSave={(name, emoji, unit) => {
            updateExercise(exercise.id, { name, emoji, unit })
            setMode('view')
          }}
          onCancel={() => setMode('view')}
        />
      )}

      {active ? (
        <>
          <p class="dim">
            {getGenerator(active.generatorId).name} · started {active.startDate}
            {active.calibrations.length > 0 && ` · ${active.calibrations.length} calibration(s)`}
          </p>
          {mode === 'edit-plan' ? (
            <PlanForm
              exercise={exercise}
              initial={active}
              onDone={() => setMode('view')}
            />
          ) : (
            <div class="row" style={{ justifyContent: 'flex-start' }}>
              <button
                class="btn"
                data-variant="ghost"
                data-size="sm"
                onClick={() => onSelectExercise(exercise.id)}
              >
                Open
              </button>
              <button class="btn" data-variant="ghost" data-size="sm" onClick={() => setMode('edit-plan')}>
                Edit params
              </button>
              <button
                class="btn"
                data-variant="ghost"
                data-size="sm"
                onClick={() => {
                  if (confirm('Stop this plan? History is kept.')) stopPlan(active.id)
                }}
              >
                Stop
              </button>
              <button
                class="btn danger"
                data-variant="ghost"
                data-size="sm"
                onClick={() => {
                  if (confirm('Delete this plan AND its logged sessions?')) deletePlan(active.id)
                }}
              >
                Delete
              </button>
            </div>
          )}
        </>
      ) : mode === 'new-plan' ? (
        <PlanForm exercise={exercise} onDone={() => setMode('view')} />
      ) : (
        <button
          class="btn"
          data-variant="outline"
          data-size="sm"
          style={{ marginTop: 8 }}
          onClick={() => setMode('new-plan')}
        >
          New plan
        </button>
      )}

      {archived.length > 0 && (
        <p class="dim">
          {archived.length} archived plan{archived.length > 1 ? 's' : ''} (history counts toward
          stats)
          {archived.map((p) => (
            <button
              key={p.id}
              class="btn danger"
              data-variant="ghost"
              data-size="sm"
              onClick={() => {
                if (confirm(`Delete archived plan from ${p.startDate} and its history?`))
                  deletePlan(p.id)
              }}
            >
              Delete {p.startDate}
            </button>
          ))}
        </p>
      )}
      </section>
    </div>
  )
}

function ExerciseForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Exercise
  onSave: (name: string, emoji: string, unit: Unit) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🏋️')
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'reps')

  return (
    <div style={{ margin: '10px 0' }}>
      <label>
        Name
        <input class="input" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <label>
        Emoji
        <input
          class="input"
          style={{ width: 72, textAlign: 'center' }}
          value={emoji}
          onInput={(e) => setEmoji((e.target as HTMLInputElement).value)}
        />
      </label>
      <label>
        Unit
        <select
          class="select"
          value={unit}
          onChange={(e) => setUnit((e.target as HTMLSelectElement).value as Unit)}
        >
          <option value="reps">reps</option>
          <option value="seconds">seconds</option>
        </select>
      </label>
      <div class="row" style={{ justifyContent: 'flex-start' }}>
        <button
          class="btn"
          data-size="sm"
          onClick={() => name.trim() && onSave(name.trim(), emoji.trim() || '🏋️', unit)}
        >
          Save
        </button>
        {onCancel && (
          <button class="btn" data-variant="ghost" data-size="sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function AddExercise() {
  const [open, setOpen] = useState(false)
  return (
    <div class="card" data-size="sm">
      <section>
        {open ? (
          <ExerciseForm
            onSave={(name, emoji, unit) => {
              addExercise(name, emoji, unit)
              setOpen(false)
            }}
            onCancel={() => setOpen(false)}
          />
        ) : (
          <button class="btn" data-variant="outline" onClick={() => setOpen(true)}>
            + Add exercise
          </button>
        )}
      </section>
    </div>
  )
}

// ---- plans ----

const defaultParams = (g: Generator): Record<string, number> =>
  Object.fromEntries(g.paramFields.map((f) => [f.key, f.defaultValue]))

/** Create (no `initial`) or edit params (with `initial`). Form fields render
 * themselves from the generator's declarative paramFields. */
function PlanForm({
  exercise,
  initial,
  onDone,
}: {
  exercise: Exercise
  initial?: Plan
  onDone: () => void
}) {
  const generators = [...registry.values()]
  const [generatorId, setGeneratorId] = useState(initial?.generatorId ?? generators[0].id)
  const gen = getGenerator(generatorId)
  const [params, setParams] = useState<Record<string, number>>(
    () => initial?.params ?? defaultParams(gen),
  )
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayISO())

  // Preview through the same derivation path a real plan uses; params can be
  // mid-edit garbage, hence the catch.
  const preview = (() => {
    try {
      return previewPlan(generatorId, params, startDate, initial?.calibrations ?? [])
    } catch {
      return null
    }
  })()

  const save = () => {
    if (initial) updatePlanParams(initial.id, params)
    else createPlan(exercise.id, generatorId, params, startDate)
    onDone()
  }

  return (
    <div style={{ margin: '10px 0' }}>
      {!initial && generators.length > 1 && (
        <label>
          Algorithm
          <select
            class="select"
            value={generatorId}
            onChange={(e) => {
              const id = (e.target as HTMLSelectElement).value
              setGeneratorId(id)
              setParams(defaultParams(getGenerator(id)))
            }}
          >
            {generators.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p class="dim">{gen.description}</p>
      {gen.paramFields.map((f) => (
        <label key={f.key}>
          {f.label}
          <input
            class="input"
            type="number"
            min={f.min}
            max={f.max}
            step={f.step}
            value={params[f.key]}
            onInput={(e) =>
              setParams({ ...params, [f.key]: Number((e.target as HTMLInputElement).value) })
            }
          />
        </label>
      ))}
      {!initial && (
        <label>
          Start date
          <input
            class="input"
            type="date"
            style={{ width: 160 }}
            value={startDate}
            onInput={(e) => setStartDate((e.target as HTMLInputElement).value || todayISO())}
          />
        </label>
      )}
      {preview && (
        <p class="dim">
          {preview.count} sessions · ends around {preview.end}
        </p>
      )}
      {initial && <p class="dim">Completed sessions stay as logged; future sessions re-derive.</p>}
      <div class="row" style={{ justifyContent: 'flex-start' }}>
        <button class="btn" onClick={save}>
          {initial ? 'Save params' : 'Start plan'}
        </button>
        <button class="btn" data-variant="ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---- backup ----

function Backup() {
  const doExport = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `training-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const doImport = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    file.text().then((text) => {
      if (!confirm('Replace ALL current data with this backup?')) return
      try {
        importJSON(text)
        alert('Backup restored.')
      } catch (err) {
        alert(`Import failed: ${err instanceof Error ? err.message : err}`)
      }
    })
    input.value = ''
  }

  return (
    <div class="card" data-size="sm">
      <section class="row">
        <button class="btn" data-variant="outline" onClick={doExport}>
          Export backup
        </button>
        <label style={{ margin: 0 }}>
          <span class="btn" data-variant="ghost">
            Import backup
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={doImport} />
          </span>
        </label>
      </section>
    </div>
  )
}
