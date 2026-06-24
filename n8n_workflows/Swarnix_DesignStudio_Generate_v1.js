// Swarnix · Design Studio Generate — n8n Workflow SDK source
// Deployed as workflow id D6SPtEyrWtFORBTp (validated with validate_workflow).
//
// Flow: Webhook (POST /swarnix-design-generate, multipart) → Build Gemini Body
//   → Gemini Generate (Vertex AI gemini-2.5-flash-image) → Decode Image
//   → Upload to Cloudinary (unsigned preset, folder swarnix-designs)
//   → Respond { renders: [secure_url] }. Errors → Handle Error → Return Error (500).
//
// Manual setup after import:
//   1. Attach the "Vertex Service Account" (Google Service Account API / googleApi)
//      credential to the "Gemini Generate" node.
//   2. Activate the workflow.
// To switch to Nano Banana Pro later, change the model id in the Gemini Generate
// URL from gemini-2.5-flash-image to gemini-3-pro-image-preview (same endpoint).

import { workflow, node, trigger, newCredential, expr } from '@n8n/workflow-sdk';

const webhookTrigger = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'swarnix-design-generate',
      responseMode: 'responseNode',
      options: { allowedOrigins: '*' }
    }
  },
  output: [{ body: { owner_id: 'uuid', prompt: 'A single Ring crafted in 22K yellow gold.', mode: 'scratch', variation: '0' } }]
});

const buildGeminiBody = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Gemini Body',
    parameters: { mode: 'runOnceForAllItems', jsCode: "const j = $input.first().json;\nconst body = j.body || j;\nconst binary = $input.first().binary || {};\nconst ownerId = (body.owner_id || '').toString().trim();\nconst prompt = (body.prompt || '').toString();\nconst mode = (body.mode || 'scratch').toString();\nconst variation = (body.variation || '0').toString();\nif (!ownerId) throw new Error('Missing owner_id in request body');\nif (!prompt) throw new Error('Missing prompt in request body');\nconst promptText = variation === '1' ? prompt + ' Produce a fresh small variation of this design while keeping the same specifications.' : prompt;\nconst parts = [{ text: promptText }];\nlet outBinary;\nif (mode === 'reference') {\n  const key = binary.reference ? 'reference' : (binary.image ? 'image' : (binary.data ? 'data' : Object.keys(binary)[0]));\n  if (key) {\n    const buf = await this.helpers.getBinaryDataBuffer(0, key);\n    const b64 = buf.toString('base64');\n    const mimeType = (binary[key] && binary[key].mimeType) || 'image/png';\n    parts.push({ inlineData: { mimeType, data: b64 } });\n    outBinary = { reference: binary[key] };\n  }\n}\nconst geminiBody = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } };\nreturn [{ json: { ownerId, prompt: promptText, mode, variation, geminiBody }, binary: outBinary }];" }
  },
  output: [{ ownerId: 'uuid', mode: 'scratch', geminiBody: { contents: [] } }]
});

const geminiGenerate = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Gemini Generate',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0072450422/locations/global/publishers/google/models/gemini-2.5-flash-image:generateContent',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleApi',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.geminiBody) }}'),
      options: { timeout: 120000 }
    },
    credentials: { googleApi: newCredential('Vertex Service Account') }
  },
  output: [{ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'BASE64' } }] } }] }]
});

const decodeImage = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Decode Image',
    parameters: { mode: 'runOnceForAllItems', jsCode: "const resp = $input.first().json;\nconst cands = resp.candidates || [];\nlet b64 = null; let mime = 'image/png';\nfor (const c of cands) {\n  const parts = (c.content && c.content.parts) || [];\n  for (const p of parts) {\n    const d = p.inlineData || p.inline_data;\n    if (d && d.data) { b64 = d.data; mime = d.mimeType || d.mime_type || 'image/png'; break; }\n  }\n  if (b64) break;\n}\nif (!b64) throw new Error('Vertex response missing image data: ' + JSON.stringify(resp).slice(0, 300));\nconst binaryData = await this.helpers.prepareBinaryData(Buffer.from(b64, 'base64'), 'design.png', mime);\nreturn [{ json: { ok: true }, binary: { imageData: binaryData } }];" }
  },
  output: [{ ok: true }]
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
          { name: 'folder', value: 'swarnix-designs' },
          { name: 'tags', value: expr("{{ 'design,' + $('Build Gemini Body').item.json.ownerId }}") },
          { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'imageData' }
        ]
      },
      options: {}
    }
  },
  output: [{ secure_url: 'https://res.cloudinary.com/jewelleryinventory/image/upload/v1/swarnix-designs/design.png' }]
});

const prepareResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Response',
    parameters: { mode: 'runOnceForAllItems', jsCode: "const cloud = $input.first().json;\nconst prev = $('Build Gemini Body').item.json;\nconst resultUrl = cloud.secure_url || cloud.url || '';\nif (!resultUrl) throw new Error('Cloudinary upload returned no URL: ' + JSON.stringify(cloud).slice(0, 200));\nconst costUsd = 0.039;\nconst costInr = Math.round(costUsd * 84 * 100) / 100;\nreturn [{ json: { ownerId: prev.ownerId, mode: prev.mode, resultUrl, costUsd, costInr } }];" }
  },
  output: [{ resultUrl: 'https://res.cloudinary.com/...', costUsd: 0.039, costInr: 3.28 }]
});

const logToSupabase = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Log to Supabase',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://bigmdvjrvqyqzyrijdum.supabase.co/rest/v1/whatsapp_logs',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Prefer', value: 'return=minimal' },
        { name: 'apikey', value: expr('{{ $env.SUPABASE_SERVICE_KEY }}') },
        { name: 'Authorization', value: expr("{{ 'Bearer ' + $env.SUPABASE_SERVICE_KEY }}") }
      ] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ wa_from: $json.ownerId, feature: 'web_design_studio', cost_usd: $json.costUsd, cost_inr: $json.costInr, result_url: $json.resultUrl }) }}"),
      options: {}
    }
  },
  output: [{}]
});

const respondSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.1,
  config: {
    name: 'Respond Success',
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ JSON.stringify({ renders: [$('Prepare Response').item.json.resultUrl] }) }}"),
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
    parameters: { mode: 'runOnceForAllItems', jsCode: "const err = $input.first();\nconst msg = (err && err.json && (err.json.message || (err.json.error && err.json.error.message))) || 'Generation failed. Please try again.';\nreturn [{ json: { message: String(msg).slice(0, 300) } }];" }
  },
  output: [{ message: 'Generation failed. Please try again.' }]
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

export default workflow('swarnix-design-generate', 'Swarnix · Design Studio Generate')
  .add(webhookTrigger)
  .to(buildGeminiBody)
  .to(geminiGenerate.onError(handleError))
  .to(decodeImage)
  .to(uploadCloudinary.onError(handleError))
  .to(prepareResponse)
  .to(logToSupabase)
  .to(respondSuccess)
  .add(handleError)
  .to(respondError);
