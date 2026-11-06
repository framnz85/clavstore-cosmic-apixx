from pathlib import Path
import subprocess,sys,os,json,re
main=Path(__file__).resolve().parents[3]
frontend=main.parent.parent/'clavstore-ui/clavstore-reseller-original'
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
counts={}
commands=[('stage9-pipeline',main,['node','tests/multi-scan/stage9/pipeline.test.js']),('stage9-evaluation',main,['node','tests/multi-scan/stage9/evaluation.test.js'])]
commands += [('stage7-'+name,main,['node',f'tests/multi-scan/stage7/{name}.test.js']) for name in ['security-catalog','repository','service']]
commands += [('frontend-stages8-9',frontend,['node','node_modules/jest/bin/jest.js','--config','scripts/multi-scan/stage9/jest.config.cjs','--runInBand','--no-cache'])]
for name,cwd,cmd in commands:
 p=subprocess.run(cmd,cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env={**os.environ,'NODE_ENV':'test','ORT_DISABLE_TELEMETRY':'1'},timeout=120)
 with (out/(name+'.log')).open('x') as f:f.write(p.stdout)
 if p.returncode:raise RuntimeError(name+' failed: '+p.stdout[-4000:])
 match=re.search(r'^# tests (\d+)$',p.stdout,re.M) if not name.startswith('frontend') else re.search(r'Tests:\s+(\d+) passed',p.stdout)
 if not match:raise RuntimeError('Missing test count '+name)
 counts[name]=int(match[1]);print(name,counts[name],flush=True)
subprocess.run(['python3',str(main/'scripts/multi-scan/stage7/regressions.py'),str(out/'stages2-6')],check=True,env={**os.environ,'ORT_DISABLE_TELEMETRY':'1'},timeout=180)
counts['stages2-6']=json.loads((out/'stages2-6/summary.json').read_text())['total']
with (out/'summary.json').open('x') as f:json.dump({'counts':counts,'total':sum(counts.values()),'failures':0},f,indent=2)
