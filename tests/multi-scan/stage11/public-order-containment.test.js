'use strict';
// Source-bound isolated fixtures; no application router/controller/model/bootstrap import.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const root=path.resolve(__dirname,'../../..');
const folder=path.join(root,'docs/multi-scan/stage11-b/public-order-token-implementation');
const original=fs.readFileSync(path.join(folder,'ORDER-ROUTES-ORIGINAL.txt'),'utf8');
const actual=fs.readFileSync(path.join(root,'routes/order.js'),'utf8');
const baseline=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(folder,'BASELINE.json.gz'))));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bindings=s=>[...s.matchAll(/router\.(get|post|put|delete|patch)\(\s*"([^"]+)"\s*,([\s\S]*?)\);/g)].map(m=>({method:m[1],path:m[2],args:m[3].trim(),raw:m[0]}));
const target='/gratis/user-order-app/:orderid';
const expected='(_req, res) => res.status(503).json({ err: "Account authority operations are temporarily unavailable." })';
const response={err:'Account authority operations are temporarily unavailable.'};
const oldRoutes=bindings(original),newRoutes=bindings(actual);
const matching=newRoutes.filter(r=>r.path===target);assert.equal(matching.length,1);const route=matching[0];assert.equal(route.method,'get');assert.equal(route.args,expected);
const terminal=new vm.Script('('+route.args+')').runInNewContext(Object.create(null));
function call(req={}){let status=200,body,sends=0;const res={status(n){status=n;return this;},json(v){body=JSON.parse(JSON.stringify(v));sends++;return this;}};terminal(req,res);assert.equal(status,503);assert.deepEqual(body,response);assert.equal(sends,1);return {status,body};}
function pinned(file){assert.equal(sha(fs.readFileSync(path.join(root,file))),baseline.projects[root].files[file],file);}
test('01 applied router has exact approved hashes and only one source substitution',()=>{
 assert.equal(sha(original),'cab1f734e9b34b2585d3f8777b42325ba934412a7d6a639925dad61b796664bd');
 assert.equal(sha(actual),'2a448f501d35157b9c4a11ac3c0a2a21ed476aeb6f8d4d7dceb8064457223bdf');
 const old=oldRoutes.find(r=>r.path===target);assert.equal(old.args,'userAppOrder');assert.equal(actual.replace(route.raw,old.raw),original);
});
test('02 actual source-bound endpoint returns503 regardless of credentials/order/store selectors',()=>{
 for(const req of [{},{headers:{estoreid:'2'.repeat(24)},params:{orderid:'1'.repeat(24)}},{headers:{authtoken:'forged.expired.token'},params:{orderid:'missing'}},{headers:{estoreid:'other-store',authtoken:'synthetic-admin-token'},params:{orderid:'known'}}])call(req);
});
test('03 original controller, token issuer and model/cache functions are not called',()=>{
 const calls={controller:0,sign:0,model:0,cache:0};
 const fn=new vm.Script('('+route.args+')').runInNewContext({userAppOrder(){calls.controller++;throw Error('Original called');},jwt:{sign(){calls.sign++;throw Error('Token issued');}},Order:{findOne(){calls.model++;throw Error('Query');}},redisClient:{get(){calls.cache++;throw Error('Cache');}}});
 fn({}, {status(n){assert.equal(n,503);return this;},json(v){assert.equal(v.err,response.err);}});
 assert.deepEqual(calls,{controller:0,sign:0,model:0,cache:0});assert.equal(route.args,expected);
});
test('04 no request/account information read or disclosed; constant existing/missing response',()=>{
 call(new Proxy({}, {get(){throw Error('Request access');}}));
 const outputs=[];for(const id of ['known','missing','','malformed'])outputs.push(call({params:{orderid:id},headers:{estoreid:id},body:{email:id,password:'synthetic'}}));
 assert.equal(new Set(outputs.map(v=>JSON.stringify(v))).size,1);assert.deepEqual(Object.keys(outputs[0].body),['err']);
});
test('05 all21 other order bindings and original controller imports/source remain unchanged',()=>{
 assert.equal(newRoutes.length,22);assert.equal(oldRoutes.length,22);assert.deepEqual(newRoutes.filter(r=>r.path!==target),oldRoutes.filter(r=>r.path!==target));
 assert.match(actual,/userAppOrder,/);pinned('controllers/order.js');pinned('middlewares/auth.js');
});
test('06 source-bound callback on owned Express router: mounted GET, trailing slash and implicit HEAD503',async()=>{
 const express=require('express'),http=require('node:http'),{Duplex}=require('node:stream');const app=express(),router=express.Router();router.get(target,terminal);app.use('/fixture-api',router);
 for(const [method,suffix] of [['GET',''],['GET','/'],['HEAD','']])await new Promise((resolve,reject)=>{
  const chunks=[];const socket=new Duplex({read(){},write(chunk,enc,done){chunks.push(Buffer.from(chunk));done();}});
  const req=new http.IncomingMessage(socket);req.url='/fixture-api/gratis/user-order-app/'+'1'.repeat(24)+suffix;req.method=method;req.headers={estoreid:'2'.repeat(24)};req.httpVersionMajor=1;req.httpVersionMinor=1;
  const res=new http.ServerResponse(req);res.assignSocket(socket);res.once('finish',()=>{try{assert.equal(res.statusCode,503);const body=Buffer.concat(chunks).toString().split('\r\n\r\n')[1];if(method==='HEAD')assert.equal(body,'');else assert.deepEqual(JSON.parse(body),response);socket.destroy();resolve();}catch(e){reject(e);}});
  app.handle(req,res,e=>reject(e||Error('Unmatched fixture route')));req.push(null);
 });
});
test('07 existing recovery routes stay exact terminal503 and user router is unmodified',()=>{
 pinned('routes/user.js');const s=fs.readFileSync(path.join(root,'routes/user.js'),'utf8');assert.equal(sha(s),'a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd');
 for(const p of ['/gratis/forgot-password','/gratis/reset-password/:userid']){
  const matches=bindings(s).filter(r=>r.path===p);assert.equal(matches.length,1);assert.equal(matches[0].method,'put');
  assert.equal(matches[0].args,'(_req, res) => res.status(503).json({ err: "Password recovery is temporarily unavailable." })');
  const fn=new vm.Script('('+matches[0].args+')').runInNewContext(Object.create(null));fn(new Proxy({}, {get(){throw Error('Recovery request read');}}),{status(n){assert.equal(n,503);return this;},json(v){assert.equal(v.err,'Password recovery is temporarily unavailable.');}});
 }
});
test('08 scanner defaults fail closed; protected router and historical inventory hashes unchanged',()=>{
 const {config}=require('../../../services/multi-scan/contracts');const {readSessionConfig}=require('../../../services/multi-scan/stage11/session-config');
 for(const value of [undefined,'false','','TRUE','1','true ','yes']){const env=value===undefined?{}:{MULTI_SCAN_ENABLED:value};assert.equal(config(env).enabled,false);assert.equal(readSessionConfig(true,value===undefined?{}:{MULTI_SCAN_SESSION_ENABLED:value}).enabled,false);}
 assert.equal(readSessionConfig(false,{MULTI_SCAN_SESSION_ENABLED:'true'}).enabled,false);
 assert.equal(sha(fs.readFileSync(path.join(root,'routes/multi-scan.js'))),'469c88c14c7472b59aa145e74c785d8ec85adbd1540a8be3fcffd0f98cd99836');
 assert.equal(sha(fs.readFileSync(path.join(root,'tests/multi-scan/stage2.test.js'))),'a7ff4edd000f7882b9d27e4b3c7e709904a5063f0ddf7dbdadd1ff56465ebe4a');
 pinned('routes/multi-scan.js');pinned('tests/multi-scan/stage2.test.js');
});
test('09 login/token-generation sources and frontend payment sources remain untouched',()=>{
 for(const f of ['controllers/auth.js','controllers/app/user.js','controllers/user.js','routes/auth.js','routes/appuser.js','services/multi-scan/stage11/session-service.js'])pinned(f);
 const front=path.resolve(root,'../../clavstore-ui/clavstore-reseller-original');
 for(const f of ['src/functions/order.js','src/pages/user/AppPayment.js','src/pages/user/OrderDetails.js','src/App.js'])assert.equal(sha(fs.readFileSync(path.join(front,f))),baseline.projects[front].files[f],f);
});
