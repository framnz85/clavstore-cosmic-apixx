'use strict';
const crypto = require('node:crypto');
class ScanError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new ScanError(status, code, message); };
const objectId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
function bounded(value, fallback, min, max) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('Invalid multi-scan limit');
  return n;
}
function config(env = process.env) {
  return Object.freeze({
    enabled: env.MULTI_SCAN_ENABLED === 'true',
    maxBytes: bounded(env.MULTI_SCAN_MAX_BYTES, 10 * 1024 * 1024, 1024, 20 * 1024 * 1024),
    maxPixels: bounded(env.MULTI_SCAN_MAX_PIXELS, 24000000, 1, 40000000),
    maxDimension: bounded(env.MULTI_SCAN_MAX_DIMENSION, 10000, 1, 16000),
    uploadTimeoutMs: bounded(env.MULTI_SCAN_UPLOAD_TIMEOUT_MS, 15000, 10, 60000),
    operationTimeoutMs: bounded(env.MULTI_SCAN_OPERATION_TIMEOUT_MS, 30000, 10, 120000),
    maxActive: bounded(env.MULTI_SCAN_MAX_ACTIVE, 1, 1, 4),
    jwtKey: env.MULTI_SCAN_JWT_KEY || env.JWT_PRIVATE_KEY,
    serviceKey: env.MULTI_SCAN_SERVICE_KEY,
  });
}
const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const uploadError = err.code && err.code.startsWith('LIMIT_');
  const parseError = ['entity.parse.failed','entity.too.large'].includes(err.type);
  const status = uploadError ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : (parseError ? err.status : (err.status || 500));
  res.status(status).json({ ok: false, error: {
    code: parseError ? 'INVALID_JSON' : uploadError ? err.code : (err.code && err.status ? err.code : 'INTERNAL_ERROR'),
    message: parseError ? 'Invalid or oversized JSON body' : uploadError ? 'Invalid multipart upload or upload limit exceeded' : (err.status ? err.message : 'Multi-scan request failed'),
  } });
}
function gate(cfg) { return (req, res, next) => cfg.enabled ? next() : next(new ScanError(503, 'FEATURE_DISABLED', 'Multi-scan is disabled')); }
function capacity(cfg) {
  let active = 0;
  return (req, res, next) => {
    if (active >= cfg.maxActive) return next(new ScanError(429, 'BUSY', 'Multi-scan capacity reached'));
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release); res.once('close', release); next();
  };
}
async function operation(cfg, req, res, fn) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.once('close', abort);
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(controller.signal)),
      new Promise((resolve, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new ScanError(504, 'OPERATION_TIMEOUT', 'Multi-scan operation timed out'));
      }, cfg.operationTimeoutMs); }),
    ]);
  } finally { clearTimeout(timer); res.removeListener('close', abort); }
}
function selections(body) {
  if (!body || typeof body.scanId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.scanId)) fail(400, 'INVALID_SCAN', 'A scanId is required');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) fail(400, 'INVALID_ITEMS', 'Supply 1 to 100 items');
  const seen = new Set();
  return body.items.map(item => {
    if (!item || Object.keys(item).some(k => !['productId', 'quantity'].includes(k)) || !objectId(item.productId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) fail(400, 'INVALID_ITEM', 'Supply a productId and integer quantity from 1 to 100');
    const id = item.productId.toLowerCase();
    if (seen.has(id)) fail(400, 'DUPLICATE_ITEM', 'Aggregate identical SKUs before confirmation');
    seen.add(id); return { productId: id, quantity: item.quantity };
  });
}
function scanResponse(result) {
  if (!result || !result.image || !Number.isSafeInteger(result.image.width) || !Number.isSafeInteger(result.image.height) || result.image.width < 1 || result.image.height < 1 || !Array.isArray(result.detections) || result.detections.length > 100 || typeof result.indexVersion !== 'string' || !result.indexVersion.length || result.indexVersion.length > 128) fail(502, 'INVALID_INFERENCE_RESPONSE', 'Invalid inference response');
  const ids = new Set();
  const detections = result.detections.map(d => {
    if (!d || typeof d.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(d.id) || ids.has(d.id) || !Array.isArray(d.box) || d.box.length !== 4 || !d.box.every(Number.isFinite)) fail(502, 'INVALID_INFERENCE_RESPONSE', 'Invalid detection');
    ids.add(d.id);
    const [x,y,w,h] = d.box;
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x+w > result.image.width || y+h > result.image.height || !Array.isArray(d.candidates) || d.candidates.length > 20) fail(502, 'INVALID_INFERENCE_RESPONSE', 'Invalid detection bounds or candidates');
    const candidateIds = new Set();
    const candidates = d.candidates.map(c => {
      if (!c || !objectId(c.productId) || candidateIds.has(c.productId.toLowerCase()) || typeof c.score !== 'number' || !Number.isFinite(c.score)) fail(502, 'INVALID_INFERENCE_RESPONSE', 'Invalid candidate');
      candidateIds.add(c.productId.toLowerCase());
      return { productId: c.productId.toLowerCase(), score: c.score };
    });
    return { id: d.id, box: d.box, candidates, reviewRequired: true,
      reviewReasons: [candidates.length ? 'UNVALIDATED_MATCH' : 'UNKNOWN_PRODUCT'] };
  });
  return { image: { width: result.image.width, height: result.image.height }, detections,
    indexVersion: result.indexVersion, scoreType: 'ranking_score_not_probability' };
}
module.exports = { ScanError, fail, objectId, config, wrap, errorHandler, gate, capacity, operation, selections, scanResponse, newId: () => crypto.randomUUID() };
