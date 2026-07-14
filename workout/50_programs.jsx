// ---------------------------------------------------------------------------
// 50_programs.jsx — ProgramsTab: the library. Review/accept a coach's proposed
// block, switch the active program, read coach notes, edit the athlete profile
// (the coach's durable memory), and leave a message for the next coach run.
// ---------------------------------------------------------------------------
// useState + style constants (10_lib) and Banner (20_ui) resolve via the shared
// script scope.

const AUTHOR_STYLE = {
  seed: { bg: "var(--surface-2)", fg: "var(--muted)", label: "starter" },
  coach: { bg: "rgba(111,92,255,0.16)", fg: "var(--accent-2)", label: "coach" },
  you: { bg: "var(--accent-soft)", fg: "var(--accent)", label: "you" },
};

function AuthorTag({ author }) {
  const s = AUTHOR_STYLE[author] || AUTHOR_STYLE.you;
  return <span style={{ background: s.bg, color: s.fg, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</span>;
}

const LIST_KEYS = ["equipment", "injuries", "constraints"];
// Store list fields as raw text while editing so newlines (and blank lines in
// progress) survive keystrokes; split/trim into arrays only on save.
const toForm = (p) => ({ ...p, ...Object.fromEntries(LIST_KEYS.map((k) => [k, (p[k] || []).join("\n")])) });
const fromForm = (f) => ({ ...f, ...Object.fromEntries(LIST_KEYS.map((k) => [k, (f[k] || "").split("\n").map((x) => x.trim()).filter(Boolean)])) });

function ProfileEditor({ profile, onSave }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => toForm(profile));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const listField = (k) => form[k] || "";
  const setList = (k, v) => set(k, v);
  const area = { ...INPUT, width: "100%", minHeight: 60, resize: "vertical", marginTop: 4 };
  const label = { fontSize: 12, fontWeight: 600, color: "var(--muted)", marginTop: 12, display: "block" };

  return (
    <div style={{ ...CARD, padding: 16, marginBottom: 22 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", background: "transparent", border: "none", color: "var(--text)", fontFamily: "inherit", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, fontWeight: 700 }}>
        <span>🧠 Coach Profile</span>
        <span style={{ color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {!open && <p style={{ color: "var(--muted)", fontSize: 12, margin: "8px 0 0" }}>Goals, equipment, and the safety constraints your coach must honor every run.</p>}
      {open && (
        <div>
          <label style={label}>Goals</label>
          <textarea value={form.goals || ""} onChange={(e) => set("goals", e.target.value)} style={area} />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>Experience</label>
              <input value={form.experience || ""} onChange={(e) => set("experience", e.target.value)} style={{ ...INPUT, width: "100%", marginTop: 4 }} />
            </div>
            <div style={{ width: 110 }}>
              <label style={label}>Days/week</label>
              <input type="number" min="1" max="7" value={form.daysPerWeek || 3} onChange={(e) => set("daysPerWeek", parseInt(e.target.value, 10) || 3)} style={{ ...INPUT, width: "100%", marginTop: 4 }} />
            </div>
          </div>
          <label style={label}>Equipment (one per line)</label>
          <textarea value={listField("equipment")} onChange={(e) => setList("equipment", e.target.value)} style={area} />
          <label style={label}>Injuries (one per line)</label>
          <textarea value={listField("injuries")} onChange={(e) => setList("injuries", e.target.value)} style={area} />
          <label style={label}>Hard constraints (one per line — the coach must never violate these)</label>
          <textarea value={listField("constraints")} onChange={(e) => setList("constraints", e.target.value)} style={{ ...area, minHeight: 90 }} />
          <label style={label}>Preferences</label>
          <textarea value={form.preferences || ""} onChange={(e) => set("preferences", e.target.value)} style={area} />
          <button onClick={() => onSave(fromForm(form))} style={{ ...CTA, marginTop: 16 }}>Save profile</button>
        </div>
      )}
    </div>
  );
}

function ProgramCard({ program, active, onSetActive, onEdit, onDelete }) {
  return (
    <div style={{ ...CARD, padding: 16, marginBottom: 12, border: active ? "1px solid var(--accent)" : "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 15, color: "var(--text)", flex: 1 }}>{program.name}</strong>
        <AuthorTag author={program.author} />
        {active && <span style={{ color: "var(--accent)", fontSize: 11, fontWeight: 700 }}>ACTIVE</span>}
      </div>
      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: program.coachNote ? 8 : 12 }}>
        {program.days.length} day{program.days.length > 1 ? "s" : ""} · {program.days.map((d) => d.focus).join(", ")}
      </div>
      {program.coachNote && (
        <p style={{ color: "var(--text)", opacity: 0.85, fontSize: 13, lineHeight: 1.55, margin: "0 0 12px", borderLeft: "3px solid var(--accent-2)", paddingLeft: 10 }}>
          “{program.coachNote}”
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!active && <button onClick={() => onSetActive(program.id)} style={{ ...SMALL_BTN, color: "var(--accent)", borderColor: "var(--accent)" }}>Set active</button>}
        <button onClick={() => onEdit(program)} style={SMALL_BTN}>Edit / duplicate</button>
        {program.author !== "seed" && <button onClick={() => onDelete(program)} style={{ ...SMALL_BTN, color: "var(--danger)", borderColor: "var(--danger-border)" }}>Delete</button>}
      </div>
    </div>
  );
}

function ProgramsTab({ data, actions }) {
  const { programs, settings, profile } = data;
  const [msg, setMsg] = useState(settings.coachMessage || "");

  const proposed = settings.proposedProgramId ? programs.find((p) => p.id === settings.proposedProgramId) : null;

  const onDelete = (program) => {
    if (program.id === settings.activeProgramId) { window.alert("Set another program active before deleting this one."); return; }
    if (window.confirm("Delete “" + program.name + "”?")) actions.deleteProgram(program.id);
  };

  return (
    <div style={{ padding: "20px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Programs</h1>
        <button onClick={() => actions.openBuilder(null)} style={{ ...SMALL_BTN, color: "var(--accent)", borderColor: "var(--accent)" }}>＋ New</button>
      </div>

      {proposed && (
        <div style={{ ...CARD, padding: 16, marginBottom: 20, border: "1px solid var(--accent-2)", background: "rgba(111,92,255,0.10)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-2)", marginBottom: 6 }}>✨ New block from your coach</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{proposed.name}</div>
          {proposed.coachNote && <p style={{ color: "var(--text)", opacity: 0.9, fontSize: 13, lineHeight: 1.6, margin: "8px 0 12px" }}>{proposed.coachNote}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => actions.acceptProposed()} style={{ ...GHOST_BTN, background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "#fff", border: "none" }}>Accept & start</button>
            <button onClick={() => actions.dismissProposed()} style={GHOST_BTN}>Keep current</button>
          </div>
        </div>
      )}

      <ProfileEditor profile={profile} onSave={actions.saveProfile} />

      <div style={{ ...CARD, padding: 16, marginBottom: 22 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Message to your coach</label>
        <p style={{ color: "var(--muted)", fontSize: 12, margin: "4px 0 8px" }}>Read on the next coaching run — e.g. “shoulder's tweaky, go easy on pressing.”</p>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Optional note…" style={{ ...INPUT, width: "100%", minHeight: 54, resize: "vertical" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => actions.saveSettings({ ...settings, coachMessage: msg })} style={SMALL_BTN}>Save message</button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={!!settings.autoActivate} onChange={(e) => actions.saveSettings({ ...settings, autoActivate: e.target.checked })} style={{ accentColor: "var(--accent)" }} />
            Auto-activate coach blocks (skip review)
          </label>
        </div>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Library</h3>
      {programs.map((p) => (
        <ProgramCard key={p.id} program={p} active={p.id === settings.activeProgramId}
          onSetActive={actions.setActiveProgram} onEdit={actions.openBuilder} onDelete={onDelete} />
      ))}
    </div>
  );
}

Object.assign(PB, { ProgramsTab });
