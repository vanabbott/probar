// ---------------------------------------------------------------------------
// 15_stats.jsx — pure derivations over the session log. Sessions are the single
// source of truth; streaks, weekly-goal progress, PRs, and badges are all
// computed here (no backend logic) and reused by History and Progress.
// ---------------------------------------------------------------------------
// Helpers (ymd, parseYMD, addDays, startOfWeek, weekKey, todayStr) come from
// 10_lib.jsx via the shared script scope — see 10_lib.jsx's header note.

// A session with no planned sets is conditioning only (a standalone swim), not a
// strength workout. The distinction matters for the "N Workouts" badges and the
// Workouts tile: counting swims there would fire the 10/50/100 badges at half the
// real work. Training DATES still count toward the weekly goal either way —
// swimming is training.
function isStrengthSession(s) {
  return (s.exercises || []).some((e) => (e.setsPlanned || 0) > 0);
}

// computeStats reduces the session log to the numbers the gamification UI needs.
// A "week" counts unique training DATES (two sessions in a day still count once)
// against the weekly goal. The current streak lets the in-progress week not yet
// meet goal without breaking a streak that's alive through last week.
function computeStats(sessions, settings) {
  const weekStartsOn = settings && typeof settings.weekStartsOn === "number" ? settings.weekStartsOn : 1;
  const goal = (settings && settings.weeklyGoal) || 3;

  const daysByWeek = {};
  sessions.forEach((s) => {
    if (!s.date) return;
    const k = weekKey(s.date, weekStartsOn);
    (daysByWeek[k] = daysByWeek[k] || new Set()).add(s.date);
  });
  const weekCounts = {};
  Object.keys(daysByWeek).forEach((k) => { weekCounts[k] = daysByWeek[k].size; });

  const countAt = (weekStartDate) => weekCounts[ymd(weekStartDate)] || 0;
  const met = (weekStartDate) => countAt(weekStartDate) >= goal;

  const thisStart = startOfWeek(new Date(), weekStartsOn);
  const thisWeek = countAt(thisStart);

  let currentStreak = 0;
  let cursor = new Date(thisStart);
  if (!met(cursor)) cursor = addDays(cursor, -7); // don't penalize the live week
  while (met(cursor)) { currentStreak++; cursor = addDays(cursor, -7); }

  let longestStreak = 0;
  const keys = Object.keys(weekCounts).sort();
  if (keys.length) {
    let wk = parseYMD(keys[0]);
    let run = 0;
    while (ymd(wk) <= ymd(thisStart)) {
      if (met(wk)) { run++; if (run > longestStreak) longestStreak = run; }
      else run = 0;
      wk = addDays(wk, 7);
    }
  }

  // Conditioning totals, surfaced separately so lifting counts stay honest.
  // totalDistance assumes one unit throughout and is labelled with the first one
  // seen; mixing yd and m would sum them naively. Fine for a lap-pool habit, but
  // it would need per-unit buckets to be correct in general.
  let swimSessions = 0;
  let totalDistance = 0;
  let distanceUnit = "";
  let lastDistance = 0;
  let lastDistanceDate = "";
  sessions.forEach((s) => {
    if (typeof s.distance === "number" && s.distance > 0) {
      swimSessions++;
      totalDistance += s.distance;
      if (!distanceUnit) distanceUnit = s.distanceUnit || "yd";
      if (!lastDistanceDate || (s.date || "") >= lastDistanceDate) {
        lastDistanceDate = s.date || "";
        lastDistance = s.distance;
      }
    }
  });

  return {
    totalSessions: sessions.filter(isStrengthSession).length,
    thisWeek, goal, weekStartsOn, currentStreak, longestStreak, weekCounts,
    swimSessions, totalDistance, distanceUnit, lastDistance,
  };
}

// computePRs: heaviest logged weight per exercise name.
function computePRs(sessions) {
  const pr = {};
  sessions.forEach((s) => (s.exercises || []).forEach((e) => {
    if (typeof e.weight === "number" && e.weight > 0) {
      if (!pr[e.name] || e.weight > pr[e.name].weight) {
        pr[e.name] = { weight: e.weight, unit: e.unit || "", date: s.date };
      }
    }
  }));
  return pr;
}

// weightHistory: chronological weight points per exercise, for the charts.
function weightHistory(sessions) {
  const h = {};
  const sorted = sessions.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  sorted.forEach((s) => (s.exercises || []).forEach((e) => {
    if (typeof e.weight === "number" && e.weight > 0) {
      (h[e.name] = h[e.name] || []).push({ date: s.date, weight: e.weight, unit: e.unit || "" });
    }
  }));
  return h;
}

const BADGES = [
  { id: "first_workout", icon: "🎉", label: "First Workout", desc: "Log your first session", test: (st) => st.totalSessions >= 1 },
  { id: "consistent", icon: "✅", label: "Consistent", desc: "Hit your weekly goal", test: (st) => st.longestStreak >= 1 },
  { id: "ten", icon: "💪", label: "10 Workouts", desc: "Log 10 sessions", test: (st) => st.totalSessions >= 10 },
  { id: "streak_4", icon: "🔥", label: "4-Week Streak", desc: "4 weeks at goal in a row", test: (st) => st.longestStreak >= 4 },
  { id: "first_pr", icon: "⭐", label: "First PR", desc: "Log a weight", test: (st, ss, prs) => Object.keys(prs).length >= 1 },
  { id: "fifty", icon: "🏆", label: "50 Workouts", desc: "Log 50 sessions", test: (st) => st.totalSessions >= 50 },
  { id: "streak_8", icon: "🚀", label: "8-Week Streak", desc: "8 weeks at goal in a row", test: (st) => st.longestStreak >= 8 },
  { id: "hundred", icon: "💯", label: "100 Workouts", desc: "Log 100 sessions", test: (st) => st.totalSessions >= 100 },
];

function evaluateBadges(stats, sessions, prs) {
  return BADGES.map((b) => ({ id: b.id, icon: b.icon, label: b.label, desc: b.desc, earned: !!b.test(stats, sessions, prs) }));
}

Object.assign(PB, { computeStats, computePRs, weightHistory, isStrengthSession, BADGES, evaluateBadges });
