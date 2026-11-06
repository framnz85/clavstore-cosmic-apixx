'use strict';
const messages = Object.freeze({
  DISABLED:'Scanner sessions are disabled', UNAVAILABLE:'Scanner authentication unavailable',
  INVALID_PAYLOAD:'Invalid session request', TOO_LARGE:'Session request exceeds limit',
  INVALID_TOKEN:'Invalid or expired scanner token', INVALID_CREDENTIALS:'Authentication failed',
  DENIED:'Store access denied', RATE_LIMITED:'Too many authentication attempts',
  BUSY:'Scanner authentication busy', TIMEOUT:'Scanner authentication timed out'
});
function fault(status, code) {
  return Object.assign(new Error(messages[code]), {sessionFault:true, status, code});
}
function readSessionConfig(mainEnabled, env = process.env) {
  if (mainEnabled !== true || env.MULTI_SCAN_SESSION_ENABLED !== 'true') return {enabled:false};
  const key = env.MULTI_SCAN_SESSION_JWT_KEY;
  // These NEW configured values are the Stage 11-A proposal, not a legacy-token contract.
  if (typeof key !== 'string' || Buffer.byteLength(key) < 32 ||
      env.MULTI_SCAN_SESSION_ISSUER !== 'cosmic-clavstore-scanner' ||
      env.MULTI_SCAN_SESSION_AUDIENCE !== 'clavstore-multiscan-review') throw fault(503,'UNAVAILABLE');
  for (const [name,value] of Object.entries(env)) {
    if (name !== 'MULTI_SCAN_SESSION_JWT_KEY' && /JWT|SECRET|HMAC|TOKEN|KEY/i.test(name) && value === key)
      throw fault(503,'UNAVAILABLE');
  }
  return Object.freeze({enabled:true,key,issuer:env.MULTI_SCAN_SESSION_ISSUER,
    audience:env.MULTI_SCAN_SESSION_AUDIENCE,ttl:900});
}
module.exports = {messages,fault,readSessionConfig};
