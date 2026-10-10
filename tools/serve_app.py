"""Serves ONLY the app's own files (the ones published on GitHub Pages), for testing on a phone through a tunnel.
Nothing else in this folder (docs, tests, demo, backend, notes) can be fetched.

    python3 tools/serve_app.py            -> http://localhost:8766
"""
import http.server, os, socketserver, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
FILES = {'/', '/index.html', '/sw.js', '/manifest.webmanifest'}
FOLDERS = ('/css/', '/js/', '/icons/')


class AppOnly(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def send_head(self):
        path = self.path.split('?', 1)[0].split('#', 1)[0]
        allowed = path == '/' or ((path in FILES or path.startswith(FOLDERS)) and '..' not in path and not path.endswith('/'))
        if not allowed or (path.startswith(FOLDERS) and os.path.isdir(self.translate_path(path))):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), AppOnly) as httpd:
    print(f'Serving the app only on http://localhost:{PORT}')
    httpd.serve_forever()
