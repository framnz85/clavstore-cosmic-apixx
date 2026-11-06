'use strict';
const jwt = require('jsonwebtoken');
const {Security} = require('../stage7/security');
const {id,abort} = require('../stage7/contracts');
const {fault} = require('./session-config');
class SessionService {
  constructor({repository,config,clock = () => Math.floor(Date.now()/1000)}) {
    Object.assign(this,{repository,config,clock});
    this.security = new Security({repository,key:config.key,issuer:config.issuer,
      audience:config.audience,maxAgeSeconds:config.ttl,clock});
  }
  verify(token,input) {
    let c;
    try {
      c = this.security.verify(token);
      if (id(c.sub) !== c.sub || id(c.storeId) !== input.storeId ||
          typeof c.packageId !== 'string' || id(c.packageId) !== c.packageId ||
          c.email !== input.email || c.exp-c.iat > this.config.ttl) throw new Error();
    } catch { throw fault(401,'INVALID_TOKEN'); }
    return c;
  }
  async issue(input,bearer,signal) {
    const previous = bearer === undefined ? null : this.verify(bearer,input);
    const identity = await this.repository.provePassword(input,signal);
    const scope = await this.security.resolveTenant({email:identity.email,storeId:input.storeId,signal});
    if (scope.userId !== identity.userId || (previous &&
        (previous.sub !== scope.userId || previous.packageId !== scope.packageId))) throw fault(403,'DENIED');
    const now = this.clock();
    const token = jwt.sign({email:scope.email,storeId:scope.storeId,packageId:scope.packageId,iat:now},
      this.config.key,{algorithm:'HS256',subject:scope.userId,issuer:this.config.issuer,
        audience:this.config.audience,expiresIn:this.config.ttl});
    const grant = await this.security.authenticate({token,storeId:scope.storeId,packageHint:scope.packageId,signal});
    // Re-resolve trusted records after password proof. Never manufacture a Stage 7 grant.
    if (grant.userId !== identity.userId || grant.role !== scope.role || grant.wholesale !== scope.wholesale)
      throw fault(403,'DENIED');
    abort(signal);
    const claims = this.verify(token,input); // expiry checked again after asynchronous authorization
    return {token,tokenType:'Bearer',expiresAt:claims.exp,scope:{storeId:grant.storeId,
      packageId:grant.packageId,userId:grant.userId,role:grant.role}};
  }
}
module.exports = {SessionService};
