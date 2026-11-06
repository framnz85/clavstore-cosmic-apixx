# Real grocery dataset specification

No real grocery photographs or ground-truth labels are supplied by Stage 9. Existing Stage 6 images explicitly identify themselves as generated flat labels. Unlabeled legacy images do not establish usage rights, exact SKU identity, quantities or detection boxes. No image download was performed. `dataset-availability.json` records zero qualifying samples; real grocery accuracy is unavailable.

`dataset.schema.json` describes the manifest. The executable `services/multi-scan/stage9/dataset.js` adds cross-record checks that JSON Schema alone cannot express. Use one authorized store/reseller namespace per manifest. Product IDs must be real scoped catalog IDs assigned by a human; unknown objects have `productId:null`, never an invented product ID.

A dataset contains:

- `schemaVersion:1`, `kind:'real-grocery-photographs'`, a bounded `datasetId`, and `tenant:{storeId,packageId}`.
- `products:[{productId,title,variantFamily,size}]`: exact SKU catalog labels, including separate records for every flavor/packaging size. `variantFamily` groups related variants only for confusion analysis; it never groups cart quantities. Record actual printed size/units without guessing.
- `references`: photographs with `id`, relative `path`, `sha256`, EXIF-oriented `width`/`height`, `captureSession`, `rights:{basis,evidence}`, and an exact `productId`. Rights basis is owned, permission, licensed or public-domain. Evidence must identify the actual permission/license record. A declaration is not independent legal verification.
- `scenes`: checkout photographs with the same image metadata, `annotation:{source:'human',reviewed:true,protocol}`, `conditions`, `objects`, and `quantities`. Conditions support normal, occlusion, rotation, poor-lighting, similar-variant and different-size. Each object has a unique `objectId`, exact `productId` or null, oriented XYWH `box`, and `visibleFraction` in (0,1]. Quantities must equal the individually annotated known objects. Unknowns are counted separately.

Use distinct capture sessions for references versus checkout evaluation. Exact image hashes cannot overlap. Split checkout scenes by session before tuning; reserve a held-out session set with all SKU/variant/unknown/condition strata represented. Human reviewers should reconcile disagreements using packaging and actual catalog IDs, audit duplicate/partially visible objects, and record the treatment of objects too occluded to label. The present format requires every labeled object to be counted; it does not silently ignore difficult objects. Product identity and image-rights audits remain human responsibilities. Near-duplicate images and same-session leakage beyond declared sessions require a manual/perceptual audit; the tool only checks exact hashes and session IDs.

The byte verifier rejects traversal, symlink paths, files outside the root, files above 10 MiB, checksum differences and oriented-dimension differences; it decodes using the existing isolated Sharp dependency with a 24-megapixel cap. Annotation boxes must fit the oriented dimensions. Do not point this tool at a production image delivery service.

## Prediction input and evaluation

A prediction document contains matching `datasetId`, matching `tenant`, and exactly one entry per scene in `scenes`. Each entry is `{sceneId,latencyMs,selections,detections}`. Failed scans must still be represented with empty detections/selections and their measured latency. `selections` maps exact SKU IDs to **explicitly reviewed** integer quantities; it is not an auto-accepted recognition guess. Each detection contains `detectionId`, oriented XYWH `box`, numeric `score` in [0,1], ordered `candidates:[productId,...]`, `decision:'unknown'|'review'|'accepted'`, and `productId` only when explicitly accepted. Acceptance here is an evaluation annotation, not a live cart mutation. Do not convert uncalibrated model similarities into confidence percentages.

Run from the main API project:

```text
node scripts/multi-scan/stage9/evaluate.js DATASET.json PREDICTIONS.json NEW-RESULT.json PHOTO_ROOT
```

Output is created exclusively; existing result files are refused. Omitting PHOTO_ROOT produces a clearly marked label-only calculation, not a photograph-validated result. JSON inputs are capped at 16 MiB. The evaluation tool performs no network access or model inference. Native orchestration is exercised separately; importing a new real dataset into authorized catalog/index fixtures remains a deliberate next step once labels and reference rights are available.

Matching uses score-ordered greedy one-to-one IoU at 0.5, with deterministic input-index tie breaking. This is a single-threshold operational metric, not COCO mAP. Report sample sizes with every result and stratify by recorded conditions and variant family. The tool returns per-scene results to support that analysis.

Metrics:

- Detection precision = matched predictions / predictions; recall = matched objects / ground-truth objects, including unknown objects.
- Object counting accuracy = fraction of scenes with exact total object count; MAE reports absolute count error.
- Reviewed SKU counting accuracy = fraction of scenes with exact per-SKU reviewed counts; SKU MAE sums absolute per-SKU differences per scene.
- Exact SKU Top-1 and Top-5 retrieval use **all known ground-truth objects**, including missed detections as failures. Matched-known Top-1 is also reported separately.
- Unknown rejection = matched unknown objects explicitly rejected / all ground-truth unknown objects. A missed unknown does not count as a successful rejection.
- Variant confusion = wrong Top-1 within the true SKU's declared variant family / matched known objects.
- False acceptance = wrong, unknown or unmatched explicitly accepted detections / all explicitly accepted detections. No acceptances yields null rather than zero.
- Review-required rate = detections explicitly pending review / all detections. Latency reports n, p50, p95 and maximum for all scene predictions.

Empty denominators yield null. Unit tests use explicitly synthetic schema objects and metric arithmetic, not invented grocery photographs/labels. No commercial accuracy, confidence calibration, statistical certainty or deployment suitability follows from those tests.
