package main

import (
	_ "embed"
	"fmt"
	"html"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

// workoutHTML is the body fragment for the /workout page — a React SPA (the gym
// workout tracker). It is rendered into pageTmpl by the /workout handler so the
// page shares the site nav and theme. React + ReactDOM + Babel load from a CDN
// (see workoutHead) and the JSX is transpiled in the browser, so there's no
// frontend build step and the service stays a single Go binary. Kept in its own
// file because the JSX uses backtick template literals, which can't live in a
// Go raw-string literal.
//
//go:embed workout.html
var workoutHTML string

// workoutHead is injected into pageTmpl's <head> for the /workout page: the
// React, ReactDOM, and Babel standalone CDN scripts. React is pinned to 18.x
// because React 19 dropped the UMD/global builds this approach relies on.
const workoutHead = `  <script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>`

const pageTmpl = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%s</title>
  %s
  <style>
    :root {
      --bg: #0b0d12;
      --bg-soft: #11141c;
      --surface: #161a24;
      --surface-2: #1d2230;
      --border: #283044;
      --text: #e6e9f0;
      --muted: #8b93a7;
      --accent: #4f8cff;
      --accent-2: #6f5cff;
      --accent-soft: rgba(79, 140, 255, 0.14);
      --radius: 14px;
      --shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
      --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.35);
      --nav-h: 64px;
      --success: #34d399;
      --success-soft: rgba(52, 211, 153, 0.10);
      --success-border: rgba(52, 211, 153, 0.45);
      --warn: #f5b54a;
      --warn-border: rgba(245, 181, 74, 0.45);
      --danger: #f87171;
      --danger-soft: rgba(248, 113, 113, 0.08);
      --danger-border: rgba(248, 113, 113, 0.35);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(1200px 800px at 80%% -10%%, rgba(111, 92, 255, 0.12), transparent 60%%),
                  radial-gradient(1000px 700px at -10%% 10%%, rgba(79, 140, 255, 0.12), transparent 55%%),
                  var(--bg);
      color: var(--text);
      font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      line-height: 1.5;
    }
    code, .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
    a { color: inherit; }

    .nav {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--nav-h);
      padding: 0 1.4rem;
      background: rgba(11, 13, 18, 0.72);
      backdrop-filter: saturate(160%%) blur(12px);
      border-bottom: 1px solid var(--border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .brand .dot {
      width: 12px; height: 12px; border-radius: 50%%;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      box-shadow: 0 0 14px var(--accent);
    }
    .nav-links { display: flex; gap: 0.4rem; }
    .nav-links a {
      padding: 0.5rem 0.95rem;
      color: var(--muted);
      text-decoration: none;
      border-radius: 10px;
      font-size: 0.92rem;
      font-weight: 500;
      transition: background 0.18s, color 0.18s;
    }
    .nav-links a:hover { background: var(--surface-2); color: var(--text); }

    .wrap { max-width: 980px; margin: 0 auto; padding: 0 1.4rem; }

    section { padding: clamp(3rem, 9vh, 6rem) 0; }

    .hero {
      min-height: calc(100vh - var(--nav-h));
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      gap: 1.6rem;
    }
    .eyebrow {
      font-size: 0.8rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .title {
      margin: 0;
      font-size: clamp(2.4rem, 7vw, 4.6rem);
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.05;
      background: linear-gradient(135deg, #ffffff 30%%, #9fb8ff);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .subtitle { margin: 0; max-width: 46ch; color: var(--muted); font-size: 1.05rem; }

    .ip-card {
      display: inline-flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.4rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .ip-card .label {
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      text-align: left;
    }
    .ip-card .value {
      font-size: 1.45rem;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    .ip-card .pin {
      display: grid; place-items: center;
      width: 42px; height: 42px;
      border-radius: 12px;
      background: var(--accent-soft);
      color: var(--accent);
      flex-shrink: 0;
    }

    .scroll-hint {
      margin-top: 0.5rem;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      color: var(--muted);
      text-decoration: none;
      font-size: 0.85rem;
    }
    .scroll-hint .chev {
      width: 22px; height: 22px;
      border-right: 2px solid var(--muted);
      border-bottom: 2px solid var(--muted);
      transform: rotate(45deg);
      animation: bob 1.8s ease-in-out infinite;
    }
    @keyframes bob { 0%%,100%% { transform: rotate(45deg) translateY(0); } 50%% { transform: rotate(45deg) translateY(6px); } }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.2rem;
      margin-top: 2rem;
    }
    .cell { display: flex; flex-direction: column; gap: 0.85rem; }
    .panel {
      height: 130px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      transition: background 0.25s, box-shadow 0.25s;
    }
    .panel.on {
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      box-shadow: 0 8px 30px rgba(79, 140, 255, 0.4);
    }

    .section-head { margin-bottom: 1.6rem; }
    .section-head h2 {
      margin: 0 0 0.4rem;
      font-size: clamp(1.6rem, 4vw, 2.2rem);
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    .section-head p { margin: 0; color: var(--muted); }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 1.6rem;
    }

    .btn {
      padding: 0.7rem 1.2rem;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: #fff;
      border: none;
      border-radius: 10px;
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.12s, filter 0.18s;
    }
    .btn:hover { filter: brightness(1.08); }
    .btn:active { transform: translateY(1px); }
    .btn.ghost {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn.ghost:hover { background: var(--surface-2); }

    .options { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.3rem; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0.55rem 0.95rem;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      user-select: none;
      font-size: 0.92rem;
      transition: border-color 0.18s, background 0.18s;
    }
    .chip input { accent-color: var(--accent); width: 16px; height: 16px; cursor: pointer; }
    .chip:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }

    .length-row { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.4rem; }
    .length-row label { color: var(--muted); font-size: 0.92rem; white-space: nowrap; }
    .length-row input[type=range] { flex: 1; accent-color: var(--accent); }
    .length-val {
      min-width: 2.6rem;
      text-align: center;
      font-weight: 700;
      padding: 0.3rem 0.6rem;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    .output-row { display: flex; gap: 0.7rem; align-items: stretch; }
    .output {
      flex: 1;
      min-height: 52px;
      display: flex;
      align-items: center;
      padding: 0.7rem 1rem;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: 10px;
      font-size: 1.05rem;
      word-break: break-all;
      color: var(--accent);
    }
    .output:empty::before { content: "Click Generate…"; color: var(--muted); }
    .actions { display: flex; gap: 0.7rem; margin-top: 1.2rem; flex-wrap: wrap; }

    .big {
      min-height: calc(100vh - var(--nav-h));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: clamp(3rem, 13vw, 11rem);
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #ffffff 30%%, #9fb8ff);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .foot { padding: 2rem 0 3rem; text-align: center; color: var(--muted); font-size: 0.85rem; }

    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
      .nav-links a { padding: 0.45rem 0.7rem; }
    }
  </style>
</head>
<body>
  <nav class="nav">
    <div class="brand"><span class="dot"></span> probar</div>
    <div class="nav-links">
      <a href="/">Home</a>
      <a href="/#tools">Tools</a>
      <a href="/workout">Workout</a>
      <a href="/time">Time</a>
    </div>
  </nav>
  %s
</body>
</html>`

const homeBody = `<header class="hero">
  <span class="eyebrow">Homelab · CI/CD demo</span>
  <h1 class="title">Hello, World</h1>
  <p class="subtitle">A tiny Go service running on Kubernetes — now with a few sharp little tools.</p>

  <div class="ip-card">
    <div class="pin">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
    </div>
    <div>
      <div class="label">Your IP address</div>
      <div class="value mono">%s</div>
    </div>
  </div>

  <div class="grid wrap">
    <div class="cell">
      <div class="panel" id="p1"></div>
      <button class="btn ghost" onclick="toggle('p1')">Toggle 1</button>
    </div>
    <div class="cell">
      <div class="panel" id="p2"></div>
      <button class="btn ghost" onclick="toggle('p2')">Toggle 2</button>
    </div>
    <div class="cell">
      <div class="panel" id="p3"></div>
      <button class="btn ghost" onclick="toggle('p3')">Toggle 3</button>
    </div>
  </div>

  <a class="scroll-hint" href="#tools">Scroll for tools<span class="chev"></span></a>
</header>

<section id="tools">
  <div class="wrap">
    <div class="section-head">
      <h2>Random String Generator</h2>
      <p>Pick your character sets and length, then generate a fresh random string.</p>
    </div>
    <div class="card">
      <div class="options">
        <label class="chip"><input type="checkbox" id="opt-lower" checked> Lowercase <span class="mono">a-z</span></label>
        <label class="chip"><input type="checkbox" id="opt-upper" checked> Uppercase <span class="mono">A-Z</span></label>
        <label class="chip"><input type="checkbox" id="opt-digits" checked> Numbers <span class="mono">0-9</span></label>
        <label class="chip"><input type="checkbox" id="opt-symbols"> Symbols <span class="mono">!@#$</span></label>
      </div>
      <div class="length-row">
        <label for="len">Length</label>
        <input type="range" id="len" min="4" max="128" value="24" oninput="document.getElementById('lenVal').textContent = this.value">
        <span class="length-val mono" id="lenVal">24</span>
      </div>
      <div class="output-row">
        <div class="output mono" id="out"></div>
        <button class="btn ghost" id="copyBtn" onclick="copyOut()">Copy</button>
      </div>
      <div class="actions">
        <button class="btn" onclick="generate()">Generate</button>
      </div>
    </div>
  </div>
</section>

<div class="foot wrap">probar · served from %s</div>

<script>
  function toggle(id) { document.getElementById(id).classList.toggle('on'); }

  var SETS = {
    'opt-lower': 'abcdefghijklmnopqrstuvwxyz',
    'opt-upper': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'opt-digits': '0123456789',
    'opt-symbols': '!@#$%%^&*()-_=+[]{};:,.<>?'
  };

  function generate() {
    var pool = '';
    for (var id in SETS) {
      if (document.getElementById(id).checked) pool += SETS[id];
    }
    var out = document.getElementById('out');
    if (!pool) { out.textContent = 'Select at least one character set.'; return; }
    var len = parseInt(document.getElementById('len').value, 10);
    var bytes = new Uint32Array(len);
    crypto.getRandomValues(bytes);
    var s = '';
    for (var i = 0; i < len; i++) { s += pool[bytes[i] %% pool.length]; }
    out.textContent = s;
  }

  function copyOut() {
    var text = document.getElementById('out').textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      var b = document.getElementById('copyBtn');
      var prev = b.textContent;
      b.textContent = 'Copied!';
      setTimeout(function () { b.textContent = prev; }, 1200);
    });
  }

  generate();
</script>`

// clientIP returns the best-guess originating client address, honoring the
// proxy headers set by an ingress/load balancer in front of the service.
//
// Note: for the real client IP to survive, the LoadBalancer service fronting
// the ingress (Traefik, behind MetalLB) must use externalTrafficPolicy: Local.
// With the default "Cluster" policy, kube-proxy SNATs the source address and
// every visitor is reported as the same internal cluster IP.
func clientIP(r *http.Request) string {
	// X-Real-Ip is set (overwritten) by Traefik to the connecting peer, so it
	// is preferred over X-Forwarded-For, whose leading entries a client could
	// spoof by sending the header themselves.
	if xr := strings.TrimSpace(r.Header.Get("X-Real-Ip")); xr != "" {
		return xr
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For: client, proxy1, proxy2 — the first entry is the client.
		first := strings.TrimSpace(strings.Split(xff, ",")[0])
		if first != "" {
			return first
		}
	}
	if ip, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return ip
	}
	return r.RemoteAddr
}

func renderPage(w http.ResponseWriter, status int, title, head, body string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	fmt.Fprintf(w, pageTmpl, title, head, body)
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			renderPage(w, http.StatusNotFound, "404", "", `<div class="big">404</div>`)
			return
		}
		ip := html.EscapeString(clientIP(r))
		body := fmt.Sprintf(homeBody, ip, ip)
		renderPage(w, http.StatusOK, "probar · home", "", body)
	})

	// /workout renders the React workout-tracker SPA through the shared page
	// template, so it gets the site nav and theme. The CDN script tags go in the
	// <head> slot; the mount point + component go in the body.
	mux.HandleFunc("/workout", func(w http.ResponseWriter, r *http.Request) {
		renderPage(w, http.StatusOK, "probar · workout", workoutHead, workoutHTML)
	})

	mux.HandleFunc("/time", func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().Format("15:04:05")
		body := fmt.Sprintf(`<div class="big">%s</div>`, now)
		renderPage(w, http.StatusOK, "Current Time", `<meta http-equiv="refresh" content="1">`, body)
	})

	// whoami dumps the resolved client IP and the raw forwarding headers — handy
	// for diagnosing source-IP issues through the ingress.
	mux.HandleFunc("/whoami", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprintf(w, "client-ip:       %s\n", clientIP(r))
		fmt.Fprintf(w, "remote-addr:     %s\n", r.RemoteAddr)
		fmt.Fprintf(w, "x-real-ip:       %s\n", r.Header.Get("X-Real-Ip"))
		fmt.Fprintf(w, "x-forwarded-for: %s\n", r.Header.Get("X-Forwarded-For"))
		fmt.Fprintf(w, "host:            %s\n", r.Host)
	})

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})

	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ready")
	})

	log.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
