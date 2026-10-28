package main

import (
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// seedProgramJSON is the starter workout program baked into the binary. It is
// written to programs.json on first boot (when the data dir is empty) so a fresh
// install has something to train with — the original back-safe A/B/C split.
//
//go:embed seed_program.json
var seedProgramJSON []byte

// ---- domain types ----------------------------------------------------------

// Exercise is one movement within a workout day. Rest is per-exercise rest in
// seconds (0 falls back to Settings.RestDefaultSec); Key marks the movements the
// coach considers non-negotiable; TargetWeight is an optional coach hint.
type Exercise struct {
	Name         string `json:"name"`
	Sets         int    `json:"sets"`
	Reps         string `json:"reps"`
	Notes        string `json:"notes,omitempty"`
	Rest         int    `json:"rest,omitempty"`
	Key          bool   `json:"key,omitempty"`
	TargetWeight string `json:"targetWeight,omitempty"`
}

// Day is one training day (e.g. "Day A · Push + Core").
type Day struct {
	ID        string     `json:"id"`
	Label     string     `json:"label"`
	Focus     string     `json:"focus"`
	Color     string     `json:"color"`
	Exercises []Exercise `json:"exercises"`
}

// PhaseItem is a warm-up or cool-down step (name + detail).
type PhaseItem struct {
	Name   string `json:"name"`
	Detail string `json:"detail"`
}

// Program is a named collection of training days plus shared warm-up/cool-down.
// Author is "seed", "coach" (Claude), or "you" (built in the app).
type Program struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Author    string      `json:"author"`
	CreatedAt string      `json:"createdAt"`
	CoachNote string      `json:"coachNote,omitempty"`
	Warmup    []PhaseItem `json:"warmup"`
	Cooldown  []PhaseItem `json:"cooldown"`
	Days      []Day       `json:"days"`
}

// Validate rejects structurally broken programs so a bad upload (e.g. from the
// coach routine) can never be stored or activated.
func (p Program) Validate() error {
	if strings.TrimSpace(p.Name) == "" {
		return errors.New("program name is required")
	}
	if len(p.Days) == 0 {
		return errors.New("program needs at least one day")
	}
	seen := map[string]bool{}
	for _, d := range p.Days {
		if strings.TrimSpace(d.ID) == "" {
			return errors.New("each day needs an id")
		}
		if seen[d.ID] {
			return fmt.Errorf("duplicate day id %q", d.ID)
		}
		seen[d.ID] = true
		if len(d.Exercises) == 0 {
			return fmt.Errorf("day %q has no exercises", d.ID)
		}
		for _, e := range d.Exercises {
			if strings.TrimSpace(e.Name) == "" {
				return fmt.Errorf("day %q has an unnamed exercise", d.ID)
			}
			if e.Sets <= 0 {
				return fmt.Errorf("exercise %q needs sets > 0", e.Name)
			}
		}
	}
	return nil
}

// SessionExercise is the logged result for one exercise in a completed session.
type SessionExercise struct {
	Name          string  `json:"name"`
	SetsPlanned   int     `json:"setsPlanned"`
	SetsCompleted int     `json:"setsCompleted"`
	Weight        float64 `json:"weight,omitempty"`
	Unit          string  `json:"unit,omitempty"`
	Reps          string  `json:"reps,omitempty"`
}

// Session is one logged workout — the unit of history that drives the calendar,
// streaks, PRs, and badges. Date is the client's local YYYY-MM-DD.
type Session struct {
	ID          string            `json:"id"`
	Date        string            `json:"date"`
	ProgramID   string            `json:"programId"`
	DayID       string            `json:"dayId"`
	StartedAt   int64             `json:"startedAt,omitempty"`
	CompletedAt int64             `json:"completedAt,omitempty"`
	Exercises   []SessionExercise `json:"exercises"`
	RPE         int               `json:"rpe,omitempty"`
	Note        string            `json:"note,omitempty"`

	// Conditioning logged alongside (or instead of) the strength work — e.g. the
	// lap swim that follows most sessions. Session-level on purpose: putting
	// distance in SessionExercise would feed it into the PR and set math, where
	// a 1000 yd swim would read as a 1000 lb lift.
	Activity     string  `json:"activity,omitempty"`     // e.g. "Freestyle swim"
	Distance     float64 `json:"distance,omitempty"`
	DistanceUnit string  `json:"distanceUnit,omitempty"` // "yd", "m", "mi", "km"
}

// Validate rejects sessions whose coach-facing fields are out of range, so a bad
// write can't quietly skew the next coaching decision. Deliberately narrow: the
// UI's pill picker and numeric input cannot produce a rejected payload, which
// matters because the offline queue retries anything that isn't a 4xx.
func (se Session) Validate() error {
	if se.RPE < 0 || se.RPE > 10 {
		return fmt.Errorf("rpe must be between 0 and 10, got %d", se.RPE)
	}
	if se.Distance < 0 {
		return fmt.Errorf("distance cannot be negative, got %v", se.Distance)
	}
	return nil
}

// Settings holds user preferences and the coach handshake state. ActiveProgramID
// is what Train renders; ProposedProgramID is a coach block awaiting review.
type Settings struct {
	WeeklyGoal        int               `json:"weeklyGoal"`
	WeekStartsOn      int               `json:"weekStartsOn"` // 0=Sun, 1=Mon
	Units             string            `json:"units"`
	RestDefaultSec    int               `json:"restDefaultSec"`
	ActiveProgramID   string            `json:"activeProgramId"`
	ProposedProgramID string            `json:"proposedProgramId,omitempty"`
	AutoActivate      bool              `json:"autoActivate"`
	CoachMessage      string            `json:"coachMessage,omitempty"`
	EarnedBadges      map[string]string `json:"earnedBadges"`
}

func (st Settings) clone() Settings {
	m := make(map[string]string, len(st.EarnedBadges))
	for k, v := range st.EarnedBadges {
		m[k] = v
	}
	st.EarnedBadges = m
	return st
}

// Profile is the coach's durable memory: goals, equipment, and hard safety
// constraints it must honor on every run.
type Profile struct {
	Goals       string   `json:"goals"`
	Experience  string   `json:"experience"`
	DaysPerWeek int      `json:"daysPerWeek"`
	Equipment   []string `json:"equipment"`
	Injuries    []string `json:"injuries"`
	Constraints []string `json:"constraints"`
	Preferences string   `json:"preferences"`
	Notes       string   `json:"notes"`
}

func (p Profile) clone() Profile {
	cp := func(in []string) []string {
		if in == nil {
			return nil
		}
		return append([]string(nil), in...)
	}
	p.Equipment = cp(p.Equipment)
	p.Injuries = cp(p.Injuries)
	p.Constraints = cp(p.Constraints)
	return p
}

// ---- defaults --------------------------------------------------------------

func defaultSettings(activeID string) Settings {
	return Settings{
		WeeklyGoal:      3,
		WeekStartsOn:    1,
		Units:           "lb",
		RestDefaultSec:  60,
		ActiveProgramID: activeID,
		AutoActivate:    false,
		EarnedBadges:    map[string]string{},
	}
}

func defaultProfile() Profile {
	return Profile{
		Goals:       "Build consistent strength and stay back-safe.",
		Experience:  "beginner",
		DaysPerWeek: 3,
		Equipment:   []string{"dumbbells", "cables", "machines", "benches"},
		Injuries:    []string{"herniated lumbar disk (recovering)"},
		Constraints: []string{
			"No barbell back squats or conventional deadlifts yet",
			"Lower back stays flat (not arched) during all core work",
			"Include Face Pull and Bird-Dog every session",
			"Start lighter than feels necessary; stop on sharp or radiating pain",
		},
		Preferences: "Full-body 3x/week; back-safe hip hinges over spinal loading.",
	}
}

// ---- store -----------------------------------------------------------------

// Store is an in-memory snapshot of the workout data backed by JSON files in a
// data directory. It is safe for concurrent use; every mutation persists the
// affected file atomically (write temp, then rename). No database, so the binary
// stays dependency-free and the image stays distroless-static.
type Store struct {
	dir      string
	mu       sync.RWMutex
	programs []Program
	sessions []Session
	settings Settings
	profile  Profile
}

// NewStore creates the data dir if needed, loads existing files, and seeds any
// that are missing (programs from the embedded seed, plus default settings and
// profile) so a fresh install is immediately usable.
func NewStore(dir string) (*Store, error) {
	s := &Store{dir: dir}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) path(name string) string { return filepath.Join(s.dir, name) }

func (s *Store) readFile(name string, v any) error {
	b, err := os.ReadFile(s.path(name))
	if err != nil {
		return err // may be os.ErrNotExist — callers seed in that case
	}
	return json.Unmarshal(b, v)
}

func (s *Store) writeFile(name string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path(name) + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path(name))
}

func (s *Store) load() error {
	// Programs — seed from the embedded starter program on first boot.
	var progs []Program
	if err := s.readFile("programs.json", &progs); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("read programs: %w", err)
		}
		var seed Program
		if err := json.Unmarshal(seedProgramJSON, &seed); err != nil {
			return fmt.Errorf("parse seed program: %w", err)
		}
		progs = []Program{seed}
		if err := s.writeFile("programs.json", progs); err != nil {
			return err
		}
	}
	s.programs = progs

	// Settings — default with the first program active.
	var set Settings
	if err := s.readFile("settings.json", &set); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("read settings: %w", err)
		}
		active := ""
		if len(s.programs) > 0 {
			active = s.programs[0].ID
		}
		set = defaultSettings(active)
		if err := s.writeFile("settings.json", set); err != nil {
			return err
		}
	}
	if set.EarnedBadges == nil {
		set.EarnedBadges = map[string]string{}
	}
	s.settings = set

	// Profile — default back-safe profile.
	var prof Profile
	if err := s.readFile("profile.json", &prof); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("read profile: %w", err)
		}
		prof = defaultProfile()
		if err := s.writeFile("profile.json", prof); err != nil {
			return err
		}
	}
	// Repair a profile whose constraints were nulled by an earlier partial PUT.
	// These are the one field the coach prompt treats as non-negotiable, so an
	// empty list is a safety problem, not just missing data.
	if prof.Constraints == nil {
		prof.Constraints = defaultProfile().Constraints
		if err := s.writeFile("profile.json", prof); err != nil {
			return err
		}
	}
	s.profile = prof

	// Sessions — start empty.
	var sess []Session
	if err := s.readFile("sessions.json", &sess); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("read sessions: %w", err)
		}
		sess = []Session{}
		if err := s.writeFile("sessions.json", sess); err != nil {
			return err
		}
	}
	s.sessions = sess
	return nil
}

// ---- programs --------------------------------------------------------------

func (s *Store) Programs() []Program {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]Program(nil), s.programs...)
}

func (s *Store) Program(id string) (Program, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.programs {
		if p.ID == id {
			return p, true
		}
	}
	return Program{}, false
}

// SaveProgram creates a new program or replaces an existing one with the same ID
// (used by both the builder and the coach upload). It assigns an ID and
// createdAt when missing.
func (s *Store) SaveProgram(p Program) (Program, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p.ID == "" {
		p.ID = genID("prog_")
	}
	if p.CreatedAt == "" {
		p.CreatedAt = time.Now().UTC().Format("2006-01-02")
	}
	replaced := false
	for i := range s.programs {
		if s.programs[i].ID == p.ID {
			s.programs[i] = p
			replaced = true
			break
		}
	}
	if !replaced {
		s.programs = append(s.programs, p)
	}
	if err := s.writeFile("programs.json", s.programs); err != nil {
		return Program{}, err
	}
	return p, nil
}

func (s *Store) DeleteProgram(id string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := -1
	for i := range s.programs {
		if s.programs[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return false, nil
	}
	// Cap the low slice so append allocates rather than clobbering the backing
	// array shared with earlier reads.
	s.programs = append(s.programs[:idx:idx], s.programs[idx+1:]...)
	if err := s.writeFile("programs.json", s.programs); err != nil {
		return true, err
	}
	return true, nil
}

// ---- sessions --------------------------------------------------------------

// Sessions returns logged sessions, optionally filtered to date >= since
// (YYYY-MM-DD, lexicographic compare works for ISO dates).
func (s *Store) Sessions(since string) []Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Session, 0, len(s.sessions))
	for _, se := range s.sessions {
		if since == "" || se.Date >= since {
			out = append(out, se)
		}
	}
	return out
}

func (s *Store) CreateSession(se Session) (Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if se.ID == "" {
		se.ID = genID("sess_")
	}
	if se.Date == "" {
		se.Date = time.Now().UTC().Format("2006-01-02")
	}
	s.sessions = append(s.sessions, se)
	if err := s.writeFile("sessions.json", s.sessions); err != nil {
		return Session{}, err
	}
	return se, nil
}

func (s *Store) DeleteSession(id string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := -1
	for i := range s.sessions {
		if s.sessions[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return false, nil
	}
	s.sessions = append(s.sessions[:idx:idx], s.sessions[idx+1:]...)
	if err := s.writeFile("sessions.json", s.sessions); err != nil {
		return true, err
	}
	return true, nil
}

// ---- settings & profile ----------------------------------------------------

func (s *Store) Settings() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings.clone()
}

func (s *Store) SetSettings(set Settings) (Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if set.EarnedBadges == nil {
		set.EarnedBadges = map[string]string{}
	}
	if set.WeeklyGoal <= 0 {
		set.WeeklyGoal = 1
	}
	if set.RestDefaultSec <= 0 {
		set.RestDefaultSec = 60
	}
	if set.Units == "" {
		set.Units = "lb"
	}
	s.settings = set
	if err := s.writeFile("settings.json", s.settings); err != nil {
		return Settings{}, err
	}
	return s.settings.clone(), nil
}

func (s *Store) Profile() Profile {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.profile.clone()
}

// SetProfile replaces the stored profile, except that a nil list is treated as
// "not supplied" and keeps its current value. Without this a partial PUT (a
// hand-rolled curl, or a coach run sending only goals) silently nulls the hard
// safety constraints — which is exactly how they were lost once already. An
// explicit empty array still clears a list, since the UI's fromForm always sends
// an array; only an omitted key is preserved. The tradeoff: a caller can no
// longer clear a list by leaving the key out, and must send [] instead.
func (s *Store) SetProfile(p Profile) (Profile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p.Constraints == nil {
		p.Constraints = s.profile.Constraints
	}
	if p.Equipment == nil {
		p.Equipment = s.profile.Equipment
	}
	if p.Injuries == nil {
		p.Injuries = s.profile.Injuries
	}
	s.profile = p
	if err := s.writeFile("profile.json", s.profile); err != nil {
		return Profile{}, err
	}
	return s.profile.clone(), nil
}

// ---- helpers ---------------------------------------------------------------

// genID returns a short unique id like "prog_9f8c1a2b3c4d".
func genID(prefix string) string {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return prefix + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return prefix + hex.EncodeToString(b)
}
