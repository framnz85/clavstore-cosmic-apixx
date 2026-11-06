import os,json,hashlib,subprocess,argparse,threading,queue,time,gzip
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--before');parser.add_argument('--output',required=True);args=parser.parse_args()
roots=['/mnt/g/clavstore/clavstore-ui/clavstore-reseller-original','/mnt/g/clavstore/clavstore-api/clavstore-cosmic-api','/mnt/g/clavstore/clavstore-api/clavstore-ai-image-api']
report={'exclusions':[],'projects':{}}; lock=threading.Lock(); count=0; errors=[]; permits=threading.Semaphore(128)
def status(root):
 return subprocess.run(['git','-C',root,'status','--porcelain','--','.'],capture_output=True,text=True,check=True,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'}).stdout
with ThreadPoolExecutor(max_workers=16) as filepool:
 def hashfile(root,path):
  global count
  try:
   h=hashlib.sha256()
   with open(path,'rb') as f:
    for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
   with lock:
    report['projects'][root]['files'][os.path.relpath(path,root)]=h.hexdigest();count+=1
    if count%5000==0:print('Hashed',count,'files',flush=True)
  except Exception as e:
   with lock:errors.append({'path':path,'error':str(e)})
  finally:permits.release()
 q=queue.Queue()
 for root in roots:
  report['projects'][root]={'git_status':status(root),'files':{},'symlinks':{}};q.put((root,root))
 def walker():
  while True:
   item=q.get()
   if item is None:q.task_done();return
   root,directory=item
   try:
    with os.scandir(directory) as entries:
     for entry in entries:
      if entry.is_symlink():
       with lock:report['projects'][root]['symlinks'][os.path.relpath(entry.path,root)]=os.readlink(entry.path)
      elif entry.is_dir(follow_symlinks=False):q.put((root,entry.path))
      elif entry.is_file(follow_symlinks=False):
       permits.acquire();filepool.submit(hashfile,root,entry.path)
   except Exception as e:
    with lock:errors.append({'path':directory,'error':str(e)})
   finally:q.task_done()
 workers=[threading.Thread(target=walker) for _ in range(8)]
 for t in workers:t.start()
 q.join()
 for t in workers:q.put(None)
 for t in workers:t.join()
report['errors']=errors
if args.before:
 before=json.loads((gzip.open(args.before,'rt') if args.before.endswith('.gz') else open(args.before)).read());report['unchanged']=not errors
 for root,p in report['projects'].items():
  old=before['projects'][root]
  p['changed']=[f for f,h in old['files'].items() if f in p['files'] and p['files'][f]!=h]
  p['missing']=[f for f in old['files'] if f not in p['files']]
  p['changed_symlinks']=[f for f,target in old['symlinks'].items() if p['symlinks'].get(f)!=target]
  p['new_files']=sorted(set(p['files'])-set(old['files']))
  p['protected_file_count']=len(old['files']);p['git_status_before']=old['git_status']
  if p['changed'] or p['missing'] or p['changed_symlinks']:report['unchanged']=False
  print(Path(root).name,'protected',len(old['files']),'changed',len(p['changed']),'missing',len(p['missing']),flush=True)
with open(args.output,'xb') as f:
 data=json.dumps(report,indent=2).encode()
 f.write(gzip.compress(data,mtime=0) if args.output.endswith('.gz') else data)
print('DONE',count,'files','errors',len(errors),'unchanged',report.get('unchanged'),flush=True)
raise SystemExit(bool(errors) or (args.before is not None and not report['unchanged']))
