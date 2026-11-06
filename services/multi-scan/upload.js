'use strict';
const { ScanError } = require('./contracts');
const { createHash } = require('node:crypto');
// Dependencies are loaded on a request, never while auto-discovering routes.
function createUpload(cfg, loadRuntime) {
  let runtime;
  return (req, res, next) => {
    try { runtime ||= loadRuntime(); }
    catch { return next(new ScanError(503, 'UPLOAD_RUNTIME_UNAVAILABLE', 'Isolated upload runtime is not installed')); }
    if (!req.is('multipart/form-data')) return next(new ScanError(415, 'MULTIPART_REQUIRED', 'Use multipart/form-data with photo'));
    const parser = runtime.multer({ storage: runtime.multer.memoryStorage(), limits: {
      fileSize: cfg.maxBytes, files: 1, fields: 0, parts: 2, headerPairs: 30,
    } }).single('photo');
    let settled = false;
    const finish = err => {
      if (settled) return;
      settled = true; clearTimeout(timer); req.removeListener('aborted', abort); res.removeListener('close', close);
      next(err);
    };
    const close = () => { settled = true; clearTimeout(timer); req.removeListener('aborted', abort); if (!req.complete) req.destroy(); };
    const abort = () => finish(new ScanError(400, 'UPLOAD_ABORTED', 'Upload interrupted'));
    const timer = setTimeout(() => {
      finish(new ScanError(408, 'UPLOAD_TIMEOUT', 'Upload timed out'));
      req.destroy();
    }, cfg.uploadTimeoutMs);
    req.once('aborted', abort); res.once('close', close);
    parser(req, res, err => {
      if (settled) return;
      if (err) return finish(err);
      if (req.multiScanPhotoHash && (!req.file || createHash('sha256').update(req.file.buffer).digest('hex') !== req.multiScanPhotoHash)) return finish(new ScanError(401, 'PHOTO_DIGEST_MISMATCH', 'Capability image mismatch'));
      validateImage(req.file, cfg, runtime.sharp).then(photo => {
        if (settled) return;
        req.multiScanPhoto = photo; delete req.file; finish();
      }, finish);
    });
  };
}
async function validateImage(file, cfg, sharp) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw new ScanError(400, 'PHOTO_REQUIRED', 'Upload one photo');
  if (file.buffer.length > cfg.maxBytes) throw new ScanError(413, 'IMAGE_TOO_LARGE', 'Image exceeds byte limit');
  try {
    const options = { limitInputPixels: cfg.maxPixels, failOn: 'warning', sequentialRead: true };
    const meta = await sharp(file.buffer, options).metadata();
    const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[meta.format];
    if (!mime || mime !== file.mimetype || (meta.pages || 1) !== 1) throw new Error('format');
    if (!meta.width || !meta.height || meta.width > cfg.maxDimension || meta.height > cfg.maxDimension || meta.width * meta.height > cfg.maxPixels) throw new Error('dimensions');
    // Force a complete decode and EXIF orientation correction; never write images to disk.
    const { data, info } = await sharp(file.buffer, options).rotate().toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, channels: info.channels, format: 'raw-rgb' };
  } catch { throw new ScanError(415, 'INVALID_IMAGE', 'Invalid, animated, oversized or unsupported image'); }
}
module.exports = { createUpload, validateImage };
