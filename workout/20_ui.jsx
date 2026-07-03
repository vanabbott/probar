// ---------------------------------------------------------------------------
// 20_ui.jsx — presentational components shared across tabs. The exercise card
// and rest timer follow the 0.1.10 "quick-log" design (tap-to-complete rows,
// inline set-dots, always-visible weight, a pinned configurable rest timer);
// the gamification widgets (GoalRing, Heatmap, SparkChart, BadgeGrid) are new.
// ---------------------------------------------------------------------------
// Helpers, hooks, and style constants come from 10_lib.jsx via the shared
// script scope (React hooks, press, ymd/date helpers, SMALL_BTN, INPUT, …).

function CheckBox({ checked, color }) {
  return (
    <span style={{
      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
      border: checked ? "none" : "2px solid var(--border)",
      background: checked ? (color || "var(--success)") : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
    }}>
      {checked && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 7L5.5 10L11.5 4" stroke="#0b0d12" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function Bar({ pct, color }) {
  return (
    <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: 999, transition: "width 0.3s" }} />
    </div>
  );
}

function Banner({ tone = "accent", title, children }) {
  const map = {
    accent: ["var(--accent-soft)", "var(--accent)"],
    warn: ["var(--warn-border)", "var(--warn)"],
    success: ["var(--success-soft)", "var(--success)"],
    danger: ["var(--danger-soft)", "var(--danger)"],
    coach: ["rgba(111,92,255,0.12)", "var(--accent-2)"],
  };
  const [bg, fg] = map[tone] || map.accent;
  return (
    <div style={{ background: bg, border: "1px solid " + fg, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
      {title && <div style={{ color: fg, fontWeight: 700, fontSize: 13, marginBottom: children ? 5 : 0 }}>{title}</div>}
      {children && <div style={{ color: "var(--text)", opacity: 0.9, fontSize: 13, lineHeight: 1.55 }}>{children}</div>}
    </div>
  );
}

function Stat({ value, label, color = "var(--text)" }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "12px 6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

// Circular progress ring — this week's training days vs the weekly goal.
function GoalRing({ value, goal, size = 128, color = "var(--accent)" }) {
  const pct = goal ? Math.min(1, value / goal) : 0;
  const r = size / 2 - 11;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={"rotate(-90 " + cx + " " + cx + ")"}
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x="50%" y="47%" textAnchor="middle" fill="var(--text)" fontSize="30" fontWeight="800">{value}</text>
      <text x="50%" y="64%" textAnchor="middle" fill="var(--muted)" fontSize="12">of {goal} this week</text>
    </svg>
  );
}

// GitHub-style contribution calendar over the last `weeks` weeks.
function Heatmap({ sessions, weeks = 18, weekStartsOn = 1 }) {
  const counts = {};
  sessions.forEach((s) => { if (s.date) counts[s.date] = (counts[s.date] || 0) + 1; });
  const today = new Date();
  const thisStart = startOfWeek(today, weekStartsOn);
  const firstCol = addDays(thisStart, -7 * (weeks - 1));

  const color = (count, future) => {
    if (future) return "transparent";
    if (!count) return "var(--surface-2)";
    if (count === 1) return "rgba(52,211,153,0.5)";
    return "var(--success)";
  };

  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(firstCol, w * 7 + d);
      const key = ymd(date);
      cells.push({ key, count: counts[key] || 0, future: date > today, isToday: key === todayStr() });
    }
    cols.push(cells);
  }

  return (
    <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 4 }}>
      {cols.map((cells, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {cells.map((c) => (
            <div key={c.key} title={c.key + (c.count ? " · " + c.count + " workout" + (c.count > 1 ? "s" : "") : "")}
              style={{ width: 13, height: 13, borderRadius: 3, background: color(c.count, c.future), border: c.isToday ? "1px solid var(--accent)" : "1px solid transparent" }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Minimal hand-rolled SVG line chart (no chart lib). points: [{date, weight}].
function SparkChart({ points, color = "var(--accent)", width = 300, height = 90 }) {
  if (!points || points.length === 0) return <div style={{ color: "var(--muted)", fontSize: 12 }}>No weight logged yet.</div>;
  const ys = points.map((p) => p.weight);
  const min = Math.min.apply(null, ys), max = Math.max.apply(null, ys);
  const span = max - min || 1;
  const pad = 10;
  const n = points.length;
  const xat = (i) => pad + (n === 1 ? (width - 2 * pad) / 2 : (i / (n - 1)) * (width - 2 * pad));
  const yat = (v) => height - pad - ((v - min) / span) * (height - 2 * pad);
  const d = points.map((p, i) => (i === 0 ? "M" : "L") + xat(i).toFixed(1) + " " + yat(p.weight).toFixed(1)).join(" ");
  return (
    <svg width={width} height={height} viewBox={"0 0 " + width + " " + height} style={{ maxWidth: "100%" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={xat(i)} cy={yat(p.weight)} r="2.6" fill={color} />)}
    </svg>
  );
}

function BadgeGrid({ badges, earnedDates }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
      {badges.map((b) => {
        const on = b.earned;
        const date = earnedDates && earnedDates[b.id];
        return (
          <div key={b.id} title={b.desc + (date ? " · earned " + date : "")}
            style={{ textAlign: "center", padding: "12px 4px", borderRadius: 12, border: "1px solid " + (on ? "var(--success-border)" : "var(--border)"), background: on ? "var(--success-soft)" : "var(--surface)", opacity: on ? 1 : 0.45 }}>
            <div style={{ fontSize: 26, filter: on ? "none" : "grayscale(1)" }}>{b.icon}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, lineHeight: 1.2 }}>{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// RestTimer (0.1.10 style, wall-clock accurate). Idle: shows the configured
// length with −/+30s steppers and a Start button. Running: counts down with a
// progress bar plus +30s / Skip. Pinned at the top of the phases so it's one tap
// away whenever you want it.
function RestTimer({ dur, active, left, total, color, onStart, onStop, onAdjust, onAdd }) {
  const pct = active && total > 0 ? Math.max(0, (left / total) * 100) : 0;
  return (
    <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⏱</span>
      {!active ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => onAdjust(-REST_STEP)} disabled={dur <= REST_MIN} style={{ ...STEP_BTN, opacity: dur <= REST_MIN ? 0.4 : 1 }} aria-label="less rest">−</button>
            <span className="mono" style={{ minWidth: 48, textAlign: "center", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{fmtTime(dur)}</span>
            <button onClick={() => onAdjust(REST_STEP)} style={STEP_BTN} aria-label="more rest">+</button>
          </div>
          <span style={{ color: "var(--muted)", fontSize: 11, flex: 1, minWidth: 0 }}>rest length</span>
          <button onClick={onStart} style={{ ...START_BTN, borderColor: color, color: color }}>Start Rest ▸</button>
        </>
      ) : (
        <>
          <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: color, minWidth: 58, flexShrink: 0 }}>{fmtTime(left)}</span>
          <div style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden", minWidth: 30 }}>
            <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: 999, transition: "width 1s linear" }} />
          </div>
          <button onClick={() => onAdd(REST_STEP)} style={PILL_BTN}>+30s</button>
          <button onClick={onStop} style={{ ...PILL_BTN, color: "var(--text)" }}>Skip</button>
        </>
      )}
    </div>
  );
}

// ExerciseCard (0.1.10 quick-log): tapping the row marks the whole exercise done
// (fills all sets) or clears it; the inline set-dots log one set per tap
// (wrapping to empty once full); the weight field is always visible; form cues
// sit behind a "How?" toggle. Count-based, not per-set arrays.
function ExerciseCard({ exercise, dayColor, count, weight, onToggle, onIncrement, onSetWeight }) {
  const [showNotes, setShowNotes] = useState(false);
  const isKey = !!exercise.key;
  const done = count >= exercise.sets;
  return (
    <div style={{
      background: done ? "var(--success-soft)" : "var(--surface)",
      border: "1px solid " + (done ? "var(--success-border)" : isKey ? "var(--warn-border)" : "var(--border)"),
      borderRadius: "var(--radius)", marginBottom: 10, overflow: "hidden", transition: "all 0.2s", boxShadow: "var(--shadow-sm)",
    }}>
      <div {...press(onToggle)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
        <CheckBox checked={done} color={dayColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--text)", fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}>{exercise.name}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
            {exercise.sets} sets × {exercise.reps}
            {weight ? <span style={{ color: "var(--text)" }}> · {weight}</span> : null}
            {isKey && <span style={{ color: "var(--warn)", marginLeft: 6 }}>★ Key</span>}
          </div>
        </div>
        {exercise.notes
          ? <button onClick={(e) => { e.stopPropagation(); setShowNotes((v) => !v); }} aria-label="how to do it" style={{ ...SMALL_BTN, padding: "6px 9px", borderRadius: 8, flexShrink: 0 }}>{showNotes ? "Hide" : "How?"}</button>
          : null}
      </div>

      <div style={{ padding: "0 16px 14px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>Sets</span>
          <div {...press(onIncrement)} aria-label={"log a set, " + count + " of " + exercise.sets + " done"}
            style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", padding: "5px 9px", borderRadius: 8, background: "var(--bg-soft)", border: "1px solid var(--border)" }}>
            {Array.from({ length: exercise.sets }).map((_, i) => (
              <span key={i} style={{ width: 20, height: 10, borderRadius: 999, background: i < count ? dayColor : "var(--surface-2)", transition: "background 0.15s" }} />
            ))}
            <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700, marginLeft: 4 }}>{count}/{exercise.sets}</span>
          </div>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>tap to log a set</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>Weight</span>
          <input value={weight} onChange={(e) => onSetWeight(e.target.value)} placeholder="e.g. 45 lb" inputMode="text" style={{ ...INPUT, width: 120 }} />
          {exercise.targetWeight
            ? <span style={{ color: "var(--accent)", fontSize: 11 }}>coach target: {exercise.targetWeight}</span>
            : <span style={{ color: "var(--muted)", fontSize: 11 }}>remembered next time</span>}
        </div>
      </div>

      {showNotes && exercise.notes && (
        <div style={{ padding: "0 16px 16px" }}>
          <p style={{ color: "var(--text)", opacity: 0.82, fontSize: 13, lineHeight: 1.6, margin: 0, background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px" }}>{exercise.notes}</p>
        </div>
      )}
    </div>
  );
}

function PhaseSection({ title, icon, items, color, checked, onToggle }) {
  const pct = items.length ? Math.round((checked.length / items.length) * 100) : 0;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <h3 style={{ color, fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h3>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{checked.length}/{items.length}</span>
      </div>
      <div style={{ marginBottom: 14 }}><Bar pct={pct} color={color} /></div>
      {items.map((item, i) => {
        const on = checked.includes(i);
        return (
          <div key={i} {...press(() => onToggle(i))}
            style={{ background: on ? "var(--success-soft)" : "var(--surface)", border: "1px solid " + (on ? "var(--success-border)" : "var(--border)"), borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", boxShadow: "var(--shadow-sm)" }}>
            <CheckBox checked={on} />
            <div>
              <div style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>{item.name}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>{item.detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Fixed bottom tab bar.
function BottomNav({ tabs, active, onChange }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, display: "flex", background: "rgba(11,13,18,0.92)", backdropFilter: "saturate(160%) blur(12px)", borderTop: "1px solid var(--border)" }}>
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{ flex: 1, padding: "10px 2px 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: on ? "var(--accent)" : "var(--muted)" }}>
            <div style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 600, marginTop: 3 }}>{t.label}</div>
          </button>
        );
      })}
    </div>
  );
}

Object.assign(PB, { CheckBox, Bar, Banner, Stat, GoalRing, Heatmap, SparkChart, BadgeGrid, RestTimer, ExerciseCard, PhaseSection, BottomNav });
