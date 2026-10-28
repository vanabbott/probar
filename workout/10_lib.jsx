// ---------------------------------------------------------------------------
// 10_lib.jsx — foundation shared across every other workout/*.jsx block.
//
// The blocks are transpiled by Babel as separate scripts, so they don't share a
// module scope. Instead everything shared hangs off a single global namespace,
// window.PB: this file creates it and publishes helpers, hooks, the API client,
// and style constants; later blocks read them via `const { ... } = PB;` and
// publish their own components back onto PB.
// ---------------------------------------------------------------------------
window.PB = window.PB || {};

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---- date + misc helpers ---------------------------------------------------
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const todayStr = () => ymd(new Date());
const parseYMD = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d, weekStartsOn = 1) => {
  const x = new Date(d);
  const diff = (x.getDay() - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
};
const weekKey = (dateStr, weekStartsOn = 1) => ymd(startOfWeek(parseYMD(dateStr), weekStartsOn));
const fmtTime = (s) => Math.floor(s / 60) + ":" + pad2(s % 60);
const shortDate = (dateStr) => parseYMD(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function uid(prefix) {
  if (window.crypto && crypto.randomUUID) return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return prefix + Math.random().toString(16).slice(2, 14);
}

// Spread onto a non-button element to make it keyboard-activatable.
const press = (fn) => ({
  onClick: fn,
  onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } },
  role: "button",
  tabIndex: 0,
});

// End-of-rest chime via the Web Audio API (no asset to load).
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start(); o.stop(ctx.currentTime + 0.46);
    setTimeout(() => ctx.close(), 700);
  } catch (e) {}
}

// ---- wall-clock rest timer -------------------------------------------------
// Stores the absolute end time and derives the remaining seconds from Date.now()
// on every render, so backgrounding the tab (which throttles/suspends timers)
// can't drift the countdown. A visibilitychange/focus listener forces an
// immediate check so completion fires the instant you return.
function useWallClockTimer() {
  const [endsAt, setEndsAt] = useState(0); // 0 = inactive
  const [total, setTotal] = useState(0);   // duration of the current run (for the bar)
  const [, force] = useState(0);

  useEffect(() => {
    if (!endsAt) return;
    let done = false;
    const check = () => {
      if (done) return;
      if (Date.now() >= endsAt) {
        done = true;
        setEndsAt(0);
        beep();
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      } else {
        force((n) => (n + 1) % 1e9);
      }
    };
    const id = setInterval(check, 500);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    check();
    return () => {
      done = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [endsAt]);

  const left = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0;
  return {
    active: !!endsAt,
    left,
    total,
    start: (secs) => { setTotal(secs); setEndsAt(Date.now() + secs * 1000); },
    add: (secs) => { setTotal((t) => t + secs); setEndsAt((e) => (e || Date.now()) + secs * 1000); },
    stop: () => setEndsAt(0),
  };
}

// ---- API client ------------------------------------------------------------
// Talks to the Go /api endpoints. Caches the last good snapshot in localStorage
// so the app still renders offline, and queues session logs that fail to POST
// (bad gym signal) for retry on the next load.
const CACHE_KEY = "probar.workout.v2";
const QUEUE_KEY = "probar.workout.queue.v2";

function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; } }
function saveCache(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) {} }
function loadQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch (e) { return []; } }
function saveQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {} }

async function jfetch(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.status + "";
    try { const j = await res.json(); if (j && j.error) msg += " " + j.error; } catch (e) {}
    const err = new Error(method + " " + path + " → " + msg);
    err.status = res.status; // so callers can tell "never going to work" from "try later"
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

async function flushQueue() {
  const q = loadQueue();
  if (!q.length) return 0;
  const remaining = [];
  let sent = 0;
  for (const s of q) {
    try { await jfetch("POST", "/api/sessions", s); sent++; }
    catch (e) {
      // A 4xx means the server will never accept this payload, so re-queuing it
      // would retry forever on every page load and block everything behind it.
      // Only network/5xx failures are worth keeping.
      if (e && e.status >= 400 && e.status < 500) {
        console.warn("probar: dropping unacceptable queued session", e.message, s);
        continue;
      }
      remaining.push(s);
    }
  }
  saveQueue(remaining);
  return sent;
}

const api = {
  async loadAll() {
    try { await flushQueue(); } catch (e) {}
    try {
      const [programs, settings, profile, sessions] = await Promise.all([
        jfetch("GET", "/api/programs"),
        jfetch("GET", "/api/settings"),
        jfetch("GET", "/api/profile"),
        jfetch("GET", "/api/sessions"),
      ]);
      const data = { programs, settings, profile, sessions };
      saveCache(data);
      return { ...data, offline: false };
    } catch (e) {
      const cached = loadCache();
      if (cached) return { ...cached, offline: true };
      throw e;
    }
  },
  saveProgram: (p) => jfetch(p.id ? "PUT" : "POST", p.id ? "/api/programs/" + p.id : "/api/programs", p),
  deleteProgram: (id) => jfetch("DELETE", "/api/programs/" + id),
  deleteSession: (id) => jfetch("DELETE", "/api/sessions/" + id),
  putSettings: (s) => jfetch("PUT", "/api/settings", s),
  putProfile: (p) => jfetch("PUT", "/api/profile", p),
  // logSession never rejects: on failure it queues for retry and returns a
  // local record so the UI updates immediately.
  async logSession(s) {
    try { return await jfetch("POST", "/api/sessions", s); }
    catch (e) {
      const local = { ...s, id: s.id || uid("sess_"), _queued: true };
      const q = loadQueue(); q.push(s); saveQueue(q);
      return local;
    }
  },
};

// ---- shared style constants ------------------------------------------------
const SMALL_BTN = { background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const PILL_BTN = { background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const CTA = { width: "100%", padding: "15px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", marginTop: 10, boxShadow: "0 8px 30px rgba(79,140,255,0.35)", fontFamily: "inherit" };
const GHOST_BTN = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const INPUT = { background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px", fontSize: 14, fontFamily: "inherit" };
const CARD = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-sm)" };
const STEP_BTN = { width: 30, height: 30, lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, fontSize: 20, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0, flexShrink: 0 };
const START_BTN = { background: "transparent", border: "1px solid var(--border)", borderRadius: 999, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
const REST_STEP = 30; // rest-timer adjust step (seconds)
const REST_MIN = 30;  // minimum rest length

// ---- publish ---------------------------------------------------------------
Object.assign(PB, {
  useState, useEffect, useRef, useMemo, useCallback,
  ymd, todayStr, parseYMD, addDays, startOfWeek, weekKey, fmtTime, shortDate, pad2, uid, press, beep,
  useWallClockTimer, api,
  SMALL_BTN, PILL_BTN, CTA, GHOST_BTN, INPUT, CARD, STEP_BTN, START_BTN, REST_STEP, REST_MIN,
});
