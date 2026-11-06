'use strict';
const express = require('express');
const {fault,readSessionConfig} = require('./session-config');
const {CredentialRepository} = require('./credential-repository');
const {SessionService} = require('./session-service');
const {validate,begin,error} = require('./session-handler');
function createSessionEndpoint({mainEnabled,getSources} = {}) {
  // Composition is explicit. Missing production provider remains unavailable; never import DB models here.
  const attempts = new Map();
  let occupied = false;
  function gate(req,res,next) {
    try {
      const cfg = readSessionConfig(mainEnabled);
      if (!cfg.enabled) throw fault(503,'DISABLED');
      req.scannerSessionConfig = cfg;next();
    } catch (e) {next(e);}
  }
  function admit(req,res,next) {
    try {
      const now = Date.now(), peer = req.socket.remoteAddress || 'unknown';
      for (const [key,value] of attempts) if (value.until <= now) attempts.delete(key);
      if (!attempts.has(peer) && attempts.size >= 128) throw fault(429,'RATE_LIMITED');
      const entry = attempts.get(peer) || {count:0,until:now+60000};
      if (++entry.count > 5) {attempts.set(peer,entry);throw fault(429,'RATE_LIMITED');}
      attempts.set(peer,entry);next();
    } catch (e) {next(e);}
  }
  async function issue(req,res,next) {
    let acquired = false, timer, onClose;
    const controller = new AbortController();
    try {
      const {input,bearer} = validate(req);
      if (occupied) throw fault(429,'BUSY');
      if (typeof getSources !== 'function') throw fault(503,'UNAVAILABLE');
      occupied=true;acquired=true;
      onClose=()=>controller.abort();res.once('close',onClose);
      const work = Promise.resolve().then(async () => {
        const sources = await getSources();
        if (controller.signal.aborted) throw fault(504,'TIMEOUT');
        const repository = new CredentialRepository(sources);
        const service = new SessionService({repository,config:req.scannerSessionConfig});
        return service.issue(input,bearer,controller.signal);
      });
      // Preserve admission until underlying work settles, including on deadline/disconnect.
      void work.finally(()=>{occupied=false;}).catch(()=>{});
      const timeout = new Promise((resolve,reject) => {
        timer=setTimeout(()=>{controller.abort();reject(fault(504,'TIMEOUT'));},10000);
      });
      const result = await Promise.race([work,timeout]);
      if (!controller.signal.aborted && !res.destroyed)
        res.status(200).json({...result,requestId:req.scannerSessionRequestId});
    } catch (e) {
      if (!res.destroyed) next(e);
    } finally {
      clearTimeout(timer);
      if (onClose) res.removeListener('close',onClose);
      // acquired work owns occupied until settlement; do not release it on HTTP timeout.
      if (!acquired) controller.abort();
    }
  }
  return [begin,gate,admit,express.json({limit:'8kb',strict:true}),issue,error];
}
module.exports = {createSessionEndpoint};
