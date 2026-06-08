package main

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

const pageTmpl = `<!DOCTYPE html>
<html>
<head>
  <title>%s</title>
  %s
  <style>
    html, body {
      margin: 0;
      height: 100%%;
      background: #0a0a0a;
      color: #00b7ff;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .nav {
      position: fixed;
      top: 1rem;
      right: 1rem;
      display: flex;
      gap: 0.5rem;
      z-index: 10;
    }
    .nav a {
      padding: 0.5rem 1rem;
      color: #00b7ff;
      text-decoration: none;
      border: 2px solid #00b7ff;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.9rem;
      transition: background 0.2s, color 0.2s;
    }
    .nav a:hover {
      background: #00b7ff;
      color: #0a0a0a;
    }
    .big {
      font-size: clamp(3rem, 14vw, 12rem);
      font-weight: 700;
      letter-spacing: 0.05em;
      text-shadow: 0 0 20px rgba(0, 183, 255, 0.6);
    }
    .home {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2rem;
      padding: 2rem;
      width: 100%%;
      box-sizing: border-box;
    }
    .title {
      font-size: clamp(2rem, 8vw, 5rem);
      margin: 0;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-shadow: 0 0 20px rgba(0, 183, 255, 0.6);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      width: min(900px, 90vw);
    }
    .cell {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .panel {
      height: 150px;
      background: #000;
      border: 2px solid #00b7ff;
      border-radius: 8px;
      transition: background 0.2s;
    }
    .panel.white {
      background: #fff;
    }
    .btn {
      padding: 0.75rem 1rem;
      background: transparent;
      color: #00b7ff;
      border: 2px solid #00b7ff;
      border-radius: 8px;
      font-family: inherit;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .btn:hover {
      background: #00b7ff;
      color: #0a0a0a;
    }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/">Home</a>
    <a href="/time">Time</a>
  </nav>
  %s
</body>
</html>`

const homeBody = `<div class="home">
  <h1 class="title">Hello World</h1>
  <div class="grid">
    <div class="cell">
      <div class="panel" id="p1"></div>
      <button class="btn" onclick="toggle('p1')">Toggle 1</button>
    </div>
    <div class="cell">
      <div class="panel" id="p2"></div>
      <button class="btn" onclick="toggle('p2')">Toggle 2</button>
    </div>
    <div class="cell">
      <div class="panel" id="p3"></div>
      <button class="btn" onclick="toggle('p3')">Toggle 3</button>
    </div>
  </div>
</div>
<script>
  function toggle(id) {
    document.getElementById(id).classList.toggle('white');
  }
</script>`

func renderPage(w http.ResponseWriter, status int, title, head, body string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	fmt.Fprintf(w, pageTmpl, title, head, body)
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			renderPage(w, http.StatusNotFound, "404", "", `<div class="big">404 page not found :(</div>`)
			return
		}
		renderPage(w, http.StatusOK, "Welcome Home!", "", homeBody)
	})

	mux.HandleFunc("/time", func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().Format("15:04:05")
		body := fmt.Sprintf(`<div class="big">%s</div>`, now)
		renderPage(w, http.StatusOK, "Current Time", `<meta http-equiv="refresh" content="1">`, body)
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