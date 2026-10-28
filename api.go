package main

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
)

// api serves the workout JSON REST endpoints under /api. Reads are open; mutating
// methods pass through guard, which enforces a bearer token when one is
// configured (PROBAR_WRITE_TOKEN). The app is LAN-only and single-user, so the
// token is off by default and exists only to harden the day it's ever exposed.
type api struct {
	store *Store
	token string
}

func newAPI(store *Store, token string) *api {
	return &api{store: store, token: token}
}

// register wires the routes onto the shared mux using Go 1.22 method+wildcard
// patterns. These are more specific than the "/" catch-all, so they take
// precedence, and the mux returns 405 automatically for unhandled methods.
func (a *api) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/programs", a.listPrograms)
	mux.HandleFunc("POST /api/programs", a.guard(a.createProgram))
	mux.HandleFunc("GET /api/programs/{id}", a.getProgram)
	mux.HandleFunc("PUT /api/programs/{id}", a.guard(a.updateProgram))
	mux.HandleFunc("DELETE /api/programs/{id}", a.guard(a.deleteProgram))

	mux.HandleFunc("GET /api/sessions", a.listSessions)
	mux.HandleFunc("POST /api/sessions", a.guard(a.createSession))
	mux.HandleFunc("DELETE /api/sessions/{id}", a.guard(a.deleteSession))

	mux.HandleFunc("GET /api/settings", a.getSettings)
	mux.HandleFunc("PUT /api/settings", a.guard(a.putSettings))

	mux.HandleFunc("GET /api/profile", a.getProfile)
	mux.HandleFunc("PUT /api/profile", a.guard(a.putProfile))
}

// ---- programs --------------------------------------------------------------

func (a *api) listPrograms(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.store.Programs())
}

func (a *api) getProgram(w http.ResponseWriter, r *http.Request) {
	p, ok := a.store.Program(r.PathValue("id"))
	if !ok {
		httpError(w, http.StatusNotFound, "program not found")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (a *api) createProgram(w http.ResponseWriter, r *http.Request) {
	var p Program
	if !decode(w, r, &p) {
		return
	}
	if p.Author == "" {
		p.Author = "you"
	}
	if err := p.Validate(); err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := a.store.SaveProgram(p)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (a *api) updateProgram(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok := a.store.Program(id); !ok {
		httpError(w, http.StatusNotFound, "program not found")
		return
	}
	var p Program
	if !decode(w, r, &p) {
		return
	}
	p.ID = id
	if err := p.Validate(); err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := a.store.SaveProgram(p)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (a *api) deleteProgram(w http.ResponseWriter, r *http.Request) {
	ok, err := a.store.DeleteProgram(r.PathValue("id"))
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		httpError(w, http.StatusNotFound, "program not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- sessions --------------------------------------------------------------

func (a *api) listSessions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.store.Sessions(r.URL.Query().Get("since")))
}

func (a *api) createSession(w http.ResponseWriter, r *http.Request) {
	var se Session
	if !decode(w, r, &se) {
		return
	}
	if err := se.Validate(); err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	saved, err := a.store.CreateSession(se)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (a *api) deleteSession(w http.ResponseWriter, r *http.Request) {
	ok, err := a.store.DeleteSession(r.PathValue("id"))
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		httpError(w, http.StatusNotFound, "session not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- settings & profile ----------------------------------------------------

func (a *api) getSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.store.Settings())
}

func (a *api) putSettings(w http.ResponseWriter, r *http.Request) {
	var set Settings
	if !decode(w, r, &set) {
		return
	}
	saved, err := a.store.SetSettings(set)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (a *api) getProfile(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.store.Profile())
}

func (a *api) putProfile(w http.ResponseWriter, r *http.Request) {
	var p Profile
	if !decode(w, r, &p) {
		return
	}
	saved, err := a.store.SetProfile(p)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

// ---- middleware & helpers --------------------------------------------------

func (a *api) guard(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.token != "" {
			got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if subtle.ConstantTimeCompare([]byte(got), []byte(a.token)) != 1 {
				httpError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
		}
		next(w, r)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// decode reads a JSON request body (capped at 1 MB) into v, writing a 400 on
// failure. Unknown fields are tolerated for forward compatibility.
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	defer r.Body.Close()
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	if err := dec.Decode(v); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return false
	}
	return true
}
