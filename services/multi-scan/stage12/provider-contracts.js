'use strict';
// Inert interfaces only: no environment lookup, provider discovery or database imports.
const {readSessionConfig} = require('../stage11/session-config');
const {check, id, abort} = require('../stage7/contracts');
const own = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => keys.includes(key));
function requireMethods(provider, methods) {
  check(provider && methods.every(method => typeof provider[method] === 'function'),
    'PROVIDER_UNAVAILABLE', 'Trusted scanner provider unavailable', 503);
  return provider;
}
function authorityConfig(value) {
  check(own(value, ['enabled', 'key', 'issuer', 'audience', 'ttl']) &&
    value.enabled === true && value.ttl === 900,
  'AUTH_UNCONFIGURED', 'Scanner authority unavailable', 503);
  // Reuse the dedicated Stage11 configuration contract without reading process.env.
  return readSessionConfig(true, {
    MULTI_SCAN_SESSION_ENABLED: 'true', MULTI_SCAN_SESSION_JWT_KEY: value.key,
    MULTI_SCAN_SESSION_ISSUER: value.issuer, MULTI_SCAN_SESSION_AUDIENCE: value.audience
  });
}
function membershipRepository(provider) {
  requireMethods(provider, ['usersByEmail', 'store', 'packageOwner']);
  const ports = {};
  for (const method of ['usersByEmail', 'store', 'packageOwner']) {
    const invoke = provider[method].bind(provider);
    ports[method] = async (...args) => {
      const signal = args[args.length - 1]?.signal;
      abort(signal);
      let value;
      try { value = await invoke(...args); }
      catch { check(false, 'PROVIDER_UNAVAILABLE', 'Trusted scanner provider unavailable', 503); }
      abort(signal);
      try {
        if (method === 'usersByEmail') {
          if (!Array.isArray(value) || value.length > 2) throw Error();
        } else if (value === null || value === undefined) return null;
        const rows = method === 'usersByEmail' ? value : [value];
        const copied = rows.map(row => {
          if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error();
          const copy = JSON.parse(JSON.stringify(row));
          copy._id = id(row._id);
          if (method === 'usersByEmail') {
            if (typeof copy.email !== 'string' || typeof copy.role !== 'string') throw Error();
            copy.resellid = id(row.resellid);
            if (row.estoreid !== undefined && row.estoreid !== null) copy.estoreid = id(row.estoreid);
            if (copy.wholesale !== undefined && typeof copy.wholesale !== 'boolean') throw Error();
            if (copy.deleteAccount !== undefined && copy.deleteAccount !== null &&
              (typeof copy.deleteAccount !== 'object' || Array.isArray(copy.deleteAccount) ||
                (copy.deleteAccount.request !== undefined && typeof copy.deleteAccount.request !== 'boolean'))) throw Error();
            if (row.estoreids !== undefined) {
              if (!Array.isArray(row.estoreids) || row.estoreids.length > 1000) throw Error();
              copy.estoreids = row.estoreids.map(id);
            }
          } else {
            if (typeof copy.status !== 'string') throw Error();
            if (method === 'store') copy.resellid = id(row.resellid);
          }
          return copy;
        });
        return method === 'usersByEmail' ? copied : copied[0];
      } catch { check(false, 'PROVIDER_INVALID', 'Invalid trusted scanner provider response', 503); }
    };
  }
  return Object.freeze(ports);
}
// Structural prerequisites only, not proof of catalog freshness or release approval.
function requireCatalogProvider(provider) {
  return requireMethods(provider, ['current', 'metadata']);
}
function requireReleaseProvider(provider) {
  return requireMethods(provider, ['resolve', 'assertActive']);
}
module.exports = {authorityConfig, membershipRepository, requireCatalogProvider, requireReleaseProvider, own};
