"""Review artifacts only. Never writes a project source file or applies a patch."""
from pathlib import Path
import re,hashlib,json,difflib,subprocess,tempfile
root=Path.cwd();out=root/'docs/multi-scan/stage11-b/batch-b1-credential-security'
states={}; original={};manifest=[]
def read(f):
 if f not in states:states[f]=original[f]=(root/f).read_bytes()
 return states[f]
def replace_route(f,route,message):
 b=read(f);pattern=rb'router\.(get|post|put|delete|patch)\(\s*"'+re.escape(route.encode())+rb'"\s*,[\s\S]*?\);'
 matches=list(re.finditer(pattern,b));assert len(matches)==1,(f,route)
 m=matches[0];line=b'router.'+m[1]+b'("'+route.encode()+b'", (_req, res) => res.status(503).json({ err: "'+message.encode()+b'" }));'
 states[f]=b[:m.start()]+line+b[m.end():]
def patch(name,action):
 before=dict(states);action();changed={f:(before.get(f,original[f]),b) for f,b in states.items() if b!=before.get(f,original[f])}
 assert changed
 diff=''.join(''.join(difflib.unified_diff(a.decode().splitlines(keepends=True),b.decode().splitlines(keepends=True),fromfile='a/'+f,tofile='b/'+f)) for f,(a,b) in changed.items())
 p=out/name
 with p.open('xb') as w:w.write(diff.encode())
 # Check only, using a disposable mirror of the exact preimages for this step.
 with tempfile.TemporaryDirectory(prefix='clavstore-credential-preview-') as d:
  for f,(a,b) in changed.items():
   q=Path(d)/f;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(a)
  r=subprocess.run(['git','apply','--check',str(p)],cwd=d,capture_output=True,text=True)
  assert r.returncode==0,(name,r.stderr)
 syntax=[]
 for f,(a,b) in changed.items():
  r=subprocess.run(['node','--check'],input=b,capture_output=True)
  assert r.returncode==0,(f,r.stderr)
  syntax.append(f)
 manifest.append({'patch':name,'depends_on':manifest[-1]['patch'] if manifest else None,'files':[{'path':f,'before_sha256':hashlib.sha256(a).hexdigest(),'proposed_sha256':hashlib.sha256(b).hexdigest()} for f,(a,b) in changed.items()],'clean_check':True,'syntax_checked':syntax})
def primary():
 for f,p in [('routes/user.js','/gratis/user-update'),('routes/user.js','/gratis/update-customer/:userid'),('routes/user.js','/gratis/import-users'),('routes/appuser.js','/app/update-user')]:replace_route(f,p,'Account updates are temporarily unavailable.')
patch('01-GENERIC-WRITER-CONTAINMENT.diff',primary)
def authority():
 entries={'routes/user.js':['/gratis/user-create/:resellid','/gratis/user-verify','/gratis/delete-account-request','/gratis/user-delete/:userid'], 'routes/estore.js':['/gratis/estore-update','/gratis/estore-create/:resellid','/gratis/add-new-estore/:resellid','/gratis/copying-estore/:resellid','/gratis/update-estores-visible','/gratis/delete-estore/:deleteid'], 'routes/order.js':['/gratis/user-order-app/:orderid'], 'routes/withdraw.js':['/gratis/user-to-affiliate/:email']}
 for f,paths in entries.items():
  for p in paths:replace_route(f,p,'Account authority operations are temporarily unavailable.')
patch('02-RELATED-AUTHORITY-CONTAINMENT.diff',authority)
def repair():
 f='controllers/user.js';b=read(f)
 start=b.index(b'      if (\r\n        userWithReseller &&\r\n        !userWithReseller.estoreid')
 end=b.index(b'      if (userWithReseller) {',start)
 states[f]=b[:start]+b'      // Membership grants require a separately verified enrollment operation.\r\n\r\n'+b[end:]
patch('03-REMOVE-IMPLICIT-MEMBERSHIP-WRITE.diff',repair)
def provision():
 for f in ['controllers/order.js','controllers/app/order.js']:
  b=read(f)
  pattern=rb'        const newUser = new User\(\{[\s\S]*?        checkUser = await newUser.save\(\);'
  matches=list(re.finditer(pattern,b));assert len(matches)==2,(f,len(matches))
  replacement=b'        return res.status(409).json({\r\n          err: "Customer enrollment requires a verified account-creation flow.",\r\n        });'
  states[f]=re.sub(pattern,lambda _:replacement,b)
patch('04-STOP-SHARED-PASSWORD-PROVISIONING.diff',provision)
def payment():
 for p in ['/gratis/add-payment','/gratis/update-payment/:payid','/gratis/remove-payment/:payid']:replace_route('routes/payment.js',p,'Payment credential updates are temporarily unavailable.')
patch('05-PAYMENT-CREDENTIAL-CONTAINMENT.diff',payment)
with (out/'PATCH-MANIFEST.json').open('x') as f:json.dump({'review_only':True,'applied':False,'sequence':manifest,'original_source_hashes':{f:hashlib.sha256(b).hexdigest() for f,b in original.items()}},f,indent=2)
print('Prepared',len(manifest),'unapplied diffs; clean-check and proposed-source syntax passed')
