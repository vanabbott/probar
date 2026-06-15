# Changelog

All notable changes to probar are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The current version is tracked in [`VERSION`](VERSION).

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
