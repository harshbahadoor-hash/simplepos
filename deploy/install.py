"""Install an uploaded static release while preserving existing Caddy sites."""
from pathlib import Path
import datetime
import os
import shutil
import subprocess

# Validate with the running service's ACME setting without printing its value.
pid = subprocess.check_output(['systemctl', 'show', 'caddy', '--property=MainPID', '--value'], text=True).strip()
for entry in Path('/proc/' + pid + '/environ').read_bytes().split(b'\0'):
    if entry.startswith(b'CADDY_ACME_EMAIL='):
        os.environ['CADDY_ACME_EMAIL'] = entry.split(b'=', 1)[1].decode()

root = Path('/srv/simplepos')
release = root / 'releases' / '20261004-1'
if not (release / 'index.html').exists():
    raise SystemExit('Release files missing')
for item in [release, *release.rglob('*')]:
    item.chmod(0o755 if item.is_dir() else 0o644)
config = Path('/etc/caddy/Caddyfile')
site = Path('/tmp/simplepos.caddy').read_text()
hostname = 'new.a7k2mq9xb4rt8vl1nc6pz3wy5df0hj7sr2km9qx4un8ep1tv6gw3ba5cd0.com'
existing = config.read_text()
if hostname in existing:
    raise SystemExit('Hostname already configured; inspect before modifying')
backup = config.with_name('Caddyfile.simplepos-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S'))
shutil.copy2(config, backup)
candidate = config.with_name('Caddyfile.simplepos-candidate')
candidate.write_text(existing + '\n' + site)
subprocess.run(['caddy', 'validate', '--config', str(candidate), '--adapter', 'caddyfile'], check=True)
temp = root / 'current-next'
if temp.is_symlink():
    temp.unlink()
temp.symlink_to(release)
os.replace(temp, root / 'current')
os.replace(candidate, config)
try:
    subprocess.run(['systemctl', 'reload', 'caddy'], check=True)
except Exception:
    shutil.copy2(backup, config)
    subprocess.run(['systemctl', 'reload', 'caddy'], check=True)
    raise
print('Installed', release, 'Caddy backup:', backup)
