// ---------------------------------------------------------------------------
// 30_train.jsx — TrainTab: the warm-up → workout → cool-down flow, driven by the
// active program from the API, in the 0.1.10 quick-log style (tap-to-complete
// rows, inline set-dots, a pinned wall-clock rest timer). In-progress state is
// kept in localStorage so a mid-gym reload doesn't lose it; finishing logs a
// session. Hooks/helpers/components resolve via the shared script scope.
// ---------------------------------------------------------------------------
const IP_KEY = "probar.workout.inprogress.v2";
const loadIP = () => { try { return JSON.parse(localStorage.getItem(IP_KEY) || "null"); } catch (e) { return null; } };
const saveIP = (v) => { try { localStorage.setItem(IP_KEY, JSON.stringify(v)); } catch (e) {} };
const blankDayProg = () => ({ counts: {}, warmup: [], cooldown: [] });

// "45 lb" -> { weight: 45, unit: "lb" }, for numeric charts/PRs while keeping
// the input free-text.
function parseWeight(str) {
  if (!str) return { weight: 0, unit: "" };
  const m = String(str).match(/([\d.]+)\s*([a-zA-Z]+)?/);
  if (!m) return { weight: 0, unit: "" };
  return { weight: parseFloat(m[1]) || 0, unit: (m[2] || "").toLowerCase() };
}

function TrainTab({ data, actions }) {
  const { programs, settings, sessions } = data;
  const program = useMemo(
    () => programs.find((p) => p.id === settings.activeProgramId) || programs[0],
    [programs, settings.activeProgramId]
  );

  // Most recent logged weight per exercise name, to prefill the input.
  const lastWeights = useMemo(() => {
    const out = {};
    sessions.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((s) => {
      (s.exercises || []).forEach((e) => {
        if (typeof e.weight === "number" && e.weight > 0) out[e.name] = e.weight + (e.unit ? " " + e.unit : "");
      });
    });
    return out;
  }, [sessions]);

  const firstDay = program && program.days[0] ? program.days[0].id : "";
  const [dayId, setDayId] = useState(firstDay);
  const [phase, setPhase] = useState("warmup");
  const [progress, setProgress] = useState({});
  const [weights, setWeights] = useState({});
  const [restDur, setRestDur] = useState(settings.restDefaultSec || 60);
  const timer = useWallClockTimer();

  // Hydrate in-progress state for today's active program (once program is known).
  useEffect(() => {
    if (!program) return;
    const ip = loadIP();
    if (ip && ip.date === todayStr() && ip.programId === program.id) {
      setDayId(ip.dayId || firstDay);
      setProgress(ip.progress || {});
      setWeights(ip.weights || {});
    } else {
      setDayId(firstDay);
      setProgress({});
      setWeights({});
    }
    // eslint-disable-next-line
  }, [program && program.id]);

  useEffect(() => {
    if (!program) return;
    saveIP({ date: todayStr(), programId: program.id, dayId, progress, weights });
  }, [program, dayId, progress, weights]);

  if (!program) {
    return <div style={{ padding: "20px 18px" }}><Banner tone="accent" title="No active program">Head to the Programs tab to pick one, or build your own.</Banner></div>;
  }

  const day = program.days.find((d) => d.id === dayId) || program.days[0];
  const dp = progress[day.id] || blankDayProg();
  const warmup = program.warmup || [];
  const cooldown = program.cooldown || [];

  const setDayProg = (updater) => setProgress((all) => ({ ...all, [day.id]: updater(all[day.id] || blankDayProg()) }));
  const setCount = (i, val) => setDayProg((p) => ({ ...p, counts: { ...p.counts, [i]: val } }));
  const cnt = (i) => Math.min(dp.counts[i] || 0, day.exercises[i].sets);

  // Tap a set dot: log one more set, wrapping to 0 once full. Logging (not
  // wrapping) auto-starts the rest timer.
  const incrementSet = (i) => {
    const sets = day.exercises[i].sets;
    const cur = dp.counts[i] || 0;
    const next = cur >= sets ? 0 : cur + 1;
    setCount(i, next);
    if (next > cur) timer.start(restDur);
  };
  // Tap the row: mark the whole exercise done or clear it.
  const toggleExercise = (i) => {
    const sets = day.exercises[i].sets;
    setCount(i, (dp.counts[i] || 0) >= sets ? 0 : sets);
  };

  const togglePhase = (type, i) => setDayProg((p) => {
    const arr = p[type] || [];
    return { ...p, [type]: arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i] };
  });
  const setWeight = (name, val) => setWeights((w) => ({ ...w, [name]: val }));

  const adjustRest = (delta) => {
    const d = Math.max(REST_MIN, restDur + delta);
    setRestDur(d);
    actions.saveSettings(Object.assign({}, settings, { restDefaultSec: d }));
  };

  const resetDay = () => {
    if (window.confirm("Reset today's progress for " + day.label + "?")) {
      setDayProg(() => blankDayProg());
      timer.stop();
    }
  };

  const totalSets = day.exercises.reduce((a, e) => a + e.sets, 0);
  const doneSets = day.exercises.reduce((a, e, i) => a + cnt(i), 0);
  const workoutPct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const warmupPct = warmup.length ? Math.round((dp.warmup.length / warmup.length) * 100) : 100;
  const cooldownPct = cooldown.length ? Math.round((dp.cooldown.length / cooldown.length) * 100) : 100;
  const complete = { warmup: warmupPct === 100, workout: workoutPct === 100 && totalSets > 0, cooldown: cooldownPct === 100 };
  const phasePct = phase === "warmup" ? warmupPct : phase === "workout" ? workoutPct : cooldownPct;
  const phaseColor = phase === "warmup" ? "var(--warn)" : phase === "workout" ? day.color : "var(--accent-2)";

  const finish = () => {
    if (doneSets === 0) { window.alert("Log at least one set before finishing."); return; }
    if (!window.confirm("Finish and log this " + day.label + " session?")) return;
    const session = {
      date: todayStr(),
      programId: program.id,
      dayId: day.id,
      completedAt: Date.now(),
      exercises: day.exercises.map((ex, i) => {
        const w = parseWeight(weights[ex.name] || "");
        return { name: ex.name, setsPlanned: ex.sets, setsCompleted: cnt(i), weight: w.weight, unit: w.unit, reps: ex.reps };
      }),
    };
    actions.logSession(session);
    setProgress((all) => ({ ...all, [day.id]: blankDayProg() }));
    timer.stop();
    actions.goTo("history");
  };

  const PHASES = [{ id: "warmup", label: "🔥 Warm-Up" }, { id: "workout", label: "💪 Workout" }, { id: "cooldown", label: "🧊 Cool-Down" }];

  return (
    <div>
      <div style={{ padding: "20px 18px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 26 }}>🏋️</span>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.01em", background: "linear-gradient(135deg, #ffffff 30%, #9fb8ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              {program.name}
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 12, margin: "2px 0 0" }}>{day.label} · {day.focus}</p>
          </div>
        </div>

        {program.days.length > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {program.days.map((d) => {
              const active = day.id === d.id;
              return (
                <button key={d.id} onClick={() => { setDayId(d.id); setPhase("warmup"); }}
                  style={{ flex: "1 1 30%", padding: "10px 6px", borderRadius: 10, border: "1px solid " + (active ? d.color : "var(--border)"), background: active ? d.color + "1f" : "var(--surface)", cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: active ? d.color : "var(--text)" }}>{d.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2, color: "var(--muted)" }}>{d.focus}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ position: "sticky", top: "var(--nav-h)", zIndex: 5, background: "rgba(17, 20, 28, 0.92)", backdropFilter: "saturate(160%) blur(12px)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex" }}>
          {PHASES.map((p) => (
            <button key={p.id} onClick={() => setPhase(p.id)}
              style={{ flex: 1, padding: "12px 4px", border: "none", background: "transparent", borderBottom: phase === p.id ? "2px solid " + day.color : "2px solid transparent", color: phase === p.id ? "var(--text)" : "var(--muted)", fontWeight: phase === p.id ? 700 : 500, fontSize: 13, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" }}>
              {p.label}{complete[p.id] && <span style={{ color: "var(--success)", marginLeft: 5 }}>✓</span>}
            </button>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <RestTimer dur={restDur} active={timer.active} left={timer.left} total={timer.total} color={day.color}
            onStart={() => timer.start(restDur)} onStop={timer.stop} onAdjust={adjustRest} onAdd={(s) => timer.add(s)} />
        </div>
        <div style={{ height: 3, background: "var(--surface-2)" }}>
          <div style={{ height: "100%", width: phasePct + "%", background: phaseColor, transition: "width 0.3s" }} />
        </div>
      </div>

      <div style={{ padding: "18px" }}>
        {phase === "warmup" && (
          <>
            <Banner tone="warn" title="Every session starts here">Don't skip — especially important with your back history. Takes ~10 min.</Banner>
            {warmup.length
              ? <PhaseSection title="Warm-Up" icon="🔥" items={warmup} color="var(--warn)" checked={dp.warmup} onToggle={(i) => togglePhase("warmup", i)} />
              : <p style={{ color: "var(--muted)", fontSize: 13 }}>No warm-up defined for this program.</p>}
            <button onClick={() => setPhase("workout")} style={CTA}>Start Workout →</button>
          </>
        )}

        {phase === "workout" && (
          <>
            <div style={{ background: "var(--surface)", border: "1px solid " + day.color + "55", borderRadius: 12, padding: "14px", marginBottom: 20, boxShadow: "var(--shadow-sm)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <strong style={{ color: "var(--text)", fontSize: 15 }}>{day.label} · {day.focus}</strong>
                <button onClick={resetDay} style={SMALL_BTN}>Reset</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}><Bar pct={workoutPct} color={day.color} /></div>
                <span style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>{doneSets}/{totalSets} sets</span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                Tap a row to complete it, or the dots to log sets one at a time — logging a set starts your rest timer. <span style={{ color: "var(--warn)" }}>★ Key</span> exercises are critical for your back.
              </p>
            </div>
            {day.exercises.map((ex, i) => (
              <ExerciseCard key={i} exercise={ex} dayColor={day.color} count={cnt(i)}
                weight={weights[ex.name] !== undefined ? weights[ex.name] : (lastWeights[ex.name] || "")}
                onToggle={() => toggleExercise(i)} onIncrement={() => incrementSet(i)} onSetWeight={(v) => setWeight(ex.name, v)} />
            ))}
            <button onClick={() => setPhase("cooldown")} style={CTA}>Done — Cool Down →</button>
          </>
        )}

        {phase === "cooldown" && (
          <>
            <Banner tone="coach" title="Don't skip this either">5–8 minutes of stretching after every session is one of the best things you can do for your disk long-term.</Banner>
            {cooldown.length
              ? <PhaseSection title="Cool-Down" icon="🧊" items={cooldown} color="var(--accent-2)" checked={dp.cooldown} onToggle={(i) => togglePhase("cooldown", i)} />
              : <p style={{ color: "var(--muted)", fontSize: 13 }}>No cool-down defined for this program.</p>}
            <button onClick={finish} style={{ ...CTA, background: "linear-gradient(135deg, var(--success), #22a06b)" }}>✓ Finish & Log Session</button>
            <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
              Warm-up {warmupPct}% · Workout {workoutPct}% · Cool-down {cooldownPct}%
            </div>
          </>
        )}

        <div style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "12px 14px", marginTop: 24 }}>
          <div style={{ color: "var(--danger)", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>⚠️ Back Safety</div>
          <ul style={{ color: "var(--muted)", fontSize: 12, margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
            <li>Sharp or radiating pain → stop immediately</li>
            <li>No barbell back squats or conventional deadlifts yet</li>
            <li>Lower back stays flat (not arched) during core work</li>
            <li>Start lighter than you think you need to</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

Object.assign(PB, { TrainTab });
