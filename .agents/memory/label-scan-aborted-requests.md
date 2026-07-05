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

## When the user insists scan is broken but curl + file-upload E2E both pass

The one path those tests do NOT exercise is the **real mobile-camera photo decode/compress in the browser** (curl skips the client entirely; Playwright `setInputFiles` uploads an already-decodable JPEG). If production/dev logs show **no recent `scan-label` POST at all** while the user reports failure, the request is dying **on-device before it is sent** — i.e. inside `compressImageToBase64`, not the server.

Likely on-device causes: iPhone **HEIC** the browser can't decode into `<img>`, EXIF-orientation/decode races where `<img>.onload` fires with width/height still 0, or canvas memory pressure on huge photos. Hardening: decode with `createImageBitmap(file, {imageOrientation:"from-image"})` first (fully-decoded + orientation-correct, closes the 0×0 race) with an `<img>`+`FileReader`+`img.decode()` fallback; guard empty dimensions and empty base64; surface the real error in the toast; add `[scan]` console diagnostics. Always `bitmap.close()` in a `finally`.

Also: a client-visible fix (like the above) only reaches the user's phone after a **republish** — a user testing the published app has the old build regardless of dev changes.

## Blend-timing change did NOT touch scan

A user tied a scan failure to the "keep all ingredients in a bottle together" (blend) work. That commit changed **only** `timingEngine.ts` (server, runs on `/api/timing-map`) + memory files — nothing in the scan/client path. Verify with `git show <commit> --stat` before accepting a claimed correlation; the timing engine runs later (on the map step), not at scan time.
