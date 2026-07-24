import json
import os
import urllib.error
import urllib.request
from pathlib import Path


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"\''))


backend_dir = Path(__file__).resolve().parent.parent
load_env(backend_dir / '.env')

project_url = os.getenv('SUPABASE_URL', '').rstrip('/')
service_role_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

placeholder_values = {'https://your-project.supabase.co', 'your-anon-key', 'your-service-role-key'}
if not project_url or project_url in placeholder_values or not project_url.startswith('https://'):
    raise RuntimeError('Set a real SUPABASE_URL in backend/.env before running this migration helper.')
if not service_role_key or service_role_key in placeholder_values or service_role_key.startswith('your-'):
    raise RuntimeError('Set a real SUPABASE_SERVICE_ROLE_KEY in backend/.env before running this migration helper.')

endpoint = f'{project_url}/rest/v1/sql'
db_dir = Path(__file__).resolve().parent
files = [db_dir / '001_init_schema.sql', db_dir / '002_seed_data.sql']

for file_path in files:
    sql = file_path.read_text(encoding='utf-8')
    req = urllib.request.Request(
        endpoint,
        method='POST',
        headers={
            'apikey': service_role_key,
            'Authorization': f'Bearer {service_role_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        data=json.dumps({'query': sql}).encode('utf-8')
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
            print(f'OK {file_path.name}: {resp.status}')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print(f'ERROR {file_path.name}: {e.code}')
        print(body)
        raise

check_req = urllib.request.Request(
    f'{project_url}/rest/v1/products?select=id,name,slug&limit=5',
    method='GET',
    headers={
        'apikey': service_role_key,
        'Authorization': f'Bearer {service_role_key}',
        'Content-Type': 'application/json'
    }
)
with urllib.request.urlopen(check_req, timeout=120) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print('VERIFIED_PRODUCTS', json.dumps(data, indent=2))
