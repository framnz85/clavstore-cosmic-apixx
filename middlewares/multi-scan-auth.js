'use strict';
const jwt = require('jsonwebtoken');
const { fail, objectId, operation } = require('../services/multi-scan/contracts');
module.exports = (cfg, adapters) => async (req, res, next) => {
  if (!cfg.jwtKey) fail(503, 'AUTH_UNCONFIGURED', 'Multi-scan token verification is not configured');
  let claims;
  try { claims = jwt.verify(req.headers.authtoken, cfg.jwtKey, { algorithms: ['HS256'] }); }
  catch { fail(401, 'INVALID_TOKEN', 'Invalid or expired token'); }
  if (!claims || typeof claims.email !== 'string' || !claims.email.length) fail(401, 'INVALID_TOKEN', 'Token identity missing');
  const storeId = req.headers.estoreid;
  if (!objectId(storeId)) fail(400, 'INVALID_STORE', 'Valid estoreid required');
  if (typeof adapters.resolveTenant !== 'function') fail(503, 'TENANT_ADAPTER_UNAVAILABLE', 'Authorized catalog integration is not configured');
  // Must resolve membership and package from trusted records; role claims/headers are ignored.
  const tenant = await operation(cfg, req, res, signal => adapters.resolveTenant({ email: claims.email, storeId: storeId.toLowerCase(), signal }));
  if (!tenant || tenant.storeId !== storeId.toLowerCase() || !objectId(tenant.packageId) || !objectId(tenant.userId) || !['admin','moderator','cashier'].includes(tenant.role)) fail(403, 'STORE_FORBIDDEN', 'Store access denied');
  if (req.headers.resellid && req.headers.resellid !== tenant.packageId) fail(403, 'PACKAGE_FORBIDDEN', 'Package access denied');
  req.multiScanTenant = Object.freeze({ storeId: tenant.storeId, packageId: tenant.packageId, userId: tenant.userId, role: tenant.role });
  next();
};
