'use strict';
// Restricted development POS API. This deliberately does not import server.js or dotenv.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const configPath = path.join(__dirname, 'isolated-pos-backend.env');
const identityPath = path.join(require('node:os').homedir(), 'clavstore-scanner-private', 'pos-identity.json');
const storeId = '6aea21f9b2f055c904c7ba16';
const productIds = new Set(['6aea21f9b2f055c904c7ba17', '6aea21f9b2f055c904c7ba18', '6aea21f9b2f055c904c7ba19']);
const reviewDescriptorPath = '/mnt/g/clavstore/scanner-evidence/development/stage13-barcode-recognition-ef83ef19-20261105a/RECOGNITION-DESCRIPTOR.json';

function readConfig() {
  const values = {};
  for (const line of fs.readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const split = line.indexOf('=');
    if (split < 1 || !/^[A-Z_]+$/.test(line.slice(0, split))) throw Error('INVALID_LOCAL_CONFIG');
    const key = line.slice(0, split);
    if (Object.hasOwn(values, key)) throw Error('DUPLICATE_LOCAL_CONFIG');
    values[key] = line.slice(split + 1);
  }
  const exact = {
    NODE_ENV: 'development', PORT: '8004', API_ROUTES: 'cosmic-api',
    GRATIS_DATABASE: 'mongodb://127.0.0.1:27017/cosmic_scanner_local_test?directConnection=true',
    ADDRESS_DATABASE: 'mongodb://127.0.0.1:27017/cosmic_scanner_address_local_test?directConnection=true',
    SUPER_DATABASE: 'mongodb://127.0.0.1:27017/cosmic_scanner_super_local_test?directConnection=true',
    REDIS_URL: 'redis://127.0.0.1:6381', SCANNER_DEVELOPMENT_STORE_ID: storeId,
    MULTI_SCAN_ENABLED: 'false',
  };
  if (Object.keys(values).length !== Object.keys(exact).length ||
      Object.entries(exact).some(([key, value]) => values[key] !== value)) throw Error('NONLOCAL_OR_INCOMPLETE_CONFIG');
  return values;
}

function readIdentity() {
  const parent = fs.lstatSync(path.dirname(identityPath));
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid() ||
      (parent.mode & 0o077) !== 0) throw Error('UNSAFE_DEV_IDENTITY_DIRECTORY');
  const stat = fs.lstatSync(identityPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() ||
      (stat.mode & 0o077) !== 0 || stat.size > 4096) throw Error('UNSAFE_DEV_IDENTITY');
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  if (identity.storeId !== storeId || identity.role !== 'cashier' ||
      typeof identity.email !== 'string' || !identity.email.endsWith('@development.invalid') ||
      typeof identity.jwtKey !== 'string' || identity.jwtKey.length < 64) throw Error('INVALID_DEV_IDENTITY');
  return identity;
}

function isolateEnvironment(config, identity) {
  for (const key of Object.keys(process.env)) if (!['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ'].includes(key)) delete process.env[key];
  Object.assign(process.env, config, { JWT_PRIVATE_KEY: identity.jwtKey });
}

async function start() {
  const config = readConfig(), identity = readIdentity();
  isolateEnvironment(config, identity);
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const md5 = require('md5');
  const mongoose = require('mongoose');
  const main = require(path.join(root, 'dbconnect/gratis'));
  const address = require(path.join(root, 'dbconnect/address'));
  const auxiliary = require(path.join(root, 'dbconnect/super'));
  const Store = require(path.join(root, 'models/estore'));
  const Product = require(path.join(root, 'models/product'));
  const User = require(path.join(root, 'models/user'));
  const Country = require(path.join(root, 'models/country'));
  const { redisClient, connectRedis } = require(path.join(root, 'config/redis'));
  let server;
  try {
    await Promise.all([main.asPromise(), address.asPromise(), auxiliary.asPromise()]);
    if (!main.client?.s?.url?.startsWith('mongodb://127.0.0.1:27017/') ||
        redisClient.options.url !== config.REDIS_URL) throw Error('CONNECTION_IDENTITY_MISMATCH');
    await connectRedis();
    const country = await Country.findById('6aea21f9b2f055c904c7ba20').lean();
    const store = await Store.findById(storeId).lean();
    const user = await User.findOne({email: identity.email, estoreid: new mongoose.Types.ObjectId(storeId), role: 'cashier'}).lean();
    if (!country || !store || !user || String(store.country) !== String(country._id) ||
        String(store.resellid) !== storeId || store.status !== 'active') throw Error('ISOLATED_IDENTITY_NOT_READY');
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({limit: '4kb'}));
    app.use((req, res, next) => {
      if (!['127.0.0.1:8004', 'localhost:8004'].includes(req.headers.host) ||
          (req.headers.origin && !['http://127.0.0.1:3004', 'http://localhost:3004'].includes(req.headers.origin))) return res.status(403).json({error: 'LOCAL_ONLY'});
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type, authtoken, estoreid, branchid, resellid, resellslug, defaultslug');
      }
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'OPTIONS') return res.status(204).end();
      next();
    });
    async function authorized(req, res, next) {
      try {
        if (req.headers.estoreid !== storeId) throw Error('STORE_SCOPE');
        const claims = jwt.verify(req.headers.authtoken, identity.jwtKey);
        if (claims.email !== identity.email) throw Error('IDENTITY_SCOPE');
        const current = await User.findOne({email: identity.email, estoreid: new mongoose.Types.ObjectId(storeId), role: 'cashier'}).lean();
        if (!current) throw Error('IDENTITY_REVOKED');
        req.developmentCashier = {userId: String(current._id), storeId, role: 'cashier'};
        next();
      } catch { res.status(401).json({error: 'DEVELOPMENT_AUTH_REQUIRED'}); }
    }
    app.get('/cosmic-api/__scanner-pos/health', (_req, res) => res.json({storeId, isolation: 'development-only'}));
    for (const route of ['get-categories', 'get-brands']) {
      app.get('/cosmic-api/gratis/' + route, (req, res) => {
        if (req.headers.estoreid !== storeId) return res.status(403).json({error: 'STORE_SCOPE'});
        res.json([]);
      });
    }
    app.get('/cosmic-api/gratis/default-estore', async (req, res) => {
      if (req.headers.branchid !== storeId || req.headers.resellid !== storeId || req.headers.defaultslug !== 'branch') return res.status(403).json({error: 'STORE_SCOPE'});
      const data = await Store.findById(storeId).populate('country').lean();
      if (!data || String(data._id) !== storeId || !data.country) return res.status(503).json({error: 'STORE_UNAVAILABLE'});
      res.json(data);
    });
    app.post('/cosmic-api/gratis/auth-login', async (req, res) => {
      if (req.body?.email !== identity.email || typeof req.body?.password !== 'string') return res.status(401).json({error: 'INVALID_DEV_LOGIN'});
      const user = await User.findOne({email: identity.email, password: md5(req.body.password), estoreid: new mongoose.Types.ObjectId(storeId), role: 'cashier'}).lean();
      if (!user) return res.status(401).json({error: 'INVALID_DEV_LOGIN'});
      res.json(jwt.sign({email: user.email}, identity.jwtKey, {expiresIn: '2h'}));
    });
    app.get('/cosmic-api/gratis/user-details/:resellid', authorized, async (req, res) => {
      if (req.params.resellid !== storeId || req.headers.resellslug !== 'branch') return res.status(403).json({error: 'STORE_SCOPE'});
      const user = await User.findOne({email: identity.email, estoreid: new mongoose.Types.ObjectId(storeId), role: 'cashier'}).populate('estoreid').lean();
      if (!user || String(user.estoreid?._id) !== storeId) return res.status(404).json({error: 'DEV_CASHIER_NOT_FOUND'});
      delete user.password;
      res.json(user);
    });
    app.get('/cosmic-api/gratis/get-product-by-id/:prodid', authorized, async (req, res) => {
      if (!productIds.has(req.params.prodid)) return res.status(404).json({error: 'PRODUCT_NOT_FOUND'});
      const product = await Product.findOne({_id: new mongoose.Types.ObjectId(req.params.prodid), estoreid: new mongoose.Types.ObjectId(storeId), activate: true}).lean();
      if (!product) return res.status(404).json({error: 'PRODUCT_NOT_FOUND'});
      res.json([product]);
    });
    app.get('/cosmic-api/gratis/products/random/:count', async (req, res) => {
      if (req.headers.estoreid !== storeId || !/^[1-9]\d?$/.test(req.params.count) ||
          !/^[1-9]\d*$/.test(req.headers.nextpage || '')) return res.status(403).json({error: 'STORE_SCOPE'});
      const products = await Product.find({_id: {$in: [...productIds].map(id => new mongoose.Types.ObjectId(id))},
        estoreid: new mongoose.Types.ObjectId(storeId), activate: true}).lean();
      res.json({products: products.slice(0, Number(req.params.count)), count: products.length});
    });
    const frontendRoot = '/mnt/g/clavstore/clavstore-ui/clavstore-reseller-original';
    const {loadRecognitionDescriptor} = require(path.join(frontendRoot, 'scripts/multi-scan/stage13/session-bound-recognition/installation'));
    const {createCashierReviewSessions} = require(path.join(frontendRoot, 'scripts/multi-scan/stage13/cashier-review-sessions'));
    const {createSessionPersistence} = require(path.join(frontendRoot, 'scripts/multi-scan/stage13/photo-session-persistence'));
    const {loadLocalCatalog} = require(path.join(root, 'services/multi-scan/stage13/local-catalog'));
    const {createDevelopmentQuote} = require(path.join(root, 'services/multi-scan/stage13/development-quote'));
    const privateRoot = path.join(require('node:os').homedir(), 'clavstore-scanner-private');
    const reviews = createCashierReviewSessions({sourcePersistence:createSessionPersistence(path.join(privateRoot,'sessions')),descriptor:loadRecognitionDescriptor(reviewDescriptorPath),loadCatalog:loadLocalCatalog,root:path.join(privateRoot,'reviews')});
    const quote = createDevelopmentQuote({reviews,readProducts: ids => Product.find({_id:{$in:ids.map(id=>new mongoose.Types.ObjectId(id))},estoreid:new mongoose.Types.ObjectId(storeId)}).lean()});
    app.get('/cosmic-api/__scanner-pos/stage13-quote/:reviewId', authorized, async (req, res) => {
      try { res.json(await quote(req.params.reviewId,req.developmentCashier)); }
      catch (error) { res.status(['REVIEW_INVALID_OR_EXPIRED','REVIEW_EXPIRED'].includes(error.message)?410:409).json({error:error.code||error.message}); }
    });
    app.use((_req, res) => res.status(404).json({error: 'NOT_AVAILABLE_IN_ISOLATED_POS'}));
    server = await new Promise((resolve, reject) => {const listener = app.listen(8004, '127.0.0.1', () => resolve(listener));listener.once('error', reject);});
    process.stdout.write('Isolated scanner POS backend listening on 127.0.0.1:8004\n');
  } catch (error) {
    if (server) await new Promise(resolve => server.close(resolve));
    if (redisClient.isOpen) await redisClient.quit();
    await Promise.allSettled([main.close(), address.close(), auxiliary.close()]);
    throw error;
  }
}

if (require.main === module) start().catch(error => {console.error('ISOLATED_POS_START_FAILED', error.message);process.exitCode = 1;});
module.exports = {readConfig, readIdentity, isolateEnvironment, start};
