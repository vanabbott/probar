#!/usr/bin/env bash
#
# Coach helper for the probar workout app. Three uses:
#
#   ./update-workout.sh context               # dump profile + settings + programs + sessions
#   ./update-workout.sh propose  block.json   # upload a program (author=coach) and mark it PROPOSED
#   ./update-workout.sh activate <programId>  # set a program active directly (skip review)
#
# The typical loop: run `context`, hand the output to Claude with PROMPT.md,
# save the JSON it returns to block.json, then run `propose block.json`.
#
# Config via env:
#   PROBAR_URL          base URL (default http://probar.k8s.home)
#   PROBAR_WRITE_TOKEN  bearer token, only if the server sets one
#
# Note: run this from a machine on the same LAN as the cluster (nothing is
# exposed to the public internet).
set -eo pipefail

BASE="${PROBAR_URL:-http://probar.k8s.home}"
TOKEN="${PROBAR_WRITE_TOKEN:-}"

auth=()
if [ -n "$TOKEN" ]; then auth=(-H "Authorization: Bearer $TOKEN"); fi

cmd="${1:-context}"
case "$cmd" in
  context)
    echo "### PROFILE";                 curl -fsSL "$BASE/api/profile"
    echo; echo "### SETTINGS";          curl -fsSL "$BASE/api/settings"
    echo; echo "### PROGRAMS (library)"; curl -fsSL "$BASE/api/programs"
    echo; echo "### SESSIONS (history)"; curl -fsSL "$BASE/api/sessions"
    echo
    ;;

  propose)
    file="${2:?usage: $0 propose block.json}"
    id=$(curl -fsSL "${auth[@]}" -X POST "$BASE/api/programs" \
           -H 'Content-Type: application/json' --data-binary @"$file" \
         | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
    echo "uploaded program: $id"
    curl -fsSL "$BASE/api/settings" \
      | python3 -c "import sys,json; s=json.load(sys.stdin); s['proposedProgramId']='$id'; print(json.dumps(s))" \
      | curl -fsSL "${auth[@]}" -X PUT "$BASE/api/settings" \
          -H 'Content-Type: application/json' --data-binary @- >/dev/null
    echo "marked as proposed — review it on the app's Programs tab."
    ;;

  activate)
    id="${2:?usage: $0 activate <programId>}"
    curl -fsSL "$BASE/api/settings" \
      | python3 -c "import sys,json; s=json.load(sys.stdin); s['activeProgramId']='$id'; s['proposedProgramId']=''; print(json.dumps(s))" \
      | curl -fsSL "${auth[@]}" -X PUT "$BASE/api/settings" \
          -H 'Content-Type: application/json' --data-binary @- >/dev/null
    echo "activated $id"
    ;;

  *)
    echo "usage: $0 {context | propose block.json | activate <programId>}" >&2
    exit 1
    ;;
esac
