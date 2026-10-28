package main

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	return s
}

func TestNewStoreSeeds(t *testing.T) {
	dir := t.TempDir()
	s, err := NewStore(dir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	progs := s.Programs()
	if len(progs) != 1 {
		t.Fatalf("want 1 seeded program, got %d", len(progs))
	}
	seed := progs[0]
	if seed.ID != "prog_seed_fullbody" {
		t.Errorf("seed program id = %q", seed.ID)
	}
	if len(seed.Days) != 3 {
		t.Errorf("seed program days = %d, want 3", len(seed.Days))
	}

	if got := s.Settings().ActiveProgramID; got != seed.ID {
		t.Errorf("active program = %q, want %q", got, seed.ID)
	}
	if len(s.Profile().Constraints) == 0 {
		t.Error("seeded profile has no constraints")
	}

	// The seed files must be written to disk, not just held in memory.
	for _, name := range []string{"programs.json", "settings.json", "profile.json", "sessions.json"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("expected %s on disk: %v", name, err)
		}
	}
}

func TestPersistenceRoundTrip(t *testing.T) {
	dir := t.TempDir()
	s, err := NewStore(dir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	p, err := s.SaveProgram(Program{Name: "Custom", Author: "you", Days: []Day{{ID: "A", Exercises: []Exercise{{Name: "Squat", Sets: 3}}}}})
	if err != nil {
		t.Fatalf("SaveProgram: %v", err)
	}
	if p.ID == "" {
		t.Fatal("SaveProgram did not assign an id")
	}
	if _, err := s.CreateSession(Session{Date: "2026-07-01", ProgramID: p.ID, DayID: "A"}); err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	set := s.Settings()
	set.WeeklyGoal = 4
	set.ActiveProgramID = p.ID
	if _, err := s.SetSettings(set); err != nil {
		t.Fatalf("SetSettings: %v", err)
	}

	// Reload from the same dir — a new Store must see the persisted data.
	s2, err := NewStore(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if len(s2.Programs()) != 2 {
		t.Errorf("programs after reload = %d, want 2", len(s2.Programs()))
	}
	if len(s2.Sessions("")) != 1 {
		t.Errorf("sessions after reload = %d, want 1", len(s2.Sessions("")))
	}
	if s2.Settings().WeeklyGoal != 4 {
		t.Errorf("weeklyGoal after reload = %d, want 4", s2.Settings().WeeklyGoal)
	}
}

func TestProgramValidate(t *testing.T) {
	cases := []struct {
		name string
		p    Program
		ok   bool
	}{
		{"no name", Program{Days: []Day{{ID: "A", Exercises: []Exercise{{Name: "x", Sets: 1}}}}}, false},
		{"no days", Program{Name: "P"}, false},
		{"empty day", Program{Name: "P", Days: []Day{{ID: "A"}}}, false},
		{"zero sets", Program{Name: "P", Days: []Day{{ID: "A", Exercises: []Exercise{{Name: "x", Sets: 0}}}}}, false},
		{"dup day id", Program{Name: "P", Days: []Day{{ID: "A", Exercises: []Exercise{{Name: "x", Sets: 1}}}, {ID: "A", Exercises: []Exercise{{Name: "y", Sets: 1}}}}}, false},
		{"valid", Program{Name: "P", Days: []Day{{ID: "A", Exercises: []Exercise{{Name: "x", Sets: 3}}}}}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.p.Validate()
			if c.ok && err != nil {
				t.Errorf("want valid, got %v", err)
			}
			if !c.ok && err == nil {
				t.Error("want error, got nil")
			}
		})
	}
}

func TestSaveProgramReplacesByID(t *testing.T) {
	s := newTestStore(t)
	p, _ := s.SaveProgram(Program{Name: "V1", Author: "you", Days: []Day{{ID: "A", Exercises: []Exercise{{Name: "x", Sets: 1}}}}})
	p.Name = "V2"
	if _, err := s.SaveProgram(p); err != nil {
		t.Fatalf("SaveProgram replace: %v", err)
	}
	if got := len(s.Programs()); got != 2 { // seed + this one
		t.Fatalf("programs = %d, want 2 (no duplicate)", got)
	}
	reloaded, ok := s.Program(p.ID)
	if !ok || reloaded.Name != "V2" {
		t.Errorf("program not replaced in place: %+v ok=%v", reloaded, ok)
	}
}

func TestDeleteProgramAndSession(t *testing.T) {
	s := newTestStore(t)
	p, _ := s.SaveProgram(Program{Name: "Tmp", Days: []Day{{ID: "A", Exercises: []Exercise{{Name: "x", Sets: 1}}}}})
	ok, err := s.DeleteProgram(p.ID)
	if err != nil || !ok {
		t.Fatalf("DeleteProgram ok=%v err=%v", ok, err)
	}
	if _, found := s.Program(p.ID); found {
		t.Error("program still present after delete")
	}
	if ok, _ := s.DeleteProgram("nope"); ok {
		t.Error("deleting missing program reported ok")
	}

	se, _ := s.CreateSession(Session{Date: "2026-07-01"})
	if ok, _ := s.DeleteSession(se.ID); !ok {
		t.Error("DeleteSession missed existing session")
	}
	if len(s.Sessions("")) != 0 {
		t.Error("session not removed")
	}
}

func TestSessionsSinceFilter(t *testing.T) {
	s := newTestStore(t)
	for _, d := range []string{"2026-06-01", "2026-06-15", "2026-07-01"} {
		if _, err := s.CreateSession(Session{Date: d}); err != nil {
			t.Fatal(err)
		}
	}
	if got := len(s.Sessions("2026-06-15")); got != 2 {
		t.Errorf("since filter = %d, want 2", got)
	}
	if got := len(s.Sessions("")); got != 3 {
		t.Errorf("no filter = %d, want 3", got)
	}
}

// TestConcurrentAccess is a smoke test for the mutex; run with -race.
func TestConcurrentAccess(t *testing.T) {
	s := newTestStore(t)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = s.CreateSession(Session{Date: "2026-07-01"})
			_ = s.Programs()
			_ = s.Settings()
		}()
	}
	wg.Wait()
	if len(s.Sessions("")) != 20 {
		t.Errorf("sessions = %d, want 20", len(s.Sessions("")))
	}
}

// A partial PUT must not null the hard safety constraints. This is the exact bug
// that silently emptied them in production: SetProfile was a blind whole-object
// replace, so any caller omitting the key wiped the coach's guardrail.
func TestSetProfilePreservesOmittedLists(t *testing.T) {
	s := newTestStore(t)

	before := s.Profile()
	if len(before.Constraints) == 0 {
		t.Fatal("seeded profile should have constraints")
	}

	// Simulate a partial write: goals only, every list omitted (nil).
	got, err := s.SetProfile(Profile{Goals: "just the goals"})
	if err != nil {
		t.Fatalf("SetProfile: %v", err)
	}
	if got.Goals != "just the goals" {
		t.Errorf("goals = %q, want the new value", got.Goals)
	}
	if len(got.Constraints) != len(before.Constraints) {
		t.Errorf("constraints = %d, want %d preserved", len(got.Constraints), len(before.Constraints))
	}
	if len(got.Equipment) != len(before.Equipment) {
		t.Errorf("equipment = %d, want %d preserved", len(got.Equipment), len(before.Equipment))
	}
	if len(got.Injuries) != len(before.Injuries) {
		t.Errorf("injuries = %d, want %d preserved", len(got.Injuries), len(before.Injuries))
	}
}

// An explicit empty array still clears a list — the UI always sends arrays, so
// the merge must not make lists permanently unclearable.
func TestSetProfileExplicitEmptyClears(t *testing.T) {
	s := newTestStore(t)

	got, err := s.SetProfile(Profile{Goals: "g", Constraints: []string{}})
	if err != nil {
		t.Fatalf("SetProfile: %v", err)
	}
	if len(got.Constraints) != 0 {
		t.Errorf("constraints = %d, want 0 (explicit [] should clear)", len(got.Constraints))
	}
}

// A profile.json already on disk with "constraints": null must self-repair on
// load, so an existing deployment doesn't stay unguarded.
func TestLoadBackfillsNullConstraints(t *testing.T) {
	dir := t.TempDir()
	bad := `{"goals":"g","experience":"Intermediate","daysPerWeek":3,` +
		`"equipment":["dumbbells"],"injuries":["disk"],"constraints":null,` +
		`"preferences":"p","notes":"n"}`
	if err := os.WriteFile(filepath.Join(dir, "profile.json"), []byte(bad), 0o644); err != nil {
		t.Fatalf("write profile.json: %v", err)
	}

	s, err := NewStore(dir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	prof := s.Profile()
	if len(prof.Constraints) == 0 {
		t.Fatal("constraints should have been backfilled from defaults")
	}
	if prof.Goals != "g" {
		t.Errorf("goals = %q, want the on-disk value preserved", prof.Goals)
	}

	// And the repair must be persisted, not just in memory.
	s2, err := NewStore(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if len(s2.Profile().Constraints) == 0 {
		t.Error("backfill was not written to disk")
	}
}

func TestSessionValidate(t *testing.T) {
	ok := []Session{
		{RPE: 0},
		{RPE: 1},
		{RPE: 10},
		{Distance: 0},
		{Distance: 1000, DistanceUnit: "yd"},
	}
	for _, se := range ok {
		if err := se.Validate(); err != nil {
			t.Errorf("Validate(%+v) = %v, want nil", se, err)
		}
	}
	bad := []Session{
		{RPE: 11},
		{RPE: -1},
		{Distance: -1},
	}
	for _, se := range bad {
		if err := se.Validate(); err == nil {
			t.Errorf("Validate(%+v) = nil, want error", se)
		}
	}
}
