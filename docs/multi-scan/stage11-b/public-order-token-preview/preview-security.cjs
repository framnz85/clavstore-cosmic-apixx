'use strict';
// Review-only source-bound fixtures. Never require the application router/controllers/bootstrap.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const folder=__dirname, root=path.resolve(folder,'../../../..');
const current=fs.readFileSync(path.join(root,'routes/order.js'),'utf8');
const before=fs.readFileSync(path.join(folder,'ORDER-ROUTES-ORIGINAL.txt'),'utf8');
const after=fs.readFileSync(path.join(folder,'ORDER-ROUTES-PROPOSED.txt'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'PATCH-MANIFEST.json')));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const target='/gratis/user-order-app/:orderid';
const expected='(_req, res) => res.status(503).json({ err: "Account authority operations are temporarily unavailable." })';
const body={err:'Account authority operations are temporarily unavailable.'};
const bindings=s=>[...s.matchAll(/router\.(get|post|put|delete|patch)\(\s*"([^"]+)"\s*,([\s\S]*?)\);/g)].map(m=>({method:m[1],path:m[2],args:m[3].trim(),raw:m[0]}));
const oldRoutes=bindings(before), newRoutes=bindings(after);
const route=newRoutes.filter(r=>r.path===target);assert.equal(route.length,1);assert.equal(route[0].method,'get');assert.equal(route[0].args,expected);
const terminal=new vm.Script('('+route[0].args+')').runInNewContext(Object.create(null));
function invoke(req={}){let status=200,value,sends=0;const res={status(n){status=n;return this;},json(v){value=JSON.parse(JSON.stringify(v));sends++;return this;}};terminal(req,res);assert.equal(status,503);assert.deepEqual(value,body);assert.equal(sends,1);return {status,body:value};}
test('01 current source unmodified; proposed source has exact single-route substitution',()=>{
 assert.equal(current,before);assert.equal(sha(before),manifest.original_sha256);assert.equal(sha(after),manifest.proposed_sha256);
 const old=oldRoutes.find(r=>r.path===target);assert.equal(old.args,'userAppOrder');assert.equal(after.replace(route[0].raw,old.raw),before);
});
test('02 proposed disabled route returns generic503 for all synthetic selectors/credentials',()=>{
 for(const req of [{},{params:{orderid:'1'.repeat(24)},headers:{estoreid:'2'.repeat(24)}},{params:{orderid:'missing'},headers:{authtoken:'forged.expired.token'}},{params:{orderid:'existing'},headers:{estoreid:'another-store'}}])invoke(req);
});
test('03 terminal callback never reads request/account data',()=>{
 invoke(new Proxy({}, {get(){throw Error('Request access forbidden');}}));
});
test('04 full binding excludes original controller, guards and token/model dependencies',()=>{
 assert.equal(route[0].args,expected);assert.doesNotMatch(route[0].args,/userAppOrder|jwt|redis|Order|User|authCheck/);
 let originalCalls=0,tokenCalls=0;const f=new vm.Script('('+route[0].args+')').runInNewContext({userAppOrder(){originalCalls++;throw Error('Original handler reached');},jwt:{sign(){tokenCalls++;throw Error('Token issued');}}});
 f({}, {status(n){assert.equal(n,503);return this;},json(v){assert.equal(v.err,body.err);}});assert.equal(originalCalls,0);assert.equal(tokenCalls,0);
});
test('05 no account/order/token disclosure and identical existing/missing responses',()=>{
 const values=['known','missing','malformed',''];const results=values.map(v=>invoke({params:{orderid:v},headers:{estoreid:v},body:{email:v}}));
 assert.equal(new Set(results.map(v=>JSON.stringify(v))).size,1);assert.deepEqual(Object.keys(results[0].body),['err']);
});
test('06 every other order route and all unaffected source bytes remain exact',()=>{
 assert.equal(oldRoutes.length,newRoutes.length);assert.deepEqual(newRoutes.filter(r=>r.path!==target),oldRoutes.filter(r=>r.path!==target));
 assert.match(after,/userAppOrder,/);assert.equal(sha(fs.readFileSync(path.join(root,'controllers/order.js'))),manifest.source_pins['controllers/order.js']);
});
async function originalFixture(cached){
 const text=fs.readFileSync(path.join(root,'controllers/order.js'),'utf8');
 const start=text.indexOf('exports.userAppOrder = '),end=text.indexOf('exports.adminOrder = ',start);assert(start>=0&&end>start);
 const expr=text.slice(start+'exports.userAppOrder = '.length,end).trim().replace(/;$/,'');assert.equal((expr.match(/jwt\.sign\(/g)||[]).length,1);
 const calls={sign:[],get:0,set:0,queries:0};const order={_id:'1'.repeat(24),orderedBy:{email:'synthetic-victim@example.invalid',password:'synthetic-hash',showPass:'synthetic-only'}};
 class ObjectId{constructor(v){this.value=v;}static isValid(v){return /^[0-9a-f]{24}$/.test(v);}}
 const controller=new vm.Script('('+expr+')').runInNewContext({ObjectId,process:{env:{JWT_PRIVATE_KEY:'synthetic-test-only-key'}},
  redisClient:{async get(){calls.get++;return cached?JSON.stringify(order):null;},async set(){calls.set++;}},
  Order:{findOne(){calls.queries++;const q={populate(){return q;},lean(){return q;},async exec(){return order;}};return q;}},
  jwt:{sign(...args){calls.sign.push(JSON.parse(JSON.stringify(args)));return 'synthetic-issued-token';}}});
 let result;await controller({headers:{estoreid:'2'.repeat(24)},params:{orderid:order._id}},{json(v){result=JSON.parse(JSON.stringify(v));}});
 assert.equal(calls.sign.length,1);assert.deepEqual(calls.sign[0],[{email:order.orderedBy.email},'synthetic-test-only-key']);assert.equal(result.token,'synthetic-issued-token');assert.equal(result.order.orderedBy.email,order.orderedBy.email);
 assert.equal(calls.queries,cached?0:1);assert.equal(calls.set,cached?0:1);
}
test('07 source-extracted original cache-hit branch issues token without caller proof (owned fixtures)',()=>originalFixture(true));
test('08 source-extracted original database-result branch issues token without caller proof (owned fixtures)',()=>originalFixture(false));
test('09 proposed callback on owned Express router returns503 at mounted prefix and trailing slash',async()=>{
 const express=require('express'),http=require('node:http'),{Duplex}=require('node:stream');const app=express(),router=express.Router();router.get(target,terminal);app.use('/fixture-api',router);
 for(const url of ['/fixture-api/gratis/user-order-app/'+ '1'.repeat(24),'/fixture-api/gratis/user-order-app/'+ '1'.repeat(24)+'/']){
  await new Promise((resolve,reject)=>{const chunks=[];const socket=new Duplex({read(){},write(chunk,enc,done){chunks.push(Buffer.from(chunk));done();}});const req=new http.IncomingMessage(socket);req.url=url;req.method='GET';req.headers={estoreid:'2'.repeat(24)};req.httpVersionMajor=1;req.httpVersionMinor=1;const res=new http.ServerResponse(req);res.assignSocket(socket);
   res.once('finish',()=>{try{assert.equal(res.statusCode,503);assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString().split('\r\n\r\n')[1]),body);socket.destroy();resolve();}catch(e){reject(e);}});
   app.handle(req,res,e=>reject(e||Error('Unmatched route')));req.push(null);
  });
 }
});
