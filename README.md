# Tori's Glam Studio

A live makeup mirror for Tori. Point the tablet at a face (hers, or anyone's), tap makeup and costumes, and they stick to the face as it moves. Snap a picture; it lands in her on-tablet gallery.

## How it works
- **Face tracking:** MediaPipe Face Landmarker (478 points + blendshapes), up to 4 faces, running in the browser. Vendored in `vendor/` so nothing loads from a CDN.
- **Drawing:** everything is drawn in code on a canvas (`looks.js`). Makeup uses the face mesh (lips, lids, cheeks); costumes are positioned in face-local units (1 = face width) and roll with the head.
- **Reactions:** open your mouth and the puppy tongue comes out; raise your eyebrows and the ears perk up; smile and the mustache curls.
- **Privacy:** the camera feed never leaves the device. Photos are stored in IndexedDB on the tablet. Share goes through Android's share sheet, and only when someone taps it.

## Rules
- This app only **adds** to a face. No skin smoothing, lightening, slimming or reshaping, ever.
- Colors are chosen to read on deep brown skin first.

## Run locally
```
python -m http.server 5226 --directory C:/Users/Terre/Code/tori-glam-studio
```
- `http://localhost:5226/`: the real app (needs a webcam)
- `?demo&go`: uses `test/face.jpg` instead of the camera. `&jaw=0.7` fakes an open mouth; `&mirror` mirrors it.
- `node test/shoot.cjs`: headless screenshots into `test/shots/` (`test/` is gitignored; the test face is a client asset, not for publishing).

## Camera needs HTTPS
Android Chrome blocks the camera on plain `http://192.168…` addresses. To use it on the tablet, host it (GitHub Pages, like Puppet Show). After the first visit it works offline (`sw.js`).

## Files
| File | What |
|---|---|
| `app.js` | camera, model, render loop, drawers, shutter, gallery UI |
| `face.js` | landmark smoothing + face identity across frames |
| `looks.js` | every makeup item and costume |
| `sfx.js` | synthesized sounds (no audio files) |
| `gallery.js` | IndexedDB photo store |
