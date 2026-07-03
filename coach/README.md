# Claude as your probar coach

This directory turns Claude into a personal strength coach that reads your real
training history from the probar API and programs your next block every couple of
weeks. New workouts flow in through the **live API** — no rebuild or commit
needed, so code and content stay separate.

- [`PROMPT.md`](PROMPT.md) — the coaching system prompt (progression rules +
  safety guardrails + the exact program JSON schema).
- [`update-workout.sh`](update-workout.sh) — fetch coaching context and upload a
  new block. `context` / `propose block.json` / `activate <id>`.

## How the loop works

1. The coach reads `GET /api/{profile,settings,programs,sessions}`.
2. It reasons about progression, adherence, and your hard constraints.
3. It uploads a new program (`author:"coach"`) and, by default, marks it
   **proposed** — the app shows "New block from your coach — Review" and you tap
   **Accept**. Flip **Auto-activate** on in the Programs tab once you trust it.
4. Every block is versioned; you can always revert to an earlier one.

## Three ways to run it (simplest first)

All of these run on a machine on your LAN — nothing is exposed to the public
internet, matching probar's pull-based CI posture.

### 1. Conversational (start here)
Just ask Claude Code, from this repo:
> "Read coach/PROMPT.md, run `./coach/update-workout.sh context`, and program my
> next block. Save it to block.json and propose it."

Great for building trust before automating.

### 2. Scheduled Claude routine (set-and-forget)
Use the `/schedule` skill (or Claude Code's routines) to run the same instruction
every ~2 weeks on your Mac. Point it at this repo so it can read `PROMPT.md` and
run the script. Set `PROBAR_URL` if the app isn't at `http://probar.k8s.home`.

### 3. In-cluster CronWorkflow (fully autonomous)
Mirror the existing CI poller (`ci-platform/`) with an Argo `CronWorkflow` that,
every two weeks, runs a small container which calls the Anthropic API with
`PROMPT.md` + the context JSON and POSTs the resulting program. Needs an
`ANTHROPIC_API_KEY` Secret. This is the hands-off end state.

## Configuration

| Env | Default | Notes |
|-----|---------|-------|
| `PROBAR_URL` | `http://probar.k8s.home` | Base URL of the app. |
| `PROBAR_WRITE_TOKEN` | _(unset)_ | Only needed if the server sets `PROBAR_WRITE_TOKEN`; sent as a bearer token on writes. |

## Example

```bash
# 1. Gather context for the coach
./coach/update-workout.sh context > context.txt

# 2. Hand context.txt + PROMPT.md to Claude; save its JSON reply as block.json

# 3. Upload it for review
./coach/update-workout.sh propose block.json
# → open the app, Programs tab, and Accept the new block
```
