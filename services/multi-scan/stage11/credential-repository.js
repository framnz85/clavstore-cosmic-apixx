'use strict';
const {createHash,timingSafeEqual} = require('node:crypto');
const {projections} = require('../stage7/repository');
const {id,abort} = require('../stage7/contracts');
const {fault} = require('./session-config');
class CredentialRepository {
  constructor({User,Estore} = {}) {
    if (![User,Estore].every(model => model && typeof model.find === 'function')) throw fault(503,'UNAVAILABLE');
    Object.assign(this,{User,Estore});
  }
  async query(model,filter,projection,limit,signal) {
    abort(signal);
    const rows = await model.find(filter).select(projection).sort({_id:1})
      .limit(limit).maxTimeMS(5000).lean().exec();
    abort(signal);
    if (!Array.isArray(rows) || rows.length > limit) throw fault(503,'UNAVAILABLE');
    return rows;
  }
  async usersByEmail(email,storeId,{signal} = {}) {
    return this.query(this.User,{email,$or:[{estoreid:id(storeId)},{estoreids:id(storeId)}]},projections.user,2,signal);
  }
  async store(storeId,{signal} = {}) {
    return (await this.query(this.Estore,{_id:id(storeId)},projections.store,1,signal))[0] || null;
  }
  async packageOwner(packageId,{signal} = {}) {
    return (await this.query(this.Estore,{_id:id(packageId),'reseller.status':true,status:'active'},projections.store,1,signal))[0] || null;
  }
  async provePassword({email,password,storeId},signal) {
    const rows = await this.query(this.User,{email,$or:[{estoreid:id(storeId)},{estoreids:id(storeId)}]},
      {...projections.user,password:1},2,signal);
    const row = rows.length === 1 ? rows[0] : null;
    const digest = createHash('md5').update(password,'utf8').digest();
    // Legacy MD5 verification only; never accept a client digest as credential proof.
    const supported = row && typeof row.password === 'string' && /^[0-9a-f]{32}$/i.test(row.password);
    const stored = supported ? Buffer.from(row.password,'hex') : Buffer.alloc(16);
    const equal = timingSafeEqual(digest,stored);
    if (!row || !supported || !equal) throw fault(401,'INVALID_CREDENTIALS');
    return {userId:id(row._id),email:row.email};
  }
}
module.exports = {CredentialRepository};
