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
        Your session lives on the Today card. Tap each set as you do it — one in the morning,
        the rest whenever — or hit <strong>Log all sets</strong> to check the whole session off
        at once. Tapping a checked set undoes it; the session completes when the last set is
        logged. Sets marked <strong>min</strong> and test sessions ask what you actually got —
        test results recalibrate the rest of the plan. Missed a day? The whole schedule
        moves with you — the rhythm between sessions stays, the end date slides. Started a
        session but didn't finish? It closes overnight with the sets you did — the rest
        count as 0 — and the plan moves on. Feeling strong? On a rest day — or right after
        finishing a session — the card offers the next one:{' '}
        <strong>Do it today</strong> pulls just that session forward; once you complete
        it, the rest of the plan moves up to keep its rhythm from that day.
      </p>

      <h2>The week ahead</h2>
      <p>
        The <strong>Overview</strong> tab is every exercise on one screen, day by day for the
        next week — what's on today, what's coming, and the sets each session asks for. Tap
        any row to jump to that exercise. Only today is fixed: the days after it assume you
        stay on plan, and shift forward if you miss a day.
      </p>

      <h2>The streak</h2>
      <p>
        The 🔥 streak on each exercise counts consecutive sessions without too long a break.
        How long a break is allowed adapts to your plan: twice the average time between
        sessions, but never more than 7 days. At 3 sessions per week that's about 4½ days;
        at 2 per week or fewer it's the full 7. Let more time pass and the streak resets —
        the session count and lifetime totals keep everything you've ever done.
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

      <p class="dim build-stamp">Build {__BUILD__}</p>
    </>
  )
}
