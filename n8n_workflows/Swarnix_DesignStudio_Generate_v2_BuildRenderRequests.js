// Swarnix Studio · Generate Jewellery v2 (Design Pack) — "Build Render Requests" Code node
// Live workflow id: A8DzNIHwHw75JwJt  ·  Webhook: POST /swarnix-design-generate-v2
//
// This file is a REFERENCE COPY of the "Build Render Requests" node's jsCode as
// deployed in n8n. The workflow itself was built via the n8n MCP builder and its
// source of truth lives in n8n (edit + publish there); this file exists so the
// prompt logic is reviewable in the repo.
//
// 2026-07-15 fix — reference-mode (Mode B) was returning a line drawing when the
// jeweller uploaded a hand-drawn sketch: Gemini 2.5-flash-image copies the MEDIUM
// of the attached reference unless explicitly told not to. The REFERENCE_OVERRIDE
// block below (prepended to the HERO prompt only when a reference image is present)
// forces the model to treat the reference as design/shape guidance and render a
// real, photographed gold-and-gemstone piece. Verified end-to-end: a crude B/W
// sketch now yields a photorealistic 22K gold + diamond necklace set.
//
// Node input:  Compile Brief (Gemini text) output + Parse Input ($('Parse Input'))
// Node output: one item per render (hero / grid / dimensions), each with geminiBody.

const resp = $input.first().json;
const prev = $('Parse Input').first().json;

// Extract compiled brief; fall back to raw prompt if the compiler returned nothing
let brief = '';
try {
  const parts = (resp.candidates && resp.candidates[0] && resp.candidates[0].content && resp.candidates[0].content.parts) || [];
  brief = parts.map(p => p.text || '').join(' ').trim();
} catch (e) { /* fall through */ }
if (!brief) brief = prev.rawPrompt;

const HERO_SUFFIX = "Ultra-photorealistic luxury jewellery catalogue photograph, macro lens, f/8, razor-sharp focus across the entire piece. Seamless neutral light-grey studio background with a soft vertical gradient. Soft diffused key light plus controlled specular highlights tracing the polished metal; diamonds show crisp internal fire and scintillation without blown-out glare. The piece fills about 70% of a square frame.\n\nCRITICAL AUTHENTICITY REQUIREMENTS - the image must be indistinguishable from a photograph of a real, physically manufactured piece of fine jewellery displayed in a premium Indian jewellery showroom: perfect left-right mirror symmetry about the vertical centre axis; all repeated components exactly identical; stones within each row calibrated to the same shape and size; every stone secured in a correctly built visible setting; every connection a real hinge, link or jump ring; necklaces built from articulated links that could physically drape. Earrings must be an exactly matched mirror pair with identical stone counts and identical drops. Absolutely no random asymmetric stone scatter, no melted or ambiguous metalwork, no floating elements, no mismatched pairs. No model, no hands, no props, no text, no watermark, no hallmark stamps.";
const GRID_SUFFIX = "A manufacturing reference sheet for a jewellery workshop: one image divided into a clean 2x2 grid on a pure white background. All four quadrants show the IDENTICAL piece - same stone count, same proportions, same details - from different angles. Top-left: top/plan view. Top-right: front elevation. Bottom-left: three-quarter perspective view. Bottom-right: back view showing the gallery, basket, prong undersides and clasp/fitting construction. Thin light-grey divider lines between quadrants; a small neat caption beneath each quadrant reading TOP VIEW, FRONT VIEW, 3/4 VIEW, BACK VIEW. Flat, even, shadowless studio lighting for maximum clarity of construction detail. The piece must look like a real manufactured design: perfect bilateral mirror symmetry, identical repeated components, calibrated matched stones in every row, articulated links, every element physically connected. CAD-render precision, catalogue sharpness. No other text, no watermark.";
const DIM_PREFIX = "A technical specification sheet in jewellery CAD style: the piece rendered in clean front elevation on a pure white background, overlaid with thin dark-grey engineering dimension callout lines with arrowheads at both ends. Label the measurements exactly as follows: ";
const DIM_END = ". Neat, minimal engineering-drawing typography for the labels. The piece's proportions visually respect these stated measurements. Flat even lighting, CAD-render precision. No other text, no watermark.";

// Reference-mode override. When the jeweller uploads a reference (very often a
// hand-drawn pencil sketch on paper), Gemini tends to copy the MEDIUM of the
// input and hand back another line drawing. This block, prepended to the prompt
// only when a reference image is attached, forces the model to treat the
// reference purely as design/shape guidance and to render a real, photographed,
// finished gold-and-gemstone piece instead of reproducing the drawing.
const REFERENCE_OVERRIDE = "THE ATTACHED REFERENCE IMAGE IS A DESIGN GUIDE ONLY - most likely a hand-drawn pencil sketch, line drawing, CAD outline or rough photo. Use it ONLY to copy the overall silhouette, layout, motif structure and proportions of the piece. DO NOT reproduce the reference's medium, drawing style, paper, pencil lines, sketch shading, outlines or flat colouring in any way. You must MANUFACTURE and PHOTOGRAPH the piece: output a fully realised, three-dimensional, physically real piece of fine jewellery rendered in actual polished metal and faceted gemstones exactly as specified below - real gold with true metallic reflections, real diamonds and stones with genuine facets, fire and depth, set in real prongs and settings. The result must look like a professional studio photograph of the finished manufactured jewellery, NOT like the sketch. Follow the material, stone and colour specification in the brief precisely, even where the sketch is only black-and-white line art.\n\n";

// Upsell variants: same framing, but explicitly anchored to the attached
// reference image (the already-generated hero) as the ONLY source of truth
// for the design, instead of assuming a fresh same-session generation.
const GRID_SUFFIX_UPSELL = "Using the exact piece of jewellery shown in the attached reference image as the ONLY visual truth for its design, materials, stone layout and proportions - do not alter, reinterpret or redesign it in any way - produce a manufacturing reference sheet: one image divided into a clean 2x2 grid on a pure white background. All four quadrants show the IDENTICAL piece from the reference image - same stone count, same proportions, same details - from different angles. Top-left: top/plan view. Top-right: front elevation. Bottom-left: three-quarter perspective view. Bottom-right: back view showing the gallery, basket, prong undersides and clasp/fitting construction. Thin light-grey divider lines between quadrants; a small neat caption beneath each quadrant reading TOP VIEW, FRONT VIEW, 3/4 VIEW, BACK VIEW. Flat, even, shadowless studio lighting for maximum clarity of construction detail. Preserve perfect bilateral mirror symmetry, identical repeated components, calibrated matched stones in every row, articulated links, every element physically connected, exactly as shown in the reference. CAD-render precision, catalogue sharpness. No other text, no watermark.";
const DIM_PREFIX_UPSELL = "Using the exact piece of jewellery shown in the attached reference image as the ONLY visual truth for its design - do not alter, reinterpret or redesign it in any way - produce a technical specification sheet in jewellery CAD style: the SAME piece from the reference image rendered in clean front elevation on a pure white background, overlaid with thin dark-grey engineering dimension callout lines with arrowheads at both ends. Label the measurements exactly as follows: ";

function dimLabels(d) {
  return Object.entries(d)
    .map(([k, v]) => {
      const label = k.replace(/_/g, ' ').replace(/\bmm\b/gi, '').replace(/\s+/g, ' ').trim();
      return label + ': ' + v + ' mm';
    })
    .join('; ');
}

// isHero controls whether the reference override is applied. The override is a
// hero-only instruction: it turns a sketch into a photographed piece. The
// grid/dimension renders in reference mode already carry their own "use the
// reference exactly" framing and must not be told to ignore the medium.
function makeBody(text, isHero) {
  let finalText = text;
  if (prev.refB64 && prev.mode === 'reference' && isHero) {
    finalText = REFERENCE_OVERRIDE + text;
  }
  const parts = [{ text: finalText }];
  if (prev.refB64) parts.push({ inlineData: { mimeType: prev.refMime, data: prev.refB64 } });
  return { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } };
}

const isUpsell = prev.mode === 'upsell';
const items = [];

// Upsell mode skips the hero entirely — it reuses the already-generated one.
if (!isUpsell) {
  items.push({ json: { render_type: 'hero', ownerId: prev.ownerId, mode: prev.mode, views: prev.views, brief, geminiBody: makeBody(brief + '\n\n' + HERO_SUFFIX, true) } });
}

if (prev.views === 'pack') {
  const gridSuffix = isUpsell ? GRID_SUFFIX_UPSELL : GRID_SUFFIX;
  items.push({ json: { render_type: 'grid', ownerId: prev.ownerId, mode: prev.mode, views: prev.views, brief, geminiBody: makeBody(brief + '\n\n' + gridSuffix, false) } });
  if (prev.dimensions) {
    const dimPrefix = isUpsell ? DIM_PREFIX_UPSELL : DIM_PREFIX;
    const dimText = dimPrefix + dimLabels(prev.dimensions) + DIM_END;
    items.push({ json: { render_type: 'dimensions', ownerId: prev.ownerId, mode: prev.mode, views: prev.views, brief, geminiBody: makeBody(brief + '\n\n' + dimText, false) } });
  }
}

return items;
