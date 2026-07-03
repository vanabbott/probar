// ---------------------------------------------------------------------------
// 60_builder.jsx — BuilderTab: full-screen overlay to create or edit a custom
// program. Your own programs edit in place; starter/coach programs are cloned
// when you tweak them so the originals stay intact. Saves via the API.
// ---------------------------------------------------------------------------
// useState, style constants, and uid come from 10_lib.jsx via the shared scope.

const SWATCHES = ["#4F8CFF", "#6F5CFF", "#B65CFF", "#34d399", "#f5b54a", "#f87171"];
const blankExercise = () => ({ name: "", sets: 3, reps: "10", rest: 0, key: false, notes: "" });
const blankDay = () => ({ id: uid("d_"), label: "Day", focus: "", color: "#4F8CFF", exercises: [blankExercise()] });

function initForm(program, activeProgram) {
  if (!program) {
    return {
      name: "", author: "you", coachNote: "",
      warmup: activeProgram ? activeProgram.warmup || [] : [],
      cooldown: activeProgram ? activeProgram.cooldown || [] : [],
      days: [blankDay()],
    };
  }
  const clone = JSON.parse(JSON.stringify(program));
  if (clone.author === "you") return clone; // edit in place
  delete clone.id; // starter/coach → duplicate
  clone.author = "you";
  clone.name = clone.name + " (copy)";
  clone.coachNote = "";
  return clone;
}

function BuilderTab({ program, activeProgram, onSave, onClose }) {
  const [form, setForm] = useState(() => initForm(program, activeProgram));
  const [err, setErr] = useState("");

  const setDay = (di, updater) => setForm((f) => ({ ...f, days: f.days.map((d, i) => (i === di ? updater(d) : d)) }));
  const setEx = (di, ei, updater) => setDay(di, (d) => ({ ...d, exercises: d.exercises.map((e, i) => (i === ei ? updater(e) : e)) }));

  const addDay = () => setForm((f) => ({ ...f, days: [...f.days, blankDay()] }));
  const removeDay = (di) => setForm((f) => ({ ...f, days: f.days.filter((_, i) => i !== di) }));
  const addEx = (di) => setDay(di, (d) => ({ ...d, exercises: [...d.exercises, blankExercise()] }));
  const removeEx = (di, ei) => setDay(di, (d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== ei) }));

  const save = () => {
    if (!form.name.trim()) { setErr("Give your program a name."); return; }
    if (!form.days.length) { setErr("Add at least one day."); return; }
    for (const d of form.days) {
      if (!d.exercises.length) { setErr("Every day needs at least one exercise."); return; }
      for (const e of d.exercises) if (!e.name.trim() || e.sets < 1) { setErr("Each exercise needs a name and at least 1 set."); return; }
    }
    // Ensure day ids/labels are present and unique.
    const cleaned = { ...form, days: form.days.map((d, i) => ({ ...d, id: d.id || uid("d_"), label: d.label || "Day " + (i + 1) })) };
    onSave(cleaned).catch((e) => setErr(String(e.message || e)));
  };

  const label = { fontSize: 12, fontWeight: 600, color: "var(--muted)" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg)", overflowY: "auto" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(11,13,18,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <button onClick={onClose} style={SMALL_BTN}>← Cancel</button>
        <strong style={{ fontSize: 15 }}>{form.id ? "Edit program" : "New program"}</strong>
        <button onClick={save} style={{ ...SMALL_BTN, color: "var(--accent)", borderColor: "var(--accent)" }}>Save</button>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "18px 18px 100px" }}>
        {err && <div style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-border)", color: "var(--danger)", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 13 }}>{err}</div>}

        <label style={label}>Program name</label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Upper/Lower Split" style={{ ...INPUT, width: "100%", margin: "4px 0 14px" }} />

        <label style={label}>Note (optional)</label>
        <textarea value={form.coachNote || ""} onChange={(e) => setForm((f) => ({ ...f, coachNote: e.target.value }))} placeholder="A reminder to your future self…" style={{ ...INPUT, width: "100%", minHeight: 48, resize: "vertical", margin: "4px 0 8px" }} />
        <p style={{ color: "var(--muted)", fontSize: 11, margin: "0 0 20px" }}>Warm-up & cool-down are carried over from your active program.</p>

        {form.days.map((d, di) => (
          <div key={di} style={{ ...PB.CARD, padding: 14, marginBottom: 14, borderLeft: "3px solid " + d.color }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={d.label} onChange={(e) => setDay(di, (x) => ({ ...x, label: e.target.value }))} placeholder="Day label" style={{ ...INPUT, width: 100 }} />
              <input value={d.focus} onChange={(e) => setDay(di, (x) => ({ ...x, focus: e.target.value }))} placeholder="Focus (e.g. Push)" style={{ ...INPUT, flex: 1 }} />
              {form.days.length > 1 && <button onClick={() => removeDay(di)} style={{ ...SMALL_BTN, color: "var(--danger)" }}>✕</button>}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {SWATCHES.map((c) => (
                <button key={c} onClick={() => setDay(di, (x) => ({ ...x, color: c }))} title={c}
                  style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: d.color === c ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer" }} />
              ))}
            </div>

            {d.exercises.map((e, ei) => (
              <div key={ei} style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input value={e.name} onChange={(ev) => setEx(di, ei, (x) => ({ ...x, name: ev.target.value }))} placeholder="Exercise name" style={{ ...INPUT, flex: 1 }} />
                  <button onClick={() => removeEx(di, ei)} style={{ ...SMALL_BTN, color: "var(--danger)" }}>✕</button>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="number" min="1" value={e.sets} onChange={(ev) => setEx(di, ei, (x) => ({ ...x, sets: parseInt(ev.target.value, 10) || 1 }))} style={{ ...INPUT, width: 58 }} title="sets" />
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>×</span>
                  <input value={e.reps} onChange={(ev) => setEx(di, ei, (x) => ({ ...x, reps: ev.target.value }))} placeholder="reps" style={{ ...INPUT, width: 70 }} title="reps" />
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!e.key} onChange={(ev) => setEx(di, ei, (x) => ({ ...x, key: ev.target.checked }))} style={{ accentColor: "var(--warn)" }} /> key
                  </label>
                </div>
              </div>
            ))}
            <button onClick={() => addEx(di)} style={{ ...SMALL_BTN, marginTop: 4 }}>＋ Exercise</button>
          </div>
        ))}

        <button onClick={addDay} style={{ ...GHOST_BTN, width: "100%" }}>＋ Add day</button>
      </div>
    </div>
  );
}

Object.assign(PB, { BuilderTab });
