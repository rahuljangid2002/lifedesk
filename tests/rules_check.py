"""Checks the database rules from outside, with an account created WITHOUT the email code
(straight through Firebase, the way someone bypassing the app would). Expected once firestore.rules is published:
that account can neither save nor read; nobody reaches another user's data; nothing works without a login.
The throw-away account (example.com) and anything it wrote are deleted at the end.

    python3 tests/rules_check.py
"""
import json, sys, time, urllib.request, urllib.error

KEY = 'AIzaSyCV6JwF2Unc3QljVGBa1Mff8SCiVSzIUIc'  # public web key, as in js/config.js
DOCS = 'https://firestore.googleapis.com/v1/projects/lifedesk-43dc1/databases/default/documents'
AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts'


def call(url, body=None, headers=None, method=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **(headers or {})}, method=method)
    try:
        return urllib.request.urlopen(req).status
    except urllib.error.HTTPError as e:
        return e.code


req = urllib.request.Request(f'{AUTH}:signUp?key={KEY}', data=json.dumps(
    {'email': f'selftest.bypass.{int(time.time())}@example.com', 'password': f'Bypass-{time.time()}', 'returnSecureToken': True}).encode(),
    headers={'Content-Type': 'application/json'})
acct = json.load(urllib.request.urlopen(req))
H = {'Authorization': 'Bearer ' + acct['idToken']}
mine = f"{DOCS}/users/{acct['localId']}/accounts"
other = f'{DOCS}/users/someone-else/accounts'
doc = {'fields': {'name': {'stringValue': 'probe'}}}
results = [
    ('unverified account cannot save', call(mine + '?documentId=probe', doc, H) == 403),
    ('unverified account cannot read', call(mine + '/probe', headers=H) == 403),
    ("cannot read another user's data", call(other + '/probe', headers=H) == 403),
    ("cannot write another user's data", call(other + '?documentId=probe', doc, H) == 403),
    ('nothing without a login', call(mine + '/probe') == 403),
]
call(mine + '/probe', headers=H, method='DELETE')
deleted = call(f'{AUTH}:delete?key={KEY}', {'idToken': acct['idToken']}) == 200
for name, ok in results:
    print('PASS' if ok else 'FAIL', name)
print('test account deleted:', deleted)
sys.exit(0 if all(ok for _, ok in results) else 1)
