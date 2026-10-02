"""Helpers for showing the real sign-up screens in the demo (passphrase and recovery code) without a real inbox.

A throw-away account on example.com is created in the real Firebase project and deleted again by cleanup().
On localhost the app accepts the flag below to treat that account's email as verified, and the code service is
answered by the recording script, so no email is sent.
"""
import json, time, urllib.request, urllib.error

KEY = 'AIzaSyCV6JwF2Unc3QljVGBa1Mff8SCiVSzIUIc'
DOCS = 'https://firestore.googleapis.com/v1/projects/lifedesk-43dc1/databases/default/documents'
EMAIL = f'aarav.mehta.demo{int(time.time()) % 100000}@example.com'
PASSWORD = f'Demo-login-{int(time.time())}'
FLAGS = "localStorage.setItem('lifedesk-test-verified', '1');"


def answer_codes(context):
    context.route('**/macros/s/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"ok": true, "minutes": 10}'))


def _post(url, body=None, token=None, method=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    try:
        return json.loads(urllib.request.urlopen(req).read().decode() or '{}')
    except urllib.error.HTTPError:
        return None


def cleanup():
    """Deletes the throw-away account and its key record. Safe to call when it was never created."""
    auth = _post(f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}', {'email': EMAIL, 'password': PASSWORD, 'returnSecureToken': True})
    if not auth:
        return False
    _post(f"{DOCS}/users/{auth['localId']}/vault/key", token=auth['idToken'], method='DELETE')
    return _post(f'https://identitytoolkit.googleapis.com/v1/accounts:delete?key={KEY}', {'idToken': auth['idToken']}) is not None
