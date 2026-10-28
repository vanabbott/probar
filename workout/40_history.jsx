// ---------------------------------------------------------------------------
// 40_history.jsx — HistoryTab: the tracking calendar. Weekly-goal ring, streaks,
// a contribution heatmap, earned badges, and the logged-session list. Everything
// is derived from data.sessions.
// ---------------------------------------------------------------------------
// computeStats/computePRs/evaluateBadges (15_stats), the widgets (20_ui), and
// helpers (10_lib) resolve via the shared script scope.

function HistoryTab({ data, actions }) {
  const { sessions, settings, programs } = data;
  const stats = useMemo(() => computeStats(sessions, settings), [sessions, settings]);
  const prs = useMemo(() => computePRs(sessions), [sessions]);
  const badges = useMemo(() => evaluateBadges(stats, sessions, prs), [stats, sessions, prs]);
  const earnedCount = badges.filter((b) => b.earned).length;

  const ordered = useMemo(
    () => sessions.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [sessions]
  );

  const programLabel = (s) => {
    const p = programs.find((x) => x.id === s.programId);
    const d = p && p.days.find((x) => x.id === s.dayId);
    if (p && d) return d.label + " · " + d.focus;
    if (p) return p.name;
    return s.dayId || "Workout";
  };

  const remaining = Math.max(0, stats.goal - stats.thisWeek);

  // A swim with no strength work: no programId, no exercises. programLabel's
  // fallback renders it as "Swim", and isStrengthSession keeps it out of the
  // workout count and the 10/50/100 badges.
  const logSwim = () => {
    const raw = window.prompt("How far did you swim? (yards)", String(stats.lastDistance || 1000));
    if (raw === null) return;
    const d = parseFloat(raw);
    if (!(d > 0)) { window.alert("Enter a distance greater than 0."); return; }
    actions.logSession({
      date: todayStr(),
      programId: "",
      dayId: "Swim",
      completedAt: Date.now(),
      exercises: [],
      activity: "Freestyle swim",
      distance: d,
      distanceUnit: stats.distanceUnit || "yd",
    });
  };

  return (
    <div style={{ padding: "20px 18px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Your History</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 20px" }}>Consistency beats intensity. Get your {stats.goal} days in each week.</p>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, ...PB.CARD, padding: 16 }}>
        <GoalRing value={stats.thisWeek} goal={stats.goal} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            {stats.thisWeek >= stats.goal ? "🎯 Goal hit this week!" : remaining + " to go this week"}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
            {stats.currentStreak > 0
              ? "You're on a " + stats.currentStreak + "-week streak 🔥"
              : "Log " + stats.goal + " days this week to start a streak."}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <Stat value={stats.totalSessions} label="Workouts" />
        <Stat value={stats.currentStreak} label="Streak" color="var(--warn)" />
        <Stat value={stats.longestStreak} label="Best" color="var(--success)" />
      </div>

      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Activity</h3>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>last 18 weeks</span>
      </div>
      <div style={{ ...PB.CARD, padding: 14, marginBottom: 22 }}>
        <Heatmap sessions={sessions} weekStartsOn={stats.weekStartsOn} />
      </div>

      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Badges</h3>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{earnedCount}/{badges.length}</span>
      </div>
      <div style={{ marginBottom: 24 }}>
        <BadgeGrid badges={badges} earnedDates={settings.earnedBadges} />
      </div>

      {/* Swims usually ride along with a strength session (logged in the wrap-up
          sheet), but they also happen on their own — hence the manual entry. */}
      <div style={{ ...PB.CARD, padding: 14, marginBottom: 22, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 22 }}>🏊</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
            {stats.totalDistance > 0
              ? stats.totalDistance.toLocaleString() + " " + (stats.distanceUnit || "yd")
              : "No swims logged"}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {stats.swimSessions > 0 ? "across " + stats.swimSessions + " swims" : "Log one after a workout, or on its own"}
          </div>
        </div>
        <button onClick={logSwim} style={PB.SMALL_BTN}>+ Log a swim</button>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px" }}>Recent sessions</h3>
      {ordered.length === 0 && <Banner tone="accent" title="No sessions yet">Finish a workout on the Train tab and it'll show up here.</Banner>}
      {ordered.slice(0, 40).map((s) => {
        const totalPlanned = (s.exercises || []).reduce((a, e) => a + (e.setsPlanned || 0), 0);
        const totalDone = (s.exercises || []).reduce((a, e) => a + (e.setsCompleted || 0), 0);
        return (
          <div key={s.id} style={{ ...PB.CARD, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "center", minWidth: 44 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--accent)" }}>{parseYMD(s.date).getDate()}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>{parseYMD(s.date).toLocaleDateString(undefined, { month: "short" })}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{programLabel(s)}</div>
              {/* The sets clause is guarded so a conditioning-only entry reads as
                  "🏊 1000 yd" rather than "0/0 sets". */}
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {[
                  totalPlanned > 0 ? totalDone + "/" + totalPlanned + " sets" : null,
                  s.distance > 0 ? "🏊 " + s.distance + " " + (s.distanceUnit || "yd") : null,
                  s.rpe ? "RPE " + s.rpe : null,
                  s._queued ? "will sync" : null,
                ].filter(Boolean).join(" · ")}
              </div>
              {s.note && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, opacity: 0.85, fontStyle: "italic" }}>{s.note}</div>
              )}
            </div>
            <button onClick={() => { if (window.confirm("Delete this session?")) actions.deleteSession(s.id); }}
              style={{ ...PB.SMALL_BTN, color: "var(--danger)", borderColor: "var(--danger-border)" }}>Delete</button>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(PB, { HistoryTab });
