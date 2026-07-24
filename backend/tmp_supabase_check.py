import pathlib, urllib.request, urllib.error, json
lines = pathlib.Path('.env').read_text(encoding='utf-8').splitlines()
url = next(l.split('=', 1)[1].strip() for l in lines if l.startswith('SUPABASE_URL='))
key = next(l.split('=', 1)[1].strip() for l in lines if l.startswith('SUPABASE_SERVICE_ROLE_KEY='))
print('PROJECT_URL', url)
print('KEY_PREFIX', key[:20])

for path, headers in [
    ('/rest/v1/sql', {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Prefer': 'return=representation'}),
    ('/rest/v1/', {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}),
]:
    req = urllib.request.Request(url + path, method='POST' if path.endswith('sql') else 'GET', headers=headers, data=json.dumps({'query': 'select 1'}).encode('utf-8') if path.endswith('sql') else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print('PATH', path, 'STATUS', r.status)
            print(r.read(500).decode('utf-8', 'replace'))
    except urllib.error.HTTPError as e:
        print('PATH', path, 'HTTP', e.code)
        print(e.read().decode('utf-8', 'replace'))
    except Exception as e:
        print('PATH', path, 'ERR', repr(e))

# Try management API with service-role key as bearer
for path in [
    'https://api.supabase.com/v1/projects/' + url.split('//')[-1].split('.')[0],
    'https://api.supabase.com/v1/projects/' + url.split('//')[-1].split('.')[0] + '/settings/database',
]:
    req = urllib.request.Request(path, method='GET', headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print('MGMT', path, 'STATUS', r.status)
            print(r.read(500).decode('utf-8', 'replace'))
    except urllib.error.HTTPError as e:
        print('MGMT', path, 'HTTP', e.code)
        print(e.read().decode('utf-8', 'replace'))
    except Exception as e:
        print('MGMT', path, 'ERR', repr(e))
