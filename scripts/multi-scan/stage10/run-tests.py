from pathlib import Path
import subprocess,json,sys,os,re
root=Path(__file__).resolve().parents[3]
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
run=subprocess.run(['node',str(root/'tests/multi-scan/stage10/readiness.test.js')],cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env={**os.environ,'ORT_DISABLE_TELEMETRY':'1'},timeout=60)
with (out/'stage10.tap').open('x') as f:f.write(run.stdout)
if run.returncode:raise RuntimeError(run.stdout[-4000:])
count=int(re.search(r'^# tests (\d+)$',run.stdout,re.M)[1])
subprocess.run(['python3',str(root/'scripts/multi-scan/stage9/run-tests.py'),str(out/'stages2-9')],check=True,timeout=360)
old=json.loads((out/'stages2-9/summary.json').read_text())
with (out/'summary.json').open('x') as f:json.dump({'stage10':count,'stages2-9':old['total'],'total':count+old['total'],'failures':0},f,indent=2)
