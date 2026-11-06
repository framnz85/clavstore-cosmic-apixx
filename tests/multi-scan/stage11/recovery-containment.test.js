// Source-bound isolated fixtures: never import application routers/controllers/models.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../../..');
const doc = path.join(root, 'docs/multi-scan/stage11-b/batch-b1-reset-containment');
const source = fs.readFileSync(path.join(root, 'routes/user.js'), 'utf8');
const original = fs.readFileSync(path.join(doc, 'USER-ROUTES-ORIGINAL.txt'), 'utf8');
const baseline = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(doc, 'BASELINE.json.gz'))));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const body = {err: 'Password recovery is temporarily unavailable.'};
const callback = '(_req, res) => res.status(503).json({ err: "Password recovery is temporarily unavailable." })';
// Constrained reader is deliberately restricted to the verified registration format.
function bindings(s) {
  return [...s.matchAll(/router\.(get|post|put|delete|patch)\(\s*"([^"]+)"\s*,([\s\S]*?)\);/g)]
    .map(m => ({method:m[1], path:m[2], args:m[3].trim(), raw:m[0]}));
}
const routes = bindings(source), oldRoutes = bindings(original);
const names = ['/gratis/forgot-password', '/gratis/reset-password/:userid'];
const functions = names.map(p => {
  const matches = routes.filter(r => r.path === p);
  assert.equal(matches.length, 1); assert.equal(matches[0].method, 'put');
  assert.equal(matches[0].args, callback); // entire middleware argument list, not a fragment
  return new vm.Script('(' + matches[0].args + ')').runInNewContext(Object.create(null));
});
function call(which, req = {}) {
  let code = 200, value, sends = 0;
  const res = {status(n) {code=n; return this;}, json(v) {value=JSON.parse(JSON.stringify(v)); sends++;return this;}};
  functions[which](req, res);
  assert.equal(code, 503); assert.deepEqual(value, body); assert.equal(sends, 1);
  return JSON.stringify({code, value});
}
function pinned(file) {
  assert.equal(sha(fs.readFileSync(path.join(root,file))), baseline.projects[root].files[file], file);
}
function exported(file, name, sandbox) {
  const s=fs.readFileSync(path.join(root,file),'utf8');
  const start=s.indexOf('exports.'+name+' = '); assert.ok(start>=0);
  const end=s.indexOf('\nexports.',start+1);
  let expr=s.slice(start,end<0?undefined:end).split(' = ').slice(1).join(' = ').trim();
  assert.ok(expr.endsWith(';')); expr=expr.slice(0,-1);
  return new vm.Script('('+expr+')').runInNewContext(sandbox);
}
test('01 forgot returns uniform 503 for absent/existing/missing/empty selectors',()=>{
  for(const b of [undefined,{}, {email:'existing@example.invalid'}, {email:'missing@example.invalid'}, {email:'',password:'fixture'}])call(0,{body:b});
});
test('02 reset binding returns 503 and Express mounted/trailing-slash routing reaches terminal callback',async()=>{
  call(1,{params:{userid:'000000000000000000000001'}});call(1);
  const express=require('express'),http=require('node:http'),{Duplex}=require('node:stream');
  const app=express(),router=express.Router();
  names.forEach((p,i)=>router.put(p,functions[i]));app.use('/api',router);
  for(const url of ['/api/gratis/forgot-password','/api/gratis/forgot-password/','/api/gratis/reset-password/000000000000000000000001']) {
    await new Promise((resolve,reject)=>{
      const chunks=[];const socket=new Duplex({read(){},write(chunk,enc,done){chunks.push(Buffer.from(chunk));done();}});
      const req=new http.IncomingMessage(socket);req.url=url;req.method='PUT';req.headers={};req.httpVersionMajor=1;req.httpVersionMinor=1;
      const res=new http.ServerResponse(req);res.assignSocket(socket);
      res.once('finish',()=>{try{assert.equal(res.statusCode,503);const wire=Buffer.concat(chunks).toString();assert.deepEqual(JSON.parse(wire.split('\r\n\r\n')[1]),body);socket.destroy();resolve();}catch(e){reject(e);}});
      app.handle(req,res,e=>reject(e||new Error('Unmatched fixture route')));req.push(null);
    });
  }
});
test('03 old handlers and auth guards are absent from both complete binding chains',()=>{
  for(const p of names){const r=routes.find(r=>r.path===p);assert.equal(r.args,callback);assert.doesNotMatch(r.args,/authCheck|adminGratisCheck|resetPassword|forgotPassword/);}
  assert.match(source,/resetPassword,/);assert.match(source,/forgotPassword,/);
  pinned('controllers/user.js');pinned('middlewares/auth.js');
});
test('04 request is never read; no model/proof/secret dependencies are available',()=>{
  const unreadable=new Proxy({}, {get(){throw Error('Forbidden request access');}});
  functions.forEach((_,i)=>call(i,unreadable));
  assert.equal(callback,'(_req, res) => res.status(503).json({ err: "Password recovery is temporarily unavailable." })');
});
const jwt=p=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.forged';
test('05 forged JWT denied before legacy guard/controller',()=>call(1,{headers:{authtoken:jwt({email:'staff@example.invalid'})}}));
test('06 expired JWT denied before legacy guard/controller',()=>call(1,{headers:{authtoken:jwt({email:'staff@example.invalid',exp:1})}}));
test('07 cashier context cannot reset another/admin account',()=>{
  for(const role of ['admin','customer'])call(1,{user:{role:'cashier'},params:{userid:role+'-fixture'},body:{password:'fixture'}});
});
test('08 conflicting and forged cross-store selectors denied on both endpoints',()=>{
  functions.forEach((_,i)=>call(i,{user:{role:'cashier',estoreid:'A'},headers:{estoreid:'B',authtoken:jwt({email:'claimed-B-staff@example.invalid'})},params:{userid:'B-admin'},body:{estoreid:'B',email:'B@example.invalid',password:'fixture'}}));
});
test('09 login files unchanged; original normal login success/error behavior with owned fake dependencies',async()=>{
  for(const p of ['routes/auth.js','controllers/auth.js','routes/appuser.js','controllers/app/user.js'])pinned(p);
  const md5=require('md5');let query,claims;
  const login=exported('controllers/auth.js','loginUser',{User:{findOne(q){query=q;return {exec:async()=>q.password===md5('correct')?{role:'customer'}:null};}},md5,jwt:{sign(p,key){assert.equal(key,'fixture-only-key');claims=p;return 'fixture-token';}},process:{env:{JWT_PRIVATE_KEY:'fixture-only-key'}}});
  let result;const res={json(v){result=JSON.parse(JSON.stringify(v));}};
  await login({body:{email:'test@example.invalid',password:'correct'}},res);assert.equal(result,'fixture-token');assert.equal(query.password,md5('correct'));assert.equal(claims.email,'test@example.invalid');
  await login({body:{email:'test@example.invalid',password:'wrong'}},res);assert.deepEqual(result,{err:'Invalid email or password.'});
});
test('10 other eighteen bindings and every other source byte unchanged; old-password proof fixture retained',async()=>{
  assert.equal(routes.length,20);assert.equal(oldRoutes.length,20);
  assert.deepEqual(routes.filter(r=>!names.includes(r.path)),oldRoutes.filter(r=>!names.includes(r.path)));
  const lines=source.split('\r\n');let restored=source;
  for(const p of names){const now=routes.find(r=>r.path===p);const old=oldRoutes.find(r=>r.path===p);restored=restored.replace(now.raw,old.raw);}
  assert.equal(restored,original);assert.equal(sha(Buffer.from(original)),'0dd77b60b993926406bfdc2ebeee92dff90966e92a3c955785313df95460516e');assert.ok(lines.length>1);
  const md5=require('md5');let writes=0,result;
  const change=exported('controllers/user.js','changePassword',{ObjectId:class {constructor(v){this.value=v;}},md5,User:{async findOneAndUpdate(filter,update){assert.equal(filter.email,'fixture@example.invalid');assert.equal(filter.estoreid.value,'store-A');if(filter.password!==md5('old'))return null;assert.equal(update.password,md5('new'));writes++;return {_id:'fixture'};}},clearOneItemCache(){}});
  for(const oldpassword of ['wrong','old']){await change({headers:{estoreid:'store-A'},user:{email:'fixture@example.invalid'},body:{oldpassword,newpassword:'new'}},{json(v){result=JSON.parse(JSON.stringify(v));}});if(oldpassword==='wrong')assert.ok(result.err);else assert.equal(result._id,'fixture');}assert.equal(writes,1);
});
test('11 no account existence disclosure or selector-dependent response',()=>{
  const outputs=[];for(let i=0;i<50;i++)for(let route=0;route<2;route++)outputs.push(call(route,{body:{email:(i%2?'existing':'missing')+i+'@example.invalid',estoreid:i},params:{userid:String(i)}}));
  assert.equal(new Set(outputs).size,1);
});
test('12 scanner implementation and historical inventory pins retained; defaults fail closed',()=>{
  assert.equal(sha(fs.readFileSync(path.join(root,'routes/multi-scan.js'))),'469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836');
  assert.equal(sha(fs.readFileSync(path.join(root,'tests/multi-scan/stage2.test.js'))),'a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a');
  pinned('routes/multi-scan.js');pinned('middlewares/multi-scan-auth.js');
});
