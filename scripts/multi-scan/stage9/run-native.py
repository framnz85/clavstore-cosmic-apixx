from pathlib import Path
import subprocess,json,tempfile,sys,os
base=Path(__file__).resolve().parents[3]
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
root=Path(tempfile.mkdtemp(prefix='clav-stage9-indexes-'))
worker=base/'scripts/multi-scan/stage9/native-worker.js'
reports=[]
commands=[('index-build',['build',str(root),str(out/'index-build.json')])]
commands += [(f'controlled-{n}',['benchmark',str(root),str(out/f'controlled-{n}.json'),str(n),'controlled-crops']) for n in [1,5,10]]
commands += [('yolox-native',['benchmark',str(root),str(out/'yolox-native.json'),'1','yolox'])]
for name,args in commands:
 with (out/(name+'.log')).open('x') as log:
  run=subprocess.run(['node',str(worker),*args],cwd=base,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'ORT_DISABLE_TELEMETRY':'1'},timeout=240)
 if run.returncode:
  print((out/(name+'.log')).read_text()[-5000:],flush=True)
  raise SystemExit(run.returncode)
 report=json.loads(Path(args[2]).read_text());reports.append({'name':name,'report':Path(args[2]).name,'workerMs':report['totalWorkerMs'],'peakRssBytes':report['peakProcessRssBytes']})
 print(name,'completed',round(report['totalWorkerMs'],2),'ms',flush=True)
summary={'reports':reports,'indexes':str(root),'twentyObjects':{'executed':False,'reason':'Frozen Stage 6 ScanPipeline and Stage 7 validator hard-cap 10 objects; no bypass attempted.'},'coldDefinition':'Fresh child per workload; indexes built separately; first scan loads native sessions; OS page cache is not purged. Setup includes authenticated snapshot, index read and reference photo load.','warmDefinition':'Two subsequent scans on same resident sessions/index handles.','controlledWorkload':'Actual YOLOX runs, but supplied synthetic rectangles drive crop workloads; supplied count is not a detector-accuracy result.','peakMemoryDefinition':'Process lifetime high-water RSS per child, includes model/index loading and warm/concurrency scans.','deploymentCapacityEstablished':False}
with (out/'summary.json').open('x') as f:json.dump(summary,f,indent=2)
