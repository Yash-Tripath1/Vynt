# Mobile layout update — install and publish

Prepared against your published repository commit `6a83da328a45823b993fbc34c1431532055b0eac`.

## Changes

- Narrow portrait screens (up to 760 CSS px) initially use **4:3**, which is taller than 16:9 without making the controls excessively far away.
- An optional **3:4 portrait frame** appears on small screens. Desktop starts at 16:9 and retains its original frame selector. If you select portrait then enlarge the window, that selected mode remains available rather than disappearing.
- A user's selected ratio stays stable across resizing/rotation, especially while recording. This is intentionally not an auto-rotate feature.
- Preview, PNG exports and video exports all use the same chosen aspect ratio, not a CSS-stretched image. Changing the ratio crops the camera feed; it does not distort it. Camera hardware may deliver a different aspect ratio from the requested ideal, which is then center-cropped.
- Larger phone controls, compact side-by-side texture sliders, safe-area padding and swipeable filters.
- Existing camera, microphone and save logic is preserved. No dependencies, workflows or app version were changed.

### Separate files

- `src/App.mobile.css` — mobile styling; existing mobile rules were moved out of App.css.
- `src/cameraLayout.ts` — frame dimensions and the initial phone/desktop frame choice.
- `src/App.tsx` — small integration edits to use the helper, selector and stylesheet.
- `src/App.css` — desktop/base styling, without duplicated phone overrides.
- `tests/web.spec.ts` — additional mobile/export regression tests.
- `README.md` and this guide — documentation.

CSS alone cannot add a real portrait export, so the helper and App.tsx integration are necessary too. Copy all files in the update ZIP, not only the CSS file.

## Apply the update ZIP

1. In your existing Git-connected Vynt folder, commit or back up any personal edits first.
2. Run `git pull origin main` while your working tree is clean.
3. Extract `Vynt-mobile-update.zip` somewhere temporary.
4. Copy/merge its `src`, `tests`, and `docs` folders and its `README.md` **into your existing project root**, next to `package.json`. Replace the matching files. Keep every other file. Do not delete/replace your `.git` folder and do not create `src/src` accidentally.
5. Preview and check:

   ```bash
   npm run dev:web
   ```

   Open the shown localhost URL. Use the browser's responsive device toolbar for phone-size layout checks. Stop the dev server with Ctrl+C when finished.

   ```bash
   npm run lint
   npm run build:web
   ```

   If this is a fresh checkout without dependencies, run `npm ci` first using Node 22.12+.

## Publish the website change

Your GitHub Pages setup is already done. After checking the updated files:

```bash
git add src/App.tsx src/App.css src/App.mobile.css src/cameraLayout.ts tests/web.spec.ts README.md docs/MOBILE-UPDATE.md
git commit -m "Improve mobile framing and touch controls"
git push origin main
```

The existing **Deploy web demo** workflow automatically builds, tests and deploys. Look for a green run in the repository's Actions tab. Then refresh https://yash-tripath1.github.io/Vynt/ and test on your phone.

There is **no need** to re-enable Pages, re-upload the whole project through GitHub's website, create a tag or build a Windows installer for this web-only update. Package version stays 1.1.0 in this patch intentionally.

If a successful deployment still looks old, close/reopen the tab or try a private tab. On desktop, use Ctrl+Shift+R. If the workflow fails, inspect the failed step instead of assuming the update is live.

## Optional: release an updated Windows installer later

Your existing downloaded EXE does not change when you update the website. If you want the new code in a Windows release too, first finish and commit your changes. From a clean `main` working tree:

```bash
npm version patch -m "Release %s"
```

Starting from 1.1.0 this changes package.json/package-lock.json to 1.1.1, makes a version commit and creates tag `v1.1.1`. Before running it, update `docs/RELEASE-NOTES.md` to describe the new version (including any versioned installer filename in its text), and commit that change.

Then push:

```bash
git push origin main
git push origin v1.1.1
```

Use the actual new tag if your starting version is different. Never reuse the published v1.1.0 tag. The Windows workflow builds and attaches the new installer to a draft release. Test it on Windows and publish the draft. Users must download/install the new installer; there is no automatic desktop updater.

## Verification performed

- Lint and TypeScript/build checks passed.
- **11 Chromium browser tests passed**, including previous audio/download tests, 320/375/430 px layouts, desktop default selection, 900×1200 portrait PNG export, 480×640 video export with decodable non-silent microphone audio, and stable portrait recording dimensions after a viewport rotation.
- The updated desktop standby screenshot at 1280px matched the live site's screenshot pixel-for-pixel during this check.
- Media devices were synthetic. Physical iPhone/Android cameras, Safari and real device rotation still need testing. This update does not claim new browser compatibility.
- These local files have not been pushed or deployed on your behalf.
