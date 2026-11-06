'use strict';
const {Security} = require('../stage7/security');
const {check, abort} = require('../stage7/contracts');
const {authorityConfig, membershipRepository, own} = require('./provider-contracts');
const canonicalId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
function createScannerAuthority({sessionConfig, repository, clock = () => Math.floor(Date.now() / 1000)} = {}) {
  const config = authorityConfig(sessionConfig);
  const ports = membershipRepository(repository);
  check(typeof clock === 'function', 'AUTH_UNCONFIGURED', 'Scanner authority unavailable', 503);
  const now = () => {
    const value = clock();
    check(Number.isSafeInteger(value) && value >= 0, 'AUTH_UNCONFIGURED', 'Scanner clock unavailable', 503);
    return value;
  };
  // The exposed instance itself enforces purpose/scope, including when used by Catalog.
  // Private grant membership remains owned by the existing Security implementation.
  class ScannerSecurity extends Security {
    verify(token) {
      now(); // Keep configuration errors outside the legacy verifier's JWT catch.
      const claims = super.verify(token);
      check(canonicalId(claims.sub) && canonicalId(claims.storeId) && canonicalId(claims.packageId) &&
        claims.iss === config.issuer && claims.aud === config.audience,
      'INVALID_TOKEN', 'Invalid or expired scanner token', 401);
      return claims;
    }
    async authenticate(input) {
      check(own(input, ['token', 'storeId', 'packageHint', 'signal']) &&
        canonicalId(input.storeId) && (input.packageHint === undefined || canonicalId(input.packageHint)),
      'INVALID_REQUEST', 'Invalid scanner authorization request', 400);
      abort(input.signal);
      const claims = this.verify(input.token);
      check(claims.storeId === input.storeId &&
        (input.packageHint === undefined || claims.packageId === input.packageHint),
      'STORE_FORBIDDEN', 'Scanner scope denied', 403);
      const grant = await super.authenticate({...input, packageHint:claims.packageId});
      check(grant.storeId === claims.storeId && grant.packageId === claims.packageId && grant.userId === claims.sub,
        'STORE_FORBIDDEN', 'Scanner scope denied', 403);
      abort(input.signal);
      return grant;
    }
    async revalidate(grant, options = {}) {
      const scope = await super.revalidate(grant, options);
      // Stage7 checks expiry before its awaits; this adapter also checks afterward.
      check(grant.expiresAt > now(), 'INVALID_SESSION', 'Invalid or expired scanner session', 401);
      abort(options.signal);
      return scope;
    }
  }
  const security = new ScannerSecurity({repository:ports, key:config.key, issuer:config.issuer,
    audience:config.audience, maxAgeSeconds:config.ttl, clock:now});
  return Object.freeze({security,
    authenticate(input) {
      check(own(input, ['token', 'requestedStoreId', 'requestedPackageId', 'signal']),
        'INVALID_REQUEST', 'Invalid scanner authorization request', 400);
      return security.authenticate({token:input.token, storeId:input.requestedStoreId,
        packageHint:input.requestedPackageId, signal:input.signal});
    },
    revalidate:(grant, options) => security.revalidate(grant, options)
  });
}
module.exports = {createScannerAuthority};
