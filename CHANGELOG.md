# Changelog

All notable changes to probar are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The current version is tracked in [`VERSION`](VERSION).
## [0.3.0] - 2026-10-28

### Added
- **Post-workout wrap-up.** Finishing a session now opens a sheet that captures
  an **RPE** (1–10, how hard the whole session felt), an optional **note**, and
  an optional **swim distance**. `Session.RPE`/`Note` existed server-side since
  0.2.0 but nothing in the UI ever wrote them, so the coach was reading training
  through set counts alone. Both are skippable — `Skip & just log it` stores the
  session exactly as before. The sheet replaces the old `confirm()` dialog, so
  finishing costs no extra taps.
- **Conditioning logging.** New optional session fields `activity`, `distance`,
  and `distanceUnit` record work that isn't sets and reps — e.g. the lap swim
  that follows a lifting session. They're session-level rather than per-exercise
  so distance never leaks into the PR or set math. Swims can ride along with a
  strength session (via the wrap-up sheet) or be logged on their own from
  History → `+ Log a swim`. History shows yardage per session and a running
  total; Progress charts distance over time.
- Session validation: `rpe` outside 0–10 and a negative `distance` are now
  rejected with 400 instead of being stored and quietly skewing the next
  coaching decision.

### Fixed
- **`PUT /api/profile` no longer nulls lists it wasn't given.** `SetProfile` was
  a blind whole-object replace, so any partial write — a hand-rolled curl, a
  coach run sending only `goals` — silently emptied `constraints`, the one field
  the coach prompt treats as non-negotiable. A nil list is now treated as "not
  supplied" and keeps its current value; an explicit `[]` still clears it.
- **An already-nulled `constraints` self-repairs on load** from
  `defaultProfile()`, so an existing deployment doesn't stay unguarded.
- **The Train tab's "⚠️ Back Safety" panel reads the live profile.** It was a
  hardcoded copy of the original default constraints, so once the stored list was
  nulled the app kept displaying safety rules the profile no longer contained.
- **Failed writes are no longer silent.** `saveProfile`, `saveSettings`, badge
  awards, and the delete actions swallowed every error, so a write that never
  reached the cluster still looked like it succeeded. They now surface a banner
  offering **Reload**, which re-syncs from the server — the only way to see what
  actually persisted after an optimistic update fails.
- **The offline queue can no longer wedge.** A queued session the server rejects
  with a 4xx is dropped instead of retried on every page load, where it would
  block everything behind it forever.
- The Coach Profile editor re-syncs while collapsed, so a profile changed by a
  coach run or another device is no longer reverted by the next Save.
- Standalone swims are excluded from the workout count and the 10/50/100 badges
  (a session with no planned sets isn't a strength workout). Training *dates*
  still count toward the weekly goal — swimming is training.
- `coach/PROMPT.md`: the deload rule keyed off **low** `rpe`, which is backwards —
  low perceived exertion means the work was easy and argues for progression. It
  now reads high `rpe`. The session field list also described `rpe`/`note` as
  per-exercise when they are session-level.
- Helm chart version, `appVersion`, and `image.tag` were stranded at 0.2.0 while
  `VERSION` had moved to 0.2.2; all now track 0.3.0.

## [0.2.2] - 2026-07-14

### Changed
- nothing 

## [0.2.1] - 2026-07-14

### Fixed
- Coach Profile editor: the Equipment, Injuries, and Hard-constraints fields now
  accept the Enter key. Previously each keystroke re-split the textarea and
  dropped empty lines, so pressing Enter immediately erased the new blank line
  and made it impossible to add a second item. The raw text is now kept while
  editing and only trimmed into a list on save.

## [0.2.0] - 2026-07-03

### Added
- The `/workout` page is now a **dynamic, data-driven personal training app**
  backed by a small JSON store on a persistent volume (no database; the binary
  stays dependency-free and distroless). Workouts are no longer hardcoded.
  - **Programs library** — the workout lives in `programs.json` as one of many
    switchable programs; the original A/B/C split is seeded on first boot.
  - **REST API** under `/api` (`programs`, `sessions`, `settings`, `profile`)
    using Go 1.22 method routing, with an optional `PROBAR_WRITE_TOKEN` guard on
    writes. Data persists across restarts on the mounted PVC.
  - **Claude as coach** — a scheduled agent reads your history and live-uploads a
    new program every couple of weeks; the app shows a "New block from your coach"
    banner to review and accept (see `coach/`). No rebuild needed for new
    workouts.
  - **In-app builder** — create and edit your own custom programs.
  - **History tab** — a contribution-calendar heatmap, a weekly-goal ring
    (default 3 gym days/week), current/longest **week-streak**, totals, a logged
    session list, and **achievement badges**.
  - **Progress tab** — per-exercise weight-over-time charts and personal records.
- The SPA is split into maintainable `workout/*.jsx` files (still no build step;
  Babel transpiles them in the browser, one Go binary).

### Changed
- The rest timer is now **wall-clock based**, so backgrounding the tab or
  switching apps no longer freezes or drifts the countdown.
- Kept the 0.1.10 in-gym quick-log UX (tap-to-complete rows, inline set-dots,
  always-visible weight, "How?" cues, the pinned configurable rest timer) and
  carried it onto the active program.
- Bumped to 0.2.0; the Helm chart gained a PVC (`persistence.*`),
  `PROBAR_DATA_DIR`, and `fsGroup` so the non-root container can write the data.

## [0.1.10] - 2026-06-15

### Changed
- Streamlined the `/workout` flow to be faster to use mid-set. Workout exercises
  now match the warm-up/cool-down style: tapping the row marks the whole exercise
  done (or clears it), and the weight field is always visible on the card instead
  of behind a drop-down. Form cues moved behind a small "How?" toggle so rows
  stay tidy.
- Replaced the per-set checkbox drop-down with a lightweight inline set tracker —
  one dot per set, tapped to log sets one at a time (wrapping back to empty once
  full). Logging a set auto-starts the rest timer. The day progress bar tracks
  sets completed, and the header shows both sets and exercises done.
- The rest timer is pinned to the top of every phase (warm-up, workout,
  cool-down), so it can be triggered any time. The length is configurable in 30s
  steps with a default of 60s and persists across sessions. The auto-start-on-set
  behavior and the floating bottom pill were removed in favor of this control.

### Fixed
- Same-day progress saved under the old per-set schema is migrated on load (an
  exercise counts as done if all its sets were previously ticked), so deploying
  this change mid-day doesn't wipe in-progress workouts. Logged weights are kept.

## [0.1.9] - 2026-06-14

### Changed
- The `/workout` page is now rendered through the shared page template, so it
  has the same sticky navbar and visual theme as the rest of the site instead of
  being a standalone page. The tracker UI was restyled to the site's design
  tokens (surfaces, borders, accent gradients) with a blue/purple/violet day
  palette. The navbar uses a fixed `--nav-h` height token so the page can stick
  its phase selector neatly beneath it; added `--success`, `--warn`, and
  `--danger` tokens to the shared palette.

### Added
- Workout progress is saved to `localStorage` — sets, warm-up/cool-down checks,
  the selected day/phase, and per-exercise weights all survive reloads and
  navigation. Checkmarks reset on a new local day; logged weights are kept.
- Per-phase progress bars plus a slim progress strip under the sticky phase tabs.
- An automatic rest timer that starts when you tick a set (with +15s/skip and an
  end-of-rest beep), per-exercise weight logging remembered across sessions, and
  a reset-day button.

## [0.1.8] - 2026-06-14

### Added
- `/workout` page — a self-contained gym workout tracker rendered as a React
  single-page app. It has warm-up / workout / cool-down phases, three training
  days (Push + Core, Pull + Hinge, Full Body + Core), expandable exercise cards
  with per-set checkboxes, and back-safety reminders. React and ReactDOM load
  from a CDN and the JSX is transpiled in the browser by Babel standalone, so
  the page needs no frontend build step and the service stays a single Go
  binary — the HTML/JSX is baked in with `//go:embed`. Linked from the nav.

## [0.1.7] - 2026-06-07

### Fixed
- Client IP on the homepage no longer shows a constant internal cluster
  address for every visitor. Root cause was the Traefik LoadBalancer service
  running with `externalTrafficPolicy: Cluster`, which causes kube-proxy to
  SNAT (masquerade) the source address behind MetalLB L2 before traffic
  reaches the app. The fix is to set `externalTrafficPolicy: Local` on the
  Traefik service so the real LAN client IP is preserved and forwarded.
  **This setting lives in the Traefik Helm release, not this repo — persist it
  in your Traefik values so it survives a `helm upgrade`.**

### Changed
- `clientIP` now prefers the `X-Real-Ip` header (set by Traefik to the true
  peer) over the first `X-Forwarded-For` entry, which a client could spoof.

### Added
- `/whoami` endpoint that returns the resolved client IP alongside the raw
  `X-Real-Ip`, `X-Forwarded-For`, and `RemoteAddr` values for diagnosing
  source-IP issues through the ingress.

## [0.1.6] - 2026-06-07

### Added
- Display the visiting client's IP address on the homepage.
- Scrollable "Tools" section below the hero, reachable from the nav and a
  scroll hint.
- Client-side random string generator with toggleable character sets
  (lowercase, uppercase, numbers, symbols) and an adjustable length slider,
  using `crypto.getRandomValues` for randomness.

### Changed
- Refreshed the entire UI with a modern, professional dark theme (layered
  gradients, sticky blurred navbar, gradient headings, card surfaces).
