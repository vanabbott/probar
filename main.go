package main

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

const page = `<!DOCTYPE html>
<html>
<head>
  <title>Current Time</title>
  <meta http-equiv="refresh" content="1">
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
    }
    .time {
      font-size: clamp(3rem, 14vw, 12rem);
      font-weight: 700;
      letter-spacing: 0.05em;
      text-shadow: 0 0 20px rgba(0, 183, 255, 0.6);
    }
  </style>
</head>
<body>
  <div class="time">%s</div>
</body>
</html>`

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Only serve the time page on the root path; everything else is 404
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		now := time.Now().Format("15:04:05")
		fmt.Fprintf(w, page, now)
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