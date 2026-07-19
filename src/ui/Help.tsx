import { CircleQuestionMark } from 'lucide-preact'

/** Minimal how-to page, opened via the "?" button next to Settings. */
export function Help() {
  return (
    <>
      <h1>
        <CircleQuestionMark size={22} aria-hidden /> How this works
      </h1>

      <h2>The idea</h2>
      <p>
        Pick an exercise, enter your current max and a target, and the app generates a
        progressive training plan — a few sessions per week, each a handful of sets. Follow the
        plan and the numbers grow.
      </p>

      <h2>Day to day</h2>
      <p>
        Do the sets on the Today card, tap <strong>Done</strong>. Sets marked{' '}
        <strong>min</strong> and test sessions ask what you actually got — test results
        recalibrate the rest of the plan. Missed a day? The schedule shifts forward.
      </p>

      <h2>Make it yours</h2>
      <p>
        Tap any upcoming session to edit its sets. Add your own exercises (anything counted in
        reps or seconds) and tweak plan parameters in Settings.
      </p>

      <h2>Your data</h2>
      <p>
        Everything is stored in your browser on this device — no account, no server, works
        offline. Export a backup in Settings now and then: clearing browser data also clears
        your training history.
      </p>

      <h2>Install</h2>
      <p>
        Add this page to your home screen (<strong>Add to Home Screen</strong> in the share
        menu, or <strong>Install</strong>) to get a full-screen app.
      </p>

      <p class="dim" style={{ textAlign: 'center' }}>
        A personal project, built for my own training. Free to use, but not a product — no
        support, no guarantees.
      </p>
    </>
  )
}
