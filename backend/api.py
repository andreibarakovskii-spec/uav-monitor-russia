from http.server import BaseHTTPRequestHandler, HTTPServer
import json

EVENTS = []

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/events":
            body = json.dumps(EVENTS, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


def run():
    HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()

if __name__ == "__main__":
    run()
