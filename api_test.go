package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testServer(t *testing.T, token string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	newAPI(newTestStore(t), token).register(mux)
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	return ts
}

// do issues a request and returns status + body; token is sent as a bearer when
// non-empty.
func do(t *testing.T, ts *httptest.Server, method, path, token, body string) (int, []byte) {
	t.Helper()
	var rdr io.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, ts.URL+path, rdr)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := ts.Client().Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b
}

func TestProgramsCRUD(t *testing.T) {
	ts := testServer(t, "")

	// Seeded program is listed.
	status, body := do(t, ts, "GET", "/api/programs", "", "")
	if status != 200 {
		t.Fatalf("list programs status = %d", status)
	}
	var progs []Program
	if err := json.Unmarshal(body, &progs); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(progs) != 1 {
		t.Fatalf("want 1 seeded program, got %d", len(progs))
	}

	// Create a valid program.
	newProg := `{"name":"Test Block","author":"you","days":[{"id":"A","exercises":[{"name":"Squat","sets":3,"reps":"5"}]}]}`
	status, body = do(t, ts, "POST", "/api/programs", "", newProg)
	if status != 201 {
		t.Fatalf("create program status = %d, body=%s", status, body)
	}
	var created Program
	json.Unmarshal(body, &created)
	if created.ID == "" {
		t.Fatal("created program missing id")
	}

	// Fetch it back.
	status, _ = do(t, ts, "GET", "/api/programs/"+created.ID, "", "")
	if status != 200 {
		t.Errorf("get program status = %d", status)
	}

	// Invalid program is rejected.
	status, _ = do(t, ts, "POST", "/api/programs", "", `{"name":""}`)
	if status != 400 {
		t.Errorf("invalid program status = %d, want 400", status)
	}

	// Delete it.
	status, _ = do(t, ts, "DELETE", "/api/programs/"+created.ID, "", "")
	if status != 204 {
		t.Errorf("delete status = %d, want 204", status)
	}
	status, _ = do(t, ts, "GET", "/api/programs/"+created.ID, "", "")
	if status != 404 {
		t.Errorf("get deleted status = %d, want 404", status)
	}
}

func TestSessionsLifecycle(t *testing.T) {
	ts := testServer(t, "")

	sess := `{"date":"2026-07-02","programId":"prog_seed_fullbody","dayId":"A","exercises":[{"name":"Goblet Squat","setsPlanned":3,"setsCompleted":3,"weight":45,"unit":"lb"}]}`
	status, body := do(t, ts, "POST", "/api/sessions", "", sess)
	if status != 201 {
		t.Fatalf("create session status = %d, body=%s", status, body)
	}
	var created Session
	json.Unmarshal(body, &created)
	if created.ID == "" {
		t.Fatal("session missing id")
	}

	// since filter excludes older-than dates.
	status, body = do(t, ts, "GET", "/api/sessions?since=2026-07-01", "", "")
	if status != 200 {
		t.Fatalf("list sessions status = %d", status)
	}
	var list []Session
	json.Unmarshal(body, &list)
	if len(list) != 1 {
		t.Errorf("since filter returned %d, want 1", len(list))
	}

	_, b := do(t, ts, "GET", "/api/sessions?since=2026-08-01", "", "")
	var none []Session
	json.Unmarshal(b, &none)
	if len(none) != 0 {
		t.Errorf("future since returned %d, want 0", len(none))
	}

	status, _ = do(t, ts, "DELETE", "/api/sessions/"+created.ID, "", "")
	if status != 204 {
		t.Errorf("delete session status = %d, want 204", status)
	}
}

func TestSettingsAndProfile(t *testing.T) {
	ts := testServer(t, "")

	status, body := do(t, ts, "GET", "/api/settings", "", "")
	if status != 200 {
		t.Fatalf("get settings status = %d", status)
	}
	var set Settings
	json.Unmarshal(body, &set)
	set.WeeklyGoal = 5
	set.CoachMessage = "focus on pull strength"
	buf, _ := json.Marshal(set)
	status, _ = do(t, ts, "PUT", "/api/settings", "", string(buf))
	if status != 200 {
		t.Errorf("put settings status = %d", status)
	}
	_, body = do(t, ts, "GET", "/api/settings", "", "")
	json.Unmarshal(body, &set)
	if set.WeeklyGoal != 5 || set.CoachMessage != "focus on pull strength" {
		t.Errorf("settings not persisted: %+v", set)
	}

	status, body = do(t, ts, "GET", "/api/profile", "", "")
	if status != 200 {
		t.Fatalf("get profile status = %d", status)
	}
	var prof Profile
	json.Unmarshal(body, &prof)
	if len(prof.Constraints) == 0 {
		t.Error("default profile has no constraints")
	}
}

func TestWriteTokenGuard(t *testing.T) {
	ts := testServer(t, "s3cret")
	prog := `{"name":"Guarded","days":[{"id":"A","exercises":[{"name":"x","sets":1}]}]}`

	// Reads stay open.
	if status, _ := do(t, ts, "GET", "/api/programs", "", ""); status != 200 {
		t.Errorf("read without token = %d, want 200", status)
	}
	// Writes without the token are rejected.
	if status, _ := do(t, ts, "POST", "/api/programs", "", prog); status != 401 {
		t.Errorf("write without token = %d, want 401", status)
	}
	// Writes with the token succeed.
	if status, _ := do(t, ts, "POST", "/api/programs", "s3cret", prog); status != 201 {
		t.Errorf("write with token = %d, want 201", status)
	}
}

func TestMethodNotAllowed(t *testing.T) {
	ts := testServer(t, "")
	// /api/programs has GET+POST but not DELETE — the mux should 405.
	if status, _ := do(t, ts, "DELETE", "/api/programs", "", ""); status != 405 {
		t.Errorf("DELETE /api/programs = %d, want 405", status)
	}
}

// A session carrying RPE, a note, and swim distance must round-trip intact —
// these are the fields the coach reads to decide progression, and before 0.3.0
// nothing could write them.
func TestSessionCoachFieldsRoundTrip(t *testing.T) {
	ts := testServer(t, "")

	sess := `{"date":"2026-10-28","programId":"prog_seed_fullbody","dayId":"A",` +
		`"rpe":8,"note":"back felt fine, swim after",` +
		`"activity":"Freestyle swim","distance":1000,"distanceUnit":"yd",` +
		`"exercises":[{"name":"Goblet Squat","setsPlanned":3,"setsCompleted":3,"weight":50,"unit":"lb"}]}`
	status, body := do(t, ts, "POST", "/api/sessions", "", sess)
	if status != 201 {
		t.Fatalf("create status = %d, body=%s", status, body)
	}

	_, body = do(t, ts, "GET", "/api/sessions", "", "")
	var list []Session
	json.Unmarshal(body, &list)
	if len(list) != 1 {
		t.Fatalf("got %d sessions, want 1", len(list))
	}
	got := list[0]
	if got.RPE != 8 {
		t.Errorf("rpe = %d, want 8", got.RPE)
	}
	if got.Note != "back felt fine, swim after" {
		t.Errorf("note = %q", got.Note)
	}
	if got.Activity != "Freestyle swim" || got.Distance != 1000 || got.DistanceUnit != "yd" {
		t.Errorf("activity/distance = %q/%v/%q, want Freestyle swim/1000/yd", got.Activity, got.Distance, got.DistanceUnit)
	}
}

// A session with no coach fields must not sprout zero values — omitempty keeps
// existing sessions.json byte-identical.
func TestSessionWithoutCoachFieldsOmitsThem(t *testing.T) {
	ts := testServer(t, "")

	sess := `{"date":"2026-10-28","programId":"prog_seed_fullbody","dayId":"A","exercises":[]}`
	if status, body := do(t, ts, "POST", "/api/sessions", "", sess); status != 201 {
		t.Fatalf("create status = %d, body=%s", status, body)
	}
	_, body := do(t, ts, "GET", "/api/sessions", "", "")
	for _, k := range []string{"rpe", "note", "activity", "distance", "distanceUnit"} {
		if strings.Contains(string(body), `"`+k+`"`) {
			t.Errorf("response unexpectedly contains %q: %s", k, body)
		}
	}
}

func TestSessionValidationRejectsBadFields(t *testing.T) {
	ts := testServer(t, "")

	cases := []struct {
		name string
		body string
	}{
		{"rpe above range", `{"dayId":"A","rpe":47,"exercises":[]}`},
		{"rpe negative", `{"dayId":"A","rpe":-1,"exercises":[]}`},
		{"negative distance", `{"dayId":"A","distance":-5,"exercises":[]}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			status, body := do(t, ts, "POST", "/api/sessions", "", c.body)
			if status != 400 {
				t.Errorf("status = %d, want 400 (body=%s)", status, body)
			}
		})
	}

	// Boundaries must be accepted, or the UI's 1-10 picker would be rejected.
	for _, rpe := range []string{"0", "1", "10"} {
		status, body := do(t, ts, "POST", "/api/sessions", "", `{"dayId":"A","rpe":`+rpe+`,"exercises":[]}`)
		if status != 201 {
			t.Errorf("rpe %s: status = %d, want 201 (body=%s)", rpe, status, body)
		}
	}
}

// A standalone swim (no program, no exercises) must be storable — the user
// sometimes swims on days they don't lift.
func TestStandaloneSwimSession(t *testing.T) {
	ts := testServer(t, "")

	sess := `{"date":"2026-10-28","programId":"","dayId":"Swim","exercises":[],` +
		`"activity":"Freestyle swim","distance":1200,"distanceUnit":"yd"}`
	status, body := do(t, ts, "POST", "/api/sessions", "", sess)
	if status != 201 {
		t.Fatalf("create status = %d, body=%s", status, body)
	}
	var created Session
	json.Unmarshal(body, &created)
	if created.ID == "" {
		t.Fatal("standalone swim missing id")
	}
	if created.Distance != 1200 || created.DayID != "Swim" {
		t.Errorf("distance/dayId = %v/%q, want 1200/Swim", created.Distance, created.DayID)
	}
}
