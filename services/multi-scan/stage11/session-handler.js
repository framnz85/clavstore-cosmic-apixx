'use strict';
const {randomUUID} = require('node:crypto');
const {messages,fault} = require('./session-config');
function validate(req) {
  const b = req.body;
  if (!req.is('application/json') || !b || Array.isArray(b) || typeof b !== 'object') throw fault(400,'INVALID_PAYLOAD');
  if (Buffer.byteLength(JSON.stringify(b)) > 8192) throw fault(413,'TOO_LARGE');
  if (Object.keys(b).sort().join(',') !== 'email,password,storeId' ||
      typeof b.email !== 'string' || b.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ||
      typeof b.password !== 'string' || b.password.length === 0 || Buffer.byteLength(b.password) > 1024 ||
      typeof b.storeId !== 'string' || !/^[a-f0-9]{24}$/.test(b.storeId)) throw fault(400,'INVALID_PAYLOAD');
  // Legacy authtoken and tenant headers are not authentication for issuance.
  if (req.headers.authtoken !== undefined || req.headers.estoreid !== undefined || req.headers.resellid !== undefined)
    throw fault(400,'INVALID_PAYLOAD');
  const value = req.headers.authorization;
  if (value !== undefined && (typeof value !== 'string' || value.length > 8200 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)))
    throw fault(401,'INVALID_TOKEN');
  return {input:{email:b.email,password:b.password,storeId:b.storeId},bearer:value === undefined ? undefined : value.slice(7)};
}
function begin(req,res,next) {
  req.scannerSessionRequestId = randomUUID();
  res.set('Cache-Control','no-store');res.set('Pragma','no-cache');next();
}
function error(err,req,res,next) {
  if (res.headersSent) return next(err);
  let status = 503, code = 'UNAVAILABLE';
  if (err && err.sessionFault === true && Object.hasOwnProperty.call(messages,err.code)) {
    status=err.status;code=err.code;
  } else if (err && err.type === 'entity.too.large') {status=413;code='TOO_LARGE';}
  else if (err && err.type === 'entity.parse.failed') {status=400;code='INVALID_PAYLOAD';}
  else if (err && ['STORE_FORBIDDEN','PACKAGE_FORBIDDEN','ROLE_FORBIDDEN','IDENTITY_MISMATCH'].includes(err.code)) {status=403;code='DENIED';}
  if (status === 429) res.set('Retry-After','60');
  res.status(status).json({error:{code,message:messages[code]},requestId:req.scannerSessionRequestId});
}
module.exports = {validate,begin,error};
