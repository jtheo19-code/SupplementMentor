---
name: Label scan "request aborted" is client-side, not a scan bug
description: How to interpret aborted POST /api/products/scan-label requests before touching scan code
---

# Label scan aborted requests

`POST /api/products/scan-label` showing up in api-server logs as **"request aborted" with `statusCode: null`** at sub-second times (e.g. 300–800ms) is a **client-side connection teardown**, NOT a server or vision-model failure. The vision call itself takes ~1.5–2s, so an abort at <1s means the browser tore the request down before the server could respond.

**Common triggers:** restarting the `api-server` workflow (its dev script is `build && start`, so it is briefly unavailable during a rebuild) or Vite HMR full-page reloads while files are being edited. Any in-flight scan during those windows aborts. There is no AbortController/timeout anywhere in the client fetch path (`custom-fetch.ts`) or generated code, so nothing in code cancels it.

**Why:** a user reported "scan not recognizing ingredients at all, worked prior" right after the api-server was restarted for an unrelated fix. It looked like a scan regression but the scan code was untouched; the aborts were transient interruptions from the restart/HMR.

**How to apply / verify before editing scan code:**
- Test the server directly with a real label image (ImageMagick can generate one: DejaVuSans font at `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`, draw supplement-facts text, base64, `curl -X POST localhost:80/api/products/scan-label`). A valid image returns HTTP 200 with extracted ingredients; a too-small/invalid image returns 400 `image_parse_error` ("Could not read that label"); a valid-but-textless image returns 400 "No ingredients could be read". These three outcomes confirm the pipeline is healthy.
- Distinguish the two 400 branches: catch branch = OpenAI threw (bad image / integration); empty-ingredients branch = OpenAI succeeded but read nothing.
- Model `gpt-5.4` is valid for chat completions vision. Body limit is 15mb. Client compresses to max 1280px JPEG q0.85.
- Clean up test rows afterward: `DELETE FROM products WHERE id LIKE 'scanned-%' AND name = 'Scanned label';`
