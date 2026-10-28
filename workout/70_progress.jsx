// ---------------------------------------------------------------------------
// 70_progress.jsx — ProgressTab: per-exercise weight-over-time charts and a
// personal-records list. All derived from logged session weights.
// ---------------------------------------------------------------------------
// weightHistory/computePRs (15_stats), SparkChart/Banner (20_ui), and helpers
// (10_lib) resolve via the shared script scope.

function ProgressTab({ data }) {
  const { sessions } = data;
  const history = useMemo(() => weightHistory(sessions), [sessions]);
  const prs = useMemo(() => computePRs(sessions), [sessions]);
  const names = useMemo(
    () => Object.keys(history).sort((a, b) => history[b].length - history[a].length),
    [history]
  );
  const prNames = Object.keys(prs).sort();

  // Swim distance over time. SparkChart reads `.weight`, so the distance is mapped
  // onto that key rather than given its own chart component.
  const swimPts = useMemo(
    () => sessions
      .filter((s) => typeof s.distance === "number" && s.distance > 0)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((s) => ({ date: s.date, weight: s.distance, unit: s.distanceUnit || "yd" })),
    [sessions]
  );

  return (
    <div style={{ padding: "20px 18px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Progress</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 20px" }}>Weight logged over time, and your personal records.</p>

      {names.length === 0 && swimPts.length === 0 && <Banner tone="accent" title="No weights logged yet">Log weights while you train and your progress charts and PRs will build up here.</Banner>}

      {swimPts.length > 0 && (
        <div style={{ ...CARD, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <strong style={{ fontSize: 14, color: "var(--text)" }}>🏊 Swim distance</strong>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {swimPts[swimPts.length - 1].weight} {swimPts[swimPts.length - 1].unit}
            </span>
          </div>
          <SparkChart points={swimPts} />
        </div>
      )}

      {prNames.length > 0 && (
        <div style={{ ...CARD, padding: 16, marginBottom: 22 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>🏅 Personal Records</h3>
          {prNames.map((n) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, color: "var(--text)" }}>{n}</span>
              <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", marginLeft: 12 }}>
                <strong style={{ color: "var(--accent)" }}>{prs[n].weight}{prs[n].unit ? " " + prs[n].unit : ""}</strong> · {PB.shortDate(prs[n].date)}
              </span>
            </div>
          ))}
        </div>
      )}

      {names.map((n) => {
        const pts = history[n];
        const latest = pts[pts.length - 1];
        const first = pts[0];
        const delta = latest.weight - first.weight;
        return (
          <div key={n} style={{ ...CARD, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <strong style={{ fontSize: 14, color: "var(--text)" }}>{n}</strong>
              <span style={{ fontSize: 12, color: delta > 0 ? "var(--success)" : "var(--muted)" }}>
                {latest.weight}{latest.unit ? " " + latest.unit : ""}{delta > 0 ? " · +" + delta.toFixed(delta % 1 ? 1 : 0) : ""}
              </span>
            </div>
            <SparkChart points={pts} />
          </div>
        );
      })}
    </div>
  );
}

Object.assign(PB, { ProgressTab });
