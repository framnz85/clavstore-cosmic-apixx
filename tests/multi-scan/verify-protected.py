"""Read-only SHA-256 verification; only an explicitly new output file is written."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--baseline', default=str(Path(__file__).resolve().parents[2] / 'docs/multi-scan/protected-files.before.json'))
parser.add_argument('--output', required=True, help='New report path; existing files are never overwritten')
args = parser.parse_args()
baseline = json.loads(Path(args.baseline).read_text())
report = {'baseline': args.baseline, 'exclusions': baseline['exclusions'], 'projects': {}, 'unchanged': True}
for root, project in baseline['projects'].items():
    changed, missing = [], []
    for rel, expected in project['files'].items():
        file = Path(root) / rel
        if not file.is_file() or file.is_symlink():
            missing.append(rel)
            continue
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1048576), b''):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            changed.append(rel)
    for rel, target in project['symlinks'].items():
        file = Path(root) / rel
        if not file.is_symlink() or os.readlink(file) != target:
            changed.append(rel)
    current = set()
    for directory, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in baseline['exclusions']]
        for name in files:
            current.add(os.path.relpath(os.path.join(directory, name), root))
    old = set(project['files']) | set(project['symlinks'])
    report['projects'][root] = {
        'protected_files': len(project['files']), 'protected_symlinks': len(project['symlinks']),
        'changed': changed, 'missing': missing, 'new_files': sorted(current - old),
        'git_status_before': project['git_status'],
        'git_status_after': subprocess.run(['git', '-C', root, 'status', '--porcelain', '--', '.'], capture_output=True, text=True, check=True).stdout,
    }
    if changed or missing:
        report['unchanged'] = False
    print(root, 'verified', len(project['files']), 'changed', len(changed), 'missing', len(missing), flush=True)
with open(args.output, 'x') as stream:
    json.dump(report, stream, indent=2)
print('UNCHANGED:', report['unchanged'])
raise SystemExit(0 if report['unchanged'] else 1)
