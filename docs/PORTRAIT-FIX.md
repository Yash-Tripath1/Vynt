# 3:4 button visibility fix

## What was checked

The live GitHub Pages deployment was successful and its JavaScript contained the 3:4 option. However, its CSS hid the button globally and showed it only inside a small-screen media query. The deployed CSS also used newer media-query range syntax. The exact reason that this user's phone did not match/render that rule is not confirmed without its browser/version.

## Fix

- Remove the conditional mobile-only class from the frame button.
- Remove the CSS visibility restriction. All three frame options are always available.
- Keep the desktop 16:9 default and narrow portrait-screen 4:3 default.
- Set an explicit CSS target so the production build retains classic max-width media queries instead of newer range syntax. This is not a general promise of support for older browsers.
- Update the desktop automated test: it must now expect 3:4 to be visible, otherwise the Pages workflow would reject the change.

All 11 Chromium browser tests passed, along with lint and TypeScript/build checks. The output stylesheet was checked: it contains classic max-width:760px queries and no mobile-frame-option hiding rule. Physical phone/browser verification remains needed.

## Apply and publish

Back up or commit your local edits first. Extract Vynt-portrait-visibility-fix.zip, then copy ALL its contents into the existing Vynt project root, beside package.json. Merge folders and replace matching files. Keep all other files and the .git folder. Do not upload the ZIP itself to the repository.

Run:

```bash
npm run lint
npm run build:web
git add src/App.tsx src/App.mobile.css tests/web.spec.ts vite.config.ts README.md docs/MOBILE-UPDATE.md docs/PORTRAIT-FIX.md
git commit -m "Make portrait frame visible on all devices"
git push origin main
```

Wait for the NEW Deploy web demo run to succeed in GitHub Actions. Reload the live site; FRAME should show 16:9, 4:3, 3:4 and DATE OFF. No new EXE or release tag is needed.

These files have not been pushed or deployed on your behalf. If the option is still absent after this fix is successfully deployed, send a screenshot of the FRAME section plus your phone model and browser/version so the actual device-specific behaviour can be investigated.
