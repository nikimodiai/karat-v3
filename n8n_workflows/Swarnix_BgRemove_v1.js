// Swarnix · Background Removal — n8n Workflow SDK source
//
// Flow: Webhook (POST /swarnix-bg-remove, multipart) → Prepare Binary
//   → rembg Remove (self-hosted rembg HTTP service) → Upload to Cloudinary
//   (unsigned preset, folder swarnix-cutouts, keeps PNG alpha)
//   → Respond { secure_url, public_id }. Errors → Handle Error → Return Error (500).
//
// Cost: ₹0 — rembg runs on the Hostinger VPS (CPU). See REMBG_SETUP.md for the
// one-time Docker deployment. Cloudinary delivery transforms (white/blue/brand
// backgrounds, set compositing) are applied client-side and also cost nothing.
//
// Manual setup after import:
//   1. Deploy rembg per REMBG_SETUP.md so it is reachable from n8n
//      (default expected URL http://rembg:7000 — override with env REMBG_URL).
//   2. Activate the workflow.

import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const webhookTrigger = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'swarnix-bg-remove',
      responseMode: 'responseNode',
      options: { allowedOrigins: '*' }
    }
  },
  output: [{ body: { image_url: 'https://res.cloudinary.com/.../necklace.jpg' } }]
});

const prepareBinary = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Binary',
    parameters: { mode: 'runOnceForAllItems', jsCode: "const item = $input.first();\nconst body = item.json.body || item.json;\nconst binary = item.binary || {};\nlet key = null;\nfor (const k of ['image', 'file', 'data']) { if (binary[k]) { key = k; break; } }\nif (!key && Object.keys(binary).length) key = Object.keys(binary)[0];\nlet sourceBinary;\nif (key) {\n  sourceBinary = binary[key];\n} else if (body.image_url) {\n  const resp = await this.helpers.httpRequest({ method: 'GET', url: String(body.image_url), encoding: 'arraybuffer', returnFullResponse: true });\n  const buf = Buffer.from(resp.body);\n  const ct = (resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type'])) || 'image/png';\n  sourceBinary = await this.helpers.prepareBinaryData(buf, 'source.png', String(ct).split(';')[0]);\n} else {\n  throw new Error('No image file or image_url provided');\n}\nreturn [{ json: { ok: true }, binary: { source: sourceBinary } }];" }
  },
  output: [{ ok: true }]
});

const rembgRemove = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'rembg Remove',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: expr("{{ ($env.REMBG_URL || 'http://rembg:7000') + '/api/remove?model=isnet-general-use' }}"),
      sendBody: true,
      contentType: 'multipart-form-data',
      bodyParameters: {
        parameters: [
          { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'source' }
        ]
      },
      options: {
        timeout: 120000,
        response: { response: { responseFormat: 'file', outputPropertyName: 'cutout' } }
      }
    }
  },
  output: [{ cutout: 'BINARY_PNG' }]
});

const uploadCloudinary = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Upload to Cloudinary',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.cloudinary.com/v1_1/jewelleryinventory/image/upload',
      sendBody: true,
      contentType: 'multipart-form-data',
      bodyParameters: {
        parameters: [
          { name: 'upload_preset', value: 'jewelleryupload' },
          { name: 'folder', value: 'swarnix-cutouts' },
          { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'cutout' }
        ]
      },
      options: {}
    }
  },
  output: [{ secure_url: 'https://res.cloudinary.com/jewelleryinventory/image/upload/v1/swarnix-cutouts/cut.png', public_id: 'swarnix-cutouts/cut' }]
});

const prepareResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Response',
    parameters: { mode: 'runOnceForAllItems', jsCode: "const cloud = $input.first().json;\nconst secure_url = cloud.secure_url || cloud.url || '';\nconst public_id = cloud.public_id || '';\nif (!secure_url || !public_id) throw new Error('Cloudinary upload returned no URL/public_id: ' + JSON.stringify(cloud).slice(0, 200));\nreturn [{ json: { secure_url, public_id } }];" }
  },
  output: [{ secure_url: 'https://res.cloudinary.com/...', public_id: 'swarnix-cutouts/cut' }]
});

const respondSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.1,
  config: {
    name: 'Respond Success',
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ JSON.stringify({ secure_url: $('Prepare Response').item.json.secure_url, public_id: $('Prepare Response').item.json.public_id }) }}"),
      options: { responseHeaders: { entries: [ { name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' } ] } }
    }
  },
  output: [{}]
});

const handleError = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Handle Error',
    parameters: { mode: 'runOnceForAllItems', jsCode: "const err = $input.first();\nconst msg = (err && err.json && (err.json.message || (err.json.error && err.json.error.message))) || 'Background removal failed. Please try again.';\nreturn [{ json: { message: String(msg).slice(0, 300) } }];" }
  },
  output: [{ message: 'Background removal failed. Please try again.' }]
});

const respondError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.1,
  config: {
    name: 'Return Error',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify({ error: true, message: $json.message }) }}'),
      options: { responseCode: 500, responseHeaders: { entries: [ { name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' } ] } }
    }
  },
  output: [{}]
});

export default workflow('swarnix-bg-remove', 'Swarnix · Background Removal')
  .add(webhookTrigger)
  .to(prepareBinary)
  .to(rembgRemove.onError(handleError))
  .to(uploadCloudinary.onError(handleError))
  .to(prepareResponse)
  .to(respondSuccess)
  .add(handleError)
  .to(respondError);
