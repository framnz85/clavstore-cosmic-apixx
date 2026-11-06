"""Run synthetic auth fixtures without changing application environment files or opening ports."""
from pathlib import Path
import os, sys, json, secrets, subprocess
root=Path(__file__).resolve().parents[3]
out=Path(sys.argv[1]).resolve();out.mkdir(parents=True,exist_ok=False)
script=root/'tests/multi-scan/stage11/auth-session.test.js'
env={**os.environ,'NODE_ENV':'test','MULTI_SCAN_ENABLED':'false',
     'MULTI_SCAN_SESSION_JWT_KEY':secrets.token_hex(48),
     'MULTI_SCAN_SESSION_ISSUER':'cosmic-clavstore-scanner',
     'MULTI_SCAN_SESSION_AUDIENCE':'clavstore-multiscan-review'}
rows=[]
for value in [None,'false','','TRUE','1','true ','yes']:
    child_env={**env};child_env.pop('MULTI_SCAN_SESSION_ENABLED',None)
    if value is not None:child_env['MULTI_SCAN_SESSION_ENABLED']=value
    run=subprocess.run(['node',str(script),'--flag-probe'],cwd=root,env=child_env,
                       capture_output=True,text=True,timeout=15)
    if run.returncode:raise RuntimeError('Flag probe failed: '+run.stderr)
    rows.append({'value':value,'result':json.loads(run.stdout)})
flags=out/'FLAG-RESULTS.json'
with flags.open('x') as f:json.dump(rows,f,indent=2)
run=subprocess.run(['node',str(script),'--fixture-worker','--flag-results',str(flags)],cwd=root,
                   env={**env,'MULTI_SCAN_SESSION_ENABLED':'true'},capture_output=True,text=True,timeout=60)
with (out/'SECURITY.tap').open('x') as f:f.write(run.stdout);f.write(run.stderr)
print(run.stdout,flush=True)
if run.stderr:print(run.stderr,file=sys.stderr)
sys.exit(run.returncode)
