#!/usr/bin/env python3
"""Заглушка для Space (SDK Docker): Space должен слушать порт 7860, иначе он покажет «Runtime error».
Сам рендер идёт не здесь, а в задачах Hugging Face Jobs, которые берут образ этого Space
и запускают `python3 /app/render_chunk.py` (см. cloud/hf_render.py)."""
from http.server import BaseHTTPRequestHandler, HTTPServer

BODY = b"remotion-speed-worker: image ready (renders run as HF Jobs, see cloud/README.md)\n"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(BODY)))
        self.end_headers()
        self.wfile.write(BODY)

    def log_message(self, *args):  # без шума в логах
        pass


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 7860), Handler).serve_forever()
