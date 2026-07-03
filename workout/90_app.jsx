// ---------------------------------------------------------------------------
// 90_app.jsx — GymApp shell. Loads all data from the API once, owns the tab
// state and the action callbacks (which update local state optimistically and
// persist to the API), auto-awards newly earned badges, and mounts the app.
// Runs last (filename prefix 90) so every component it uses is already on PB.
// ---------------------------------------------------------------------------
// Everything (hooks/api/helpers from 10_lib, stats from 15_stats, tabs from
// 30–70, BottomNav from 20_ui) resolves via the shared script scope.

const TABS = [
  { id: "train", icon: "🏋️", label: "Train" },
  { id: "history", icon: "📅", label: "History" },
  { id: "progress", icon: "📈", label: "Progress" },
  { id: "programs", icon: "📚", label: "Programs" },
];

function GymApp() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("train");
  const [builder, setBuilder] = useState(null);

  const load = () => {
    setLoadError(null);
    api.loadAll().then(setData).catch((e) => setLoadError(String((e && e.message) || e)));
  };
  useEffect(() => { load(); }, []);

  // Auto-award newly earned badges. Runs whenever the log changes; it only
  // writes when a badge is newly earned, so it settles after one pass.
  useEffect(() => {
    if (!data) return;
    const stats = computeStats(data.sessions, data.settings);
    const prs = computePRs(data.sessions);
    const earned = Object.assign({}, data.settings.earnedBadges || {});
    let changed = false;
    evaluateBadges(stats, data.sessions, prs).forEach((b) => {
      if (b.earned && !earned[b.id]) { earned[b.id] = todayStr(); changed = true; }
    });
    if (changed) {
      const settings = Object.assign({}, data.settings, { earnedBadges: earned });
      setData((d) => Object.assign({}, d, { settings }));
      api.putSettings(settings).catch(() => {});
    }
  }, [data && data.sessions, data && data.settings]);

  const patchSettings = (settings) => {
    setData((d) => Object.assign({}, d, { settings }));
    return api.putSettings(settings).catch(() => {});
  };

  const actions = {
    goTo: setTab,
    openBuilder: (program) => setBuilder({ program }),
    closeBuilder: () => setBuilder(null),

    logSession: async (session) => {
      const saved = await api.logSession(session);
      setData((d) => Object.assign({}, d, { sessions: [...d.sessions, saved] }));
    },
    deleteSession: (id) => {
      setData((d) => Object.assign({}, d, { sessions: d.sessions.filter((s) => s.id !== id) }));
      api.deleteSession(id).catch(() => {});
    },

    setActiveProgram: (id) => patchSettings(Object.assign({}, data.settings, {
      activeProgramId: id,
      proposedProgramId: data.settings.proposedProgramId === id ? "" : data.settings.proposedProgramId,
    })),
    acceptProposed: () => {
      const pid = data.settings.proposedProgramId;
      if (!pid) return;
      patchSettings(Object.assign({}, data.settings, { activeProgramId: pid, proposedProgramId: "" }));
      setTab("train");
    },
    dismissProposed: () => patchSettings(Object.assign({}, data.settings, { proposedProgramId: "" })),
    saveSettings: (settings) => patchSettings(settings),

    saveProfile: (profile) => {
      setData((d) => Object.assign({}, d, { profile }));
      return api.putProfile(profile).catch(() => {});
    },
    saveProgram: (program) => api.saveProgram(program).then((saved) => {
      setData((d) => {
        const exists = d.programs.some((p) => p.id === saved.id);
        const programs = exists ? d.programs.map((p) => (p.id === saved.id ? saved : p)) : [...d.programs, saved];
        return Object.assign({}, d, { programs });
      });
      setBuilder(null);
      return saved;
    }),
    deleteProgram: (id) => {
      setData((d) => Object.assign({}, d, { programs: d.programs.filter((p) => p.id !== id) }));
      api.deleteProgram(id).catch(() => {});
    },
  };

  if (loadError && !data) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "80px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>😵</div>
        <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>Couldn't load your workouts</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>{loadError}</div>
        <button onClick={load} style={PB.GHOST_BTN}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return <div style={{ maxWidth: 560, margin: "0 auto", padding: "80px 18px", textAlign: "center", color: "var(--muted)" }}>Loading your workouts…</div>;
  }

  const activeProgram = data.programs.find((p) => p.id === data.settings.activeProgramId) || data.programs[0];

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 84 }}>
      {data.offline && (
        <div style={{ background: "var(--warn-border)", color: "#0b0d12", fontSize: 12, fontWeight: 600, textAlign: "center", padding: "6px 12px" }}>
          Offline — showing your last synced data. Changes sync when you're back.
        </div>
      )}
      {tab === "train" && <TrainTab data={data} actions={actions} />}
      {tab === "history" && <HistoryTab data={data} actions={actions} />}
      {tab === "progress" && <ProgressTab data={data} />}
      {tab === "programs" && <ProgramsTab data={data} actions={actions} />}

      <BottomNav tabs={TABS} active={tab} onChange={setTab} />
      {builder && <BuilderTab program={builder.program} activeProgram={activeProgram} onSave={actions.saveProgram} onClose={actions.closeBuilder} />}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<GymApp />);
