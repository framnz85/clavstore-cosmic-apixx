from pathlib import Path
import subprocess,re,json,sys
main=Path(__file__).resolve().parents[3];ai=main.parent/'clavstore-ai-image-api';out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
files=[('stage2',main,'tests/multi-scan/stage2.test.js'),('stage3',ai,'tests/multi-scan/stage3/detector.test.js'),('stage4',ai,'tests/multi-scan/stage4/stage4.test.js'),('stage5-unit',ai,'tests/multi-scan/stage5/stage5.test.js'),('stage5-combined',ai,'tests/multi-scan/stage5/combined.test.js'),('stage5-actual',ai,'tests/multi-scan/stage5/actual-onnx.test.js'),('stage6-ocr',ai,'tests/multi-scan/stage6/ocr.test.js'),('stage6-reranker',ai,'tests/multi-scan/stage6/reranker.test.js'),('stage6-pipeline',ai,'tests/multi-scan/stage6/pipeline.test.js'),('stage6-actual',ai,'tests/multi-scan/stage6/actual-ocr.test.js')]
results={}
for name,cwd,file in files:
 p=subprocess.run(['node',file],cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 with (out/(name+'.tap')).open('x') as f:f.write(p.stdout)
 assert p.returncode==0 and '# fail 0' in p.stdout,(name,p.stdout[-2000:]);results[name]=int(re.search(r'^# tests (\d+)$',p.stdout,re.M)[1]);print(name,results[name],flush=True)
with (out/'summary.json').open('x') as f:json.dump({'counts':results,'total':sum(results.values()),'failures':0},f,indent=2)
