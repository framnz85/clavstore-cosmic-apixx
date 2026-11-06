'use strict';
const { fail, selections, scanResponse, newId, operation } = require('../services/multi-scan/contracts');
module.exports = (cfg, adapters) => {
  const call = async (name, req, res, extra = {}) => {
    if (typeof adapters[name] !== 'function') fail(503, 'INTEGRATION_UNAVAILABLE', 'Multi-scan integration is not configured');
    return operation(cfg, req, res, signal => adapters[name]({ tenant:req.multiScanTenant, signal, ...extra }));
  };
  return {
    status: async (req,res) => res.json({ ok:true, enabled:true, ready:false, stage:'skeleton', reasons:['INFERENCE_NOT_INTEGRATED'] }),
    scan: async (req,res) => {
      const result = scanResponse(await call('scan',req,res,{ photo:req.multiScanPhoto }));
      // Never expose candidates until a trusted adapter has checked every ID against this store.
      const ids = [...new Set(result.detections.flatMap(d=>d.candidates.map(c=>c.productId)))];
      const validIds = await call('authorizeProducts',req,res,{ productIds:ids });
      if (!Array.isArray(validIds) || validIds.some(id=>!ids.includes(id))) fail(502,'INVALID_CATALOG_RESPONSE','Invalid catalog response');
      const allowed = new Set(validIds);
      result.detections = result.detections.map(d=>({ ...d, candidates:d.candidates.filter(c=>allowed.has(c.productId)), reviewReasons:[d.candidates.some(c=>allowed.has(c.productId))?'UNVALIDATED_MATCH':'UNKNOWN_PRODUCT'] }));
      const scanId = newId();
      await call('recordScan',req,res,{scanId,result});
      res.json({ ok:true, scanId, ...result });
    },
    confirm: async (req,res) => {
      const items = selections(req.body);
      // Adapter must bind scanId to tenant/user, enforce expiry, load fresh records and stock.
      const result = await call('confirm',req,res,{ scanId:req.body.scanId, items });
      if (!result || !Array.isArray(result.items) || result.items.length !== items.length || typeof result.catalogRevision !== 'string') fail(502,'INVALID_CONFIRMATION_RESPONSE','Invalid catalog confirmation');
      const confirmed = items.map(item => {
        const rows = result.items.filter(row=>row.productId===item.productId);
        const row = rows[0];
        if (rows.length !== 1 || row.quantity !== item.quantity || row.storeId !== req.multiScanTenant.storeId || row.activate !== true || !Number.isFinite(row.price) || row.price < 0 || typeof row.title !== 'string' || typeof row.requiresVariantSelection !== 'boolean') fail(502,'INVALID_CONFIRMATION_RESPONSE','Invalid catalog confirmation');
        return { productId:item.productId, quantity:item.quantity, title:row.title, price:row.price, requiresVariantSelection:row.requiresVariantSelection === true };
      });
      res.json({ ok:true, scanId:req.body.scanId, confirmed:true, cartMutation:false, catalogRevision:result.catalogRevision, items:confirmed });
    },
    rebuild: async (req,res) => {
      const result = await call('requestRebuild',req,res);
      if (!result || typeof result.jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(result.jobId)) fail(502,'INVALID_JOB_RESPONSE','Invalid rebuild response');
      res.status(202).json({ok:true,state:'accepted',jobId:result.jobId});
    },
    indexStatus: async (req,res) => {
      const result = await call('indexStatus',req,res);
      if (!result || !['not_built','queued','building','ready','failed'].includes(result.state)) fail(502,'INVALID_JOB_RESPONSE','Invalid index status');
      res.json({ok:true,state:result.state,ready:result.state==='ready'});
    },
  };
};
