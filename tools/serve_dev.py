"""The test server for this Mac: every file of the project, on http://localhost:8765, never from the browser's cache.

    python3 tools/serve_dev.py

Plain `python3 -m http.server` lets the browser keep older copies of the .js and .css files, so a screen can show a
mix of new and old code. This one tells the browser to ask again each time. It listens on this computer only (not
on the Wi-Fi network): the folder also holds private documents. For a phone, use tools/serve_app.py with a tunnel.
"""
import http.server, os, socketserver, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Fresh(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, *args):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Fresh) as httpd:
    print(f'LifeDesk test server on http://localhost:{PORT} (this computer only, nothing cached)')
    httpd.serve_forever()
