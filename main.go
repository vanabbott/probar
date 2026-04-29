package main

import (
	"fmt"
	"net/http"
	"time"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().Format("2006-01-02 15:04:05 MST")
		fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><title>Current Time</title></head>
<body style="font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-size:2rem;">
  <div>%s</div>
</body>
</html>`, now)
	})

	fmt.Println("Listening on :8080")
	http.ListenAndServe(":8080", nil)
}