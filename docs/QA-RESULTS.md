# Local verification — VYNT 1.1.0 preparation

Date: September 26, 2026. Source inspected: `c74d23cf152659c5b31a800790a87b48d407d5a8`.

## Passed here

- `npm run lint` — no errors/warnings.
- `npm run build:web` — includes TypeScript checks for app/Electron and Vite configuration.
- `npm run test:e2e` — **6 browser tests passed** in Playwright Chromium on Linux:
  1. App loads without Electron; PNG download has a valid signature; camera tracks stop.
  2. MIC ON exports a decodable 640×360 video with non-silent, decodable audio; microphone tracks stop; recording can restart.
  3. MIC OFF exports a decodable video with only a video input track; recording can restart.
  4. Denied microphone permission is explained; silent recording remains possible.
  5. Denied camera permission shows recovery instructions.
  6. 375px mobile viewport has no horizontal document overflow; TURN OFF remains visible.
- `npx vite build` — builds renderer, Electron main and CommonJS sandbox-compatible preload.
- `xvfb-run -a npm run test:desktop` — **1 Electron smoke test passed** on Linux: bridge exists, malformed photo request rejected, real PNG/video filesystem writes through IPC, exported video contains decodable non-silent audio, save cancellation works. Only the OS save picker was stubbed.
- `npm audit` — reported **0 known vulnerabilities** for the locked dependency tree at verification time. This is not a full security audit.
- Manual screenshot inspection of the browser interface; no browser page errors during the preview check.

Media tests used Chromium/Electron synthetic camera and microphone devices, not a real webcam or human voice. Final physical-device testing remains required.

## Size measured

Static web output: **190,216 bytes total** across HTML, CSS, JS, icons and privacy notice (about 190 KB, before HTTP compression). Main JavaScript: 159.77 KB / 52.64 KB gzip reported by Vite.

This is **not a Windows installer-size measurement**. The site uses the visitor's browser instead of shipping Chromium. No new Windows installer was built/measured here, and no installer shrinkage claim has been made. Updating Electron can offset compression/locales savings.

## Not verified here

- Windows installer build execution, signing, installation, upgrade or uninstall.
- Physical camera/microphone permissions, device unplug scenarios and audio/video synchronisation on real devices.
- Safari/iOS/Android, all supported codecs, and device-specific download behaviour.
- Five-minute duration/size safeguards under real low-memory conditions.
- Public GitHub Pages deployment, GitHub release publication or any store submission.

Complete `docs/PUBLISHING.md` before publishing. The included Windows workflow is prepared to build and run the desktop smoke test on Windows, but it has not run in the user's GitHub account.
